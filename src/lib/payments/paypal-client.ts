import { z } from "zod";
import { PAYPAL_SANDBOX_ORIGIN, type PayPalConfig } from "./config";
import {
  captureSchema,
  orderSchema,
  providerId,
  receiptSchema,
  refundSchema,
  type PayPalGateway,
} from "./contracts";

export class ProviderError extends Error {
  constructor(
    public readonly code: string,
    public readonly ambiguous: boolean,
    public readonly retryable: boolean,
    public readonly httpStatus?: number,
    public readonly debugId?: string,
  ) {
    super(`PayPal sandbox request could not be verified (${code})`);
  }
}
const safeCode = (value: unknown) =>
  typeof value === "string" && /^[A-Z0-9_]{1,100}$/.test(value)
    ? value
    : "PROVIDER_ERROR";

/** Fixed sandbox host. No financial POST is automatically retried. */
export class PayPalClient implements PayPalGateway {
  private token?: { value: string; expiresAt: number };
  private obtaining?: Promise<string>;
  constructor(
    private readonly config: Pick<PayPalConfig, "clientId" | "clientSecret">,
    private readonly transport: typeof fetch = fetch,
    private readonly timeoutMs = 12000,
  ) {}

  /** Diagnostic only: prove Sandbox OAuth succeeds without exposing the bearer token. */
  async verifyAuthentication() {
    await this.accessToken();
    return { environment: "sandbox" as const, authenticated: true as const };
  }

  private async exchange(
    path: string,
    init: RequestInit,
    financial: boolean,
  ): Promise<unknown> {
    try {
      const response = await this.transport(PAYPAL_SANDBOX_ORIGIN + path, {
        ...init,
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: "error",
        cache: "no-store",
      });
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      if (reader)
        try {
          for (;;) {
            const part = await reader.read();
            if (part.done) break;
            length += part.value.byteLength;
            if (length > 1024 * 1024) {
              await reader.cancel();
              throw new Error();
            }
            chunks.push(part.value);
          }
        } finally {
          reader.releaseLock();
        }
      let body: unknown;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        throw new ProviderError(
          "INVALID_RESPONSE",
          financial,
          true,
          response.status,
        );
      }
      if (!response.ok) {
        const data = z
          .object({
            name: z.unknown().optional(),
            details: z
              .array(z.object({ issue: z.unknown().optional() }))
              .optional(),
          })
          .safeParse(body);
        const debug = response.headers.get("paypal-debug-id") ?? undefined;
        throw new ProviderError(
          safeCode(
            data.success
              ? (data.data.details?.[0]?.issue ?? data.data.name)
              : undefined,
          ),
          financial,
          response.status >= 500 || [401, 408, 429].includes(response.status),
          response.status,
          debug && /^[a-zA-Z0-9-]{1,100}$/.test(debug) ? debug : undefined,
        );
      }
      return body;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError("NETWORK_OR_TIMEOUT", financial, true);
    }
  }

  private async accessToken() {
    if (this.token && this.token.expiresAt > Date.now())
      return this.token.value;
    if (this.obtaining) return this.obtaining;
    this.obtaining = (async () => {
      const body = await this.exchange(
        "/v1/oauth2/token",
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: "grant_type=client_credentials",
        },
        false,
      );
      const result = z
        .object({
          access_token: z.string().min(1),
          token_type: z.literal("Bearer"),
          expires_in: z.number().positive(),
        })
        .safeParse(body);
      if (!result.success)
        throw new ProviderError("INVALID_OAUTH_RESPONSE", false, false);
      this.token = {
        value: result.data.access_token,
        expiresAt: Date.now() + Math.max(0, result.data.expires_in - 60) * 1000,
      };
      return this.token.value;
    })();
    try {
      return await this.obtaining;
    } finally {
      this.obtaining = undefined;
    }
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    schema: z.ZodType<T>,
    payload?: unknown,
    requestId?: string,
  ) {
    for (let attempt = 0; ; attempt++) {
      try {
        const token = await this.accessToken();
        const body = await this.exchange(
          path,
          {
            method,
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              Prefer: "return=representation",
              ...(requestId
                ? { "PayPal-Request-Id": z.uuid().parse(requestId) }
                : {}),
            },
            ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
          },
          method === "POST",
        );
        const parsed = schema.safeParse(body);
        if (!parsed.success)
          throw new ProviderError("INVALID_RESOURCE", method === "POST", false);
        return parsed.data;
      } catch (error) {
        if (error instanceof ProviderError && error.httpStatus === 401)
          this.token = undefined;
        // Only one retry of read-only reconciliation; never a payment POST replay.
        if (
          method === "GET" &&
          attempt === 0 &&
          error instanceof ProviderError &&
          error.retryable
        )
          continue;
        throw error;
      }
    }
  }
  createOrder(payload: Record<string, unknown>, key: string) {
    return this.request(
      "POST",
      "/v2/checkout/orders",
      receiptSchema,
      payload,
      key,
    );
  }
  getOrder(id: string) {
    return this.request(
      "GET",
      `/v2/checkout/orders/${providerId.parse(id)}`,
      orderSchema,
    );
  }
  captureOrder(id: string, key: string) {
    return this.request(
      "POST",
      `/v2/checkout/orders/${providerId.parse(id)}/capture`,
      receiptSchema,
      {},
      key,
    );
  }
  getCapture(id: string) {
    return this.request(
      "GET",
      `/v2/payments/captures/${providerId.parse(id)}`,
      captureSchema,
    );
  }
  refundCapture(id: string, payload: Record<string, unknown>, key: string) {
    return this.request(
      "POST",
      `/v2/payments/captures/${providerId.parse(id)}/refund`,
      receiptSchema,
      payload,
      key,
    );
  }
  getRefund(id: string) {
    return this.request(
      "GET",
      `/v2/payments/refunds/${providerId.parse(id)}`,
      refundSchema,
    );
  }
  async verifyWebhook(payload: Record<string, unknown>) {
    const result = await this.request(
      "POST",
      "/v1/notifications/verify-webhook-signature",
      z.object({ verification_status: z.enum(["SUCCESS", "FAILURE"]) }),
      payload,
    );
    return result.verification_status === "SUCCESS";
  }
}
