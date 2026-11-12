import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { PayPalClient } from "@/lib/payments/paypal-client";
import {
  paypalConfig,
  paypalCredentials,
  PAYPAL_SANDBOX_ORIGIN,
} from "@/lib/payments/config";
import {
  refundSchema,
  usdDecimal,
  refundAmountSchema,
} from "@/lib/payments/contracts";
import { digest, refundCaptureId } from "@/server/services/payment-rules";
const config = {
  clientId: "test-client-id",
  clientSecret: "test-secret-private",
  merchantId: "TESTMERCHANT123",
  webhookId: "registered-test",
};
const oauth = () =>
  Response.json({
    access_token: "private-test-token",
    token_type: "Bearer",
    expires_in: 3600,
  });
describe("PayPal adapter (mock HTTP, no Sandbox requests)", () => {
  it("OAuth diagnostics do not expose bearer tokens or require merchant binding", async () => {
    const credentials = paypalCredentials({
      PAYPAL_ENV: "sandbox",
      PAYPAL_CLIENT_ID: config.clientId,
      PAYPAL_CLIENT_SECRET: config.clientSecret,
    });
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(oauth());
    const result = await new PayPalClient(
      credentials,
      transport,
    ).verifyAuthentication();
    expect(result).toEqual({ environment: "sandbox", authenticated: true });
    expect(JSON.stringify(result)).not.toContain("private-test-token");
    expect(transport).toHaveBeenCalledTimes(1);
    expect(() =>
      paypalCredentials({
        PAYPAL_ENV: "live",
        PAYPAL_CLIENT_ID: config.clientId,
        PAYPAL_CLIENT_SECRET: config.clientSecret,
      }),
    ).toThrow();
  });
  it("sandbox configuration fails closed and never reveals secret values", () => {
    for (const input of [
      {},
      { PAYPAL_ENV: "live", PAYPAL_CLIENT_SECRET: "never-log-this" },
    ])
      expect(() => paypalConfig(input)).toThrow(
        "configuration is missing or invalid",
      );
    expect(
      paypalConfig({
        PAYPAL_ENV: "sandbox",
        PAYPAL_CLIENT_ID: config.clientId,
        PAYPAL_CLIENT_SECRET: config.clientSecret,
        PAYPAL_MERCHANT_ID: config.merchantId,
      }).merchantId,
    ).toBe(config.merchantId);
  });
  it("creates an order on fixed Sandbox host with cached OAuth and stable operation key", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(oauth())
      .mockResolvedValueOnce(Response.json({ id: "ORDER1", status: "CREATED" }))
      .mockResolvedValueOnce(
        Response.json({ id: "ORDER2", status: "CREATED" }),
      );
    const client = new PayPalClient(config, transport),
      key = randomUUID();
    await client.createOrder({ intent: "CAPTURE" }, key);
    await client.createOrder({ intent: "CAPTURE" }, randomUUID());
    expect(transport).toHaveBeenCalledTimes(3);
    expect(transport.mock.calls[0]![0]).toBe(
      `${PAYPAL_SANDBOX_ORIGIN}/v1/oauth2/token`,
    );
    const [url, options] = transport.mock.calls[1]!;
    expect(url).toBe(`${PAYPAL_SANDBOX_ORIGIN}/v2/checkout/orders`);
    expect(options?.headers).toMatchObject({ "PayPal-Request-Id": key });
    expect(options?.redirect).toBe("error");
  });
  it("does not retry ambiguous financial POSTs or leak response text", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(oauth())
      .mockResolvedValueOnce(
        Response.json(
          { name: "INTERNAL_SERVER_ERROR", message: "secret customer details" },
          { status: 500 },
        ),
      );
    const client = new PayPalClient(config, transport);
    await expect(
      client.refundCapture("CAP1", {}, randomUUID()),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", ambiguous: true });
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it("network timeout aborts financial request without replay", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(oauth())
      .mockImplementationOnce(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new Error("timeout private details")),
            );
          }),
      );
    const client = new PayPalClient(config, transport, 10);
    await expect(
      client.captureOrder("ORDER1", randomUUID()),
    ).rejects.toMatchObject({ code: "NETWORK_OR_TIMEOUT", ambiguous: true });
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it("retries read-only lookup once and rejects currency mismatches", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(oauth())
      .mockResolvedValueOnce(
        Response.json({ name: "TEMPORARY" }, { status: 503 }),
      )
      .mockResolvedValueOnce(
        Response.json({
          id: "CAP1",
          status: "COMPLETED",
          amount: { currency_code: "EUR", value: "1.00" },
        }),
      );
    await expect(
      new PayPalClient(config, transport).getCapture("CAP1"),
    ).rejects.toMatchObject({ code: "INVALID_RESOURCE" });
    expect(transport).toHaveBeenCalledTimes(3);
  });
  it("rejects malformed success responses instead of claiming completion", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(oauth())
      .mockResolvedValueOnce(Response.json({ status: "COMPLETED" }));
    await expect(
      new PayPalClient(config, transport).refundCapture(
        "CAP1",
        {},
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "INVALID_RESOURCE", ambiguous: true });
  });
  it("webhook verification uses the registered ID and original event", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(oauth())
      .mockResolvedValueOnce(Response.json({ verification_status: "FAILURE" }));
    const payload = {
      webhook_id: "registered",
      webhook_event: {
        resource: { amount: { value: "1.00" } },
        extra: "preserved",
      },
    };
    expect(
      await new PayPalClient(config, transport).verifyWebhook(payload),
    ).toBe(false);
    expect(JSON.parse(transport.mock.calls[1]![1]!.body as string)).toEqual(
      payload,
    );
  });
  it("rejects unsafe provider references before resource requests", async () => {
    const transport = vi.fn<typeof fetch>();
    expect(() =>
      new PayPalClient(config, transport).getCapture("../live"),
    ).toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
});
describe("deterministic financial serialization", () => {
  it("normalizes human decimals as strings and rejects rounding or exponent notation", () => {
    expect(refundAmountSchema.parse("20")).toBe("20.00");
    expect(refundAmountSchema.parse("20.1")).toBe("20.10");
    for (const value of ["0", "-1", "1.001", "1e2", "1000.01", "01.00"])
      expect(refundAmountSchema.safeParse(value).success).toBe(false);
  });
  it("canonical request hash survives jsonb key reordering", () => {
    expect(digest({ b: 2, a: { y: 1, x: [1, 2] } })).toBe(
      digest({ a: { x: [1, 2], y: 1 }, b: 2 }),
    );
    expect(digest({ a: [1, 2] })).not.toBe(digest({ a: [2, 1] }));
  });
  it.each([
    [1n, "0.01"],
    [100n, "1.00"],
    [2999n, "29.99"],
    [100000n, "1000.00"],
  ])("formats %s minor units exactly", (minor, value) => {
    expect(usdDecimal(minor)).toBe(value);
  });
  it("rejects invalid money and foreign capture links", () => {
    expect(() => usdDecimal(0n)).toThrow();
    expect(() => usdDecimal(100001n)).toThrow();
    const r = refundSchema.parse({
      id: "R1",
      status: "COMPLETED",
      amount: { currency_code: "USD", value: "1.00" },
      links: [
        { rel: "up", href: "https://api-m.paypal.com/v2/payments/captures/C1" },
      ],
    });
    expect(() => refundCaptureId(r)).toThrow();
  });
});
