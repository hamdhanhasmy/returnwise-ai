import { z } from "zod";
import { PaymentError } from "./services/payment-rules";
import { json } from "./payment-http";
export function analyticsFailure(error: unknown) {
  if (error instanceof PaymentError)
    return json({ code: error.code, error: error.message }, error.status);
  if (error instanceof z.ZodError)
    return json(
      {
        code: "INVALID_INPUT",
        error:
          "Check the analytics filters, question and consent. Only supported read-only fields are accepted.",
      },
      400,
    );
  return json(
    {
      code: "ANALYTICS_UNAVAILABLE",
      error:
        "Analytics is temporarily unavailable. Use manual review or retry after checking the connection and configuration.",
    },
    503,
  );
}
