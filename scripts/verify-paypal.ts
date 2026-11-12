import "dotenv/config";
import { z } from "zod";
import { paypalConfig, paypalCredentials } from "../src/lib/payments/config";
import { PayPalClient, ProviderError } from "../src/lib/payments/paypal-client";
import { scriptDatabase } from "./database";
import {
  verifyOrder,
  verifyCapture,
  verifyRefund,
  refundableBalance,
} from "../src/server/services/payment-rules";

// Explicit local operator diagnostic. It NEVER creates/captures/refunds or changes DB records.
const reference = (id: string | null) => (id ? `…${id.slice(-6)}` : null);
const paymentId = process.argv
  .find((arg) => arg.startsWith("--payment="))
  ?.slice(10);
const merchantId = process.argv
  .find((arg) => arg.startsWith("--merchant="))
  ?.slice(11);
const oauthOnly = process.argv.includes("--oauth");
let db: ReturnType<typeof scriptDatabase> | undefined;
try {
  const provider = new PayPalClient(paypalCredentials());
  console.log(await provider.verifyAuthentication());
  if (!oauthOnly) {
    const config = paypalConfig();
    console.log({
      paymentConfiguration: "valid",
      webhookConfigured: !!config.webhookId,
    });
    if (paymentId) {
      z.uuid().parse(paymentId);
      z.uuid().parse(merchantId);
      db = scriptDatabase();
      const payment = await db.payment.findFirstOrThrow({
        where: { id: paymentId, merchantId },
        include: { providerRefunds: true, refundOperations: true },
      });
      if (
        payment.expectedPayeeId !== config.merchantId ||
        !payment.paypalOrderId
      )
        throw new Error("Payment merchant/order mismatch");
      const order = await provider.getOrder(payment.paypalOrderId);
      verifyOrder(payment, order);
      console.log({
        order: reference(order.id),
        providerStatus: order.status,
        storedStatus: payment.status,
      });
      if (payment.paypalCaptureId) {
        const capture = await provider.getCapture(payment.paypalCaptureId);
        verifyCapture(payment, order, capture);
        console.log({
          capture: reference(capture.id),
          providerStatus: capture.status,
          amount: capture.amount.value,
          currency: capture.amount.currency_code,
        });
      }
      for (const record of payment.providerRefunds) {
        const refund = await provider.getRefund(record.paypalRefundId);
        const operation = payment.refundOperations.find(
          (op) => op.id === record.operationId,
        );
        verifyRefund(payment, refund, operation);
        if (
          refund.id !== record.paypalRefundId ||
          refund.status !== record.providerStatus
        )
          throw new Error(
            "Provider state changed; reconcile through the authenticated transaction page",
          );
        console.log({
          refund: reference(refund.id),
          providerStatus: refund.status,
          amount: refund.amount.value,
          currency: refund.amount.currency_code,
        });
      }
      const balance = refundableBalance(
        payment,
        payment.providerRefunds,
        payment.refundOperations,
      );
      console.log({
        storedBalanceMinor: Object.fromEntries(
          Object.entries(balance).map(([key, value]) => [
            key,
            value.toString(),
          ]),
        ),
      });
    }
  }
} catch (error) {
  console.error(
    error instanceof ProviderError
      ? {
          verification: "failed",
          code: error.code,
          httpStatus: error.httpStatus,
          debugId: error.debugId,
        }
      : {
          verification: "blocked",
          reason:
            "Check local configuration, merchant/payment identifiers and persisted provider state. No credentials or raw provider bodies were printed.",
        },
  );
  process.exitCode = 1;
} finally {
  await db?.$disconnect();
}
