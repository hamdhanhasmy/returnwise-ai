import { z } from "zod";
import { providerId, type PayPalRefund } from "@/lib/payments/contracts";
import { digest, invariant, refundCaptureId } from "./payment-rules";
import type { PaymentService } from "./payments";

const eventSchema = z.object({
  id: providerId,
  event_type: z.string().max(100),
  resource: z.object({ id: providerId }),
});
const supported = new Set([
  "CHECKOUT.ORDER.APPROVED",
  "CHECKOUT.ORDER.COMPLETED",
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.CAPTURE.PENDING",
  "PAYMENT.CAPTURE.DECLINED",
  "PAYMENT.CAPTURE.REFUNDED",
  "PAYMENT.CAPTURE.REVERSED",
  "PAYMENT.REFUND.PENDING",
  "PAYMENT.REFUND.FAILED",
]);

/** Webhooks are authenticated hints. Only fresh authenticated GETs update money. */
export class WebhookService {
  constructor(
    private readonly payments: PaymentService,
    private readonly webhookId: string,
  ) {}

  async receive(headers: Headers, original: unknown) {
    const event = eventSchema.parse(original);
    const required = (name: string) =>
      z.string().min(1).max(4096).parse(headers.get(name));
    const cert = new URL(required("paypal-cert-url"));
    invariant(
      cert.protocol === "https:" &&
        cert.hostname === "api.sandbox.paypal.com" &&
        cert.pathname.startsWith("/v1/notifications/certs/") &&
        !cert.username &&
        !cert.password &&
        !cert.search &&
        !cert.hash &&
        !cert.port,
      "INVALID_SIGNATURE",
      "Invalid PayPal certificate URL",
      401,
    );
    // Do not reconstruct resource: PayPal receives the original parsed event in full.
    const verified = await this.payments.provider.verifyWebhook({
      auth_algo: required("paypal-auth-algo"),
      cert_url: cert.href,
      transmission_id: required("paypal-transmission-id"),
      transmission_sig: required("paypal-transmission-sig"),
      transmission_time: required("paypal-transmission-time"),
      webhook_id: this.webhookId,
      webhook_event: original,
    });
    invariant(
      verified,
      "INVALID_SIGNATURE",
      "Webhook signature was not verified",
      401,
    );
    const db = this.payments.db;
    // Unique provider event ID provides deduplication even across simultaneous deliveries.
    const saved = await db.webhookEvent.upsert({
      where: { id: event.id },
      update: {},
      create: {
        id: event.id,
        eventType: event.event_type,
        resourceId: event.resource.id,
        payloadHash: digest(original),
        redactedResourceJson: { id: event.resource.id },
        verifiedAt: new Date(),
      },
    });
    invariant(
      saved.payloadHash === digest(original),
      "EVENT_MISMATCH",
      "Repeated event ID has a different payload",
      409,
    );
    if (saved.processedAt) return { duplicate: true };
    const claimed = await db.webhookEvent.updateMany({
      where: {
        id: event.id,
        processedAt: null,
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
      },
      data: { leaseUntil: new Date(Date.now() + 180000), status: "PROCESSING" },
    });
    invariant(
      claimed.count === 1,
      "BUSY",
      "Event processing is already in progress",
      503,
    );
    try {
      if (!supported.has(event.event_type)) {
        await db.webhookEvent.update({
          where: { id: event.id },
          data: {
            status: "IGNORED",
            processedAt: new Date(),
            leaseUntil: null,
          },
        });
        return { ignored: true };
      }
      let refund: PayPalRefund | undefined;
      let orderId: string | undefined, captureId: string | undefined;
      if (
        event.event_type === "PAYMENT.CAPTURE.REFUNDED" ||
        event.event_type.startsWith("PAYMENT.REFUND.")
      ) {
        refund = await this.payments.provider.getRefund(event.resource.id);
        invariant(
          refund.id === event.resource.id,
          "REFUND_MISMATCH",
          "Refund identity mismatch",
        );
        captureId = refundCaptureId(refund);
      } else if (event.event_type.startsWith("CHECKOUT.ORDER.")) {
        orderId = event.resource.id;
      } else {
        const capture = await this.payments.provider.getCapture(
          event.resource.id,
        );
        invariant(
          capture.id === event.resource.id &&
            capture.payee?.merchant_id === this.payments.configuredMerchantId,
          "CAPTURE_MISMATCH",
          "Webhook capture ownership mismatch",
        );
        captureId = capture.id;
        orderId = capture.supplementary_data?.related_ids.order_id;
      }
      const payment = await db.payment.findFirst({
        where: {
          expectedPayeeId: this.payments.configuredMerchantId,
          OR: [
            ...(captureId ? [{ paypalCaptureId: captureId }] : []),
            ...(orderId ? [{ paypalOrderId: orderId }] : []),
          ],
        },
      });
      // Leave unmatched events retryable: a create/capture response may still be persisting.
      invariant(
        payment,
        "UNMATCHED_EVENT",
        "Event has no matching persisted sandbox payment",
        503,
      );
      await db.webhookEvent.update({
        where: { id: event.id },
        data: { merchantId: payment.merchantId, paymentId: payment.id },
      });
      await this.payments.reconcilePayment(payment, null, undefined, refund);
      await db.$transaction(async (tx) => {
        await tx.webhookEvent.update({
          where: { id: event.id },
          data: {
            status: "PROCESSED",
            processedAt: new Date(),
            leaseUntil: null,
            lastErrorCode: null,
          },
        });
        await tx.auditLog.create({
          data: {
            merchantId: payment.merchantId,
            paymentId: payment.id,
            actorType: "SYSTEM",
            action: "PAYPAL_WEBHOOK_RECONCILED",
            correlationId: event.id,
            redactedMetadataJson: { eventType: event.event_type },
          },
        });
      });
      return { processed: true };
    } catch (error) {
      await db.webhookEvent.update({
        where: { id: event.id },
        data: {
          status: "RETRY_REQUIRED",
          leaseUntil: null,
          lastErrorCode: "RECONCILIATION_REQUIRED",
        },
      });
      throw error;
    }
  }
}
