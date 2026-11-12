import { z } from "zod";
import { paymentService } from "@/server/paypal";
import { json, paymentFailure, readJson } from "@/server/payment-http";
import { configuredOrigin, isTrustedOrigin } from "@/lib/validation/http";
import { invariant } from "@/server/services/payment-rules";
export async function POST(request: Request) {
  try {
    invariant(
      isTrustedOrigin(request, configuredOrigin()),
      "FORBIDDEN",
      "Request origin is not allowed",
      403,
    );
    const input = z
      .object({ token: z.string().max(128), accept: z.boolean() })
      .strict()
      .parse(await readJson(request));
    return json(await paymentService().consent(input.token, input.accept));
  } catch (error) {
    return paymentFailure(error);
  }
}
