import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { SESSION_COOKIE } from "@/lib/auth/tokens";
import { isTrustedOrigin, configuredOrigin } from "@/lib/validation/http";
import { findPrincipal } from "./services/auth";
import { invariant, PaymentError } from "./services/payment-rules";
import { json } from "./payment-http";
export function requireReturnOrigin(request: Request) {
  invariant(
    isTrustedOrigin(request, configuredOrigin()),
    "FORBIDDEN",
    "Request origin is not allowed",
    403,
  );
}
export async function returnActor(request: Request) {
  const p = await findPrincipal(
    getDb(),
    (await cookies()).get(SESSION_COOKIE)?.value,
  );
  invariant(p, "UNAUTHENTICATED", "Sign in to continue", 401);
  requireReturnOrigin(request);
  invariant(
    p.role === "ADMIN",
    "FORBIDDEN",
    "Merchant administrator required",
    403,
  );
  return p;
}
export function returnFailure(error: unknown) {
  if (error instanceof PaymentError)
    return json({ code: error.code, error: error.message }, error.status);
  if (error instanceof z.ZodError)
    return json(
      {
        code: "INVALID_INPUT",
        error:
          "Check required fields, policy limits and non-negative amounts. No change was saved.",
      },
      400,
    );
  return json(
    {
      code: "UNAVAILABLE",
      error:
          "The return workspace is unavailable. Refresh before retrying and check any existing refund status separately.",
    },
    503,
  );
}
