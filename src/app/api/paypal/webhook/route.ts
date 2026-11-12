import { webhookService } from "@/server/paypal";
import { json, paymentFailure, readJson } from "@/server/payment-http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    return json(
      await webhookService().receive(
        request.headers,
        await readJson(request, 262144),
      ),
    );
  } catch (error) {
    return paymentFailure(error);
  }
}
