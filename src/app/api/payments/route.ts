import { z } from "zod";
import { paymentService } from "@/server/paypal";
import {
  json,
  paymentActor,
  paymentFailure,
  readJson,
} from "@/server/payment-http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const actor = await paymentActor(request);
    const input = z
      .object({ productId: z.uuid(), checkoutKey: z.uuid() })
      .strict()
      .parse(await readJson(request));
    const payment = await paymentService().create(
      actor,
      input.productId,
      input.checkoutKey,
    );
    return json({
      paymentId: payment.id,
      orderId: payment.paypalOrderId,
      status: payment.status,
    });
  } catch (error) {
    return paymentFailure(error);
  }
}
