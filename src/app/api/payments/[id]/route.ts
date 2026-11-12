import { z } from "zod";
import { paymentService } from "@/server/paypal";
import {
  json,
  paymentActor,
  paymentFailure,
  readJson,
} from "@/server/payment-http";
export const runtime = "nodejs";
const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("capture") }).strict(),
  z
    .object({
      action: z.literal("reconcile"),
      retryOperationId: z.uuid().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("prepare-refund"),
      amount: z.string().regex(/^\d{1,4}(\.\d{1,2})?$/),
      reason: z.string().trim().min(3).max(255),
    })
    .strict(),
  z
    .object({
      action: z.literal("approve-refund"),
      approvalId: z.uuid(),
      confirmed: z.literal(true),
      eligibilityConfirmed: z.literal(true),
    })
    .strict(),
]);
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await paymentActor(request);
    const { id } = await context.params;
    const input = command.parse(await readJson(request));
    const service = paymentService();
    if (input.action === "prepare-refund") {
      const result = await service.prepareRefund(
        actor,
        id,
        input.amount,
        input.reason,
      );
      return json({
        approvalId: result.approval.id,
        amountMinor: result.approval.amountMinor,
        reason: result.approval.reason,
        requiresConsent: result.approval.requiresConsent,
        expiresAt: result.approval.expiresAt,
        consentToken: result.consentToken,
      });
    }
    if (input.action === "approve-refund") {
      const result = await service.approveRefund(
        actor,
        id,
        input.approvalId,
        input.confirmed,
        input.eligibilityConfirmed,
      );
      return json({
        operationId: result.id,
        status: result.status,
        refundId: result.candidateRefundId,
      });
    }
    const result =
      input.action === "capture"
        ? await service.capture(actor, id)
        : await service.reconcile(actor, id, input.retryOperationId);
    return json({
      paymentId: result.id,
      status: result.status,
      captureId: result.paypalCaptureId,
    });
  } catch (error) {
    return paymentFailure(error);
  }
}
