import "server-only";
import { getDb } from "@/lib/db/client";
import { paypalConfig } from "@/lib/payments/config";
import { PayPalClient } from "@/lib/payments/paypal-client";
import { PaymentService } from "./services/payments";
import { WebhookService } from "./services/webhooks";
let client: PayPalClient | undefined;
export function paymentService() {
  const config = paypalConfig();
  client ??= new PayPalClient(config);
  return new PaymentService(getDb(), client, config.merchantId);
}
export function webhookService() {
  const config = paypalConfig();
  if (!config.webhookId)
    throw new Error("Sandbox webhook ID is not configured");
  return new WebhookService(paymentService(), config.webhookId);
}
export function publicPayPalConfiguration() {
  try {
    return { clientId: paypalConfig().clientId, configured: true as const };
  } catch {
    return { clientId: null, configured: false as const };
  }
}
