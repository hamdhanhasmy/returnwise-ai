import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { SESSION_COOKIE } from "@/lib/auth/tokens";
import { configuredOrigin, isTrustedOrigin } from "@/lib/validation/http";
import { findPrincipal } from "./services/auth";
import { invariant, PaymentError } from "./services/payment-rules";
import { ProviderError } from "@/lib/payments/paypal-client";

export async function paymentActor(request: Request) {
  const principal = await findPrincipal(
    getDb(),
    (await cookies()).get(SESSION_COOKIE)?.value,
  );
  invariant(principal, "UNAUTHENTICATED", "Sign in to continue", 401);
  invariant(
    isTrustedOrigin(request, configuredOrigin()),
    "FORBIDDEN",
    "Request origin is not allowed",
    403,
  );
  invariant(
    principal.role === "ADMIN",
    "FORBIDDEN",
    "Administrator payment authorization required",
    403,
  );
  return principal;
}
export async function readJson(
  request: Request,
  limit = 8192,
): Promise<unknown> {
  invariant(
    request.headers.get("content-type")?.split(";")[0]?.trim() ===
      "application/json",
    "INVALID_BODY",
    "JSON body required",
    415,
  );
  const reader = request.body?.getReader();
  invariant(reader, "INVALID_BODY", "Request body required", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new PaymentError("INVALID_BODY", "Request body too large", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new PaymentError("INVALID_BODY", "Invalid JSON", 400);
  }
}
export function json(value: unknown, status = 200) {
  return new Response(
    JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    },
  );
}
export function paymentFailure(error: unknown) {
  if (error instanceof PaymentError)
    return json({ code: error.code, error: error.message }, error.status);
  if (error instanceof z.ZodError)
    return json(
      {
        code: "INVALID_INPUT",
        error: "Check the required fields and USD amount.",
      },
      400,
    );
  if (error instanceof ProviderError)
    return json(
      {
        code: error.code,
        error:
          "PayPal response is unverified. Open the transaction and reconcile before another attempt.",
        debugId: error.debugId,
      },
      502,
    );
  return json(
    {
      code: "UNAVAILABLE",
      error:
        "Payment service is unavailable or unconfigured. No success has been assumed; check the transaction before retrying.",
    },
    503,
  );
}
