import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  Prisma,
  PrismaClient,
  Payment,
  RefundApproval,
  ReturnCase,
  ReturnProposal,
  CaseStatus,
} from "@/generated/prisma/client";
import type { Principal } from "./auth";
import type { PaymentService } from "./payments";
import { ReturnService } from "./returns";
import { digest, invariant } from "./payment-rules";
import { evaluateReturn, LOGIC_VERSION } from "@/lib/returns/engine";
import type { EngineInput } from "@/lib/returns/contracts";
import { hashToken, newToken } from "@/lib/auth/tokens";
type Tx = Prisma.TransactionClient;
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const binding = (c: ReturnCase, p: ReturnProposal, payment: Payment) => ({
  caseId: c.id,
  orderId: c.orderId,
  policyId: c.policyId,
  proposalId: p.id,
  evaluationId: p.evaluationId,
  termsHash: p.termsHash,
  amountMinor: p.amountMinor.toString(),
  currency: p.currency,
  captureId: payment.paypalCaptureId,
  evidenceRevision: c.evidenceRevision,
  receiptAt: c.returnReceivedAt?.toISOString() ?? null,
  receiptBy: c.returnReceivedBy,
});
const financialStates = [
  "REFUND_AUTHORIZED",
  "REFUND_PROCESSING",
  "REFUND_PENDING",
  "REFUND_FAILED",
  "CLOSED",
];
async function audit(
  tx: Tx,
  c: ReturnCase,
  action: string,
  data: unknown,
  p?: Principal,
) {
  await tx.auditLog.create({
    data: {
      merchantId: c.merchantId,
      caseId: c.id,
      actorType: p ? "USER" : "SYSTEM",
      actorUserId: p?.userId,
      action,
      correlationId: randomUUID(),
      redactedMetadataJson: json(data),
    },
  });
}
export async function assertCaseFinancials(
  tx: Tx,
  db: PrismaClient,
  c: ReturnCase,
  p: ReturnProposal,
) {
  const evaluation = await tx.returnEvaluation.findFirst({
    where: { id: p.evaluationId, caseId: c.id, merchantId: c.merchantId },
  });
  invariant(
    evaluation,
    "EVALUATION_REQUIRED",
    "Recorded evaluation required",
    409,
  );
  invariant(
    evaluation.logicVersion === LOGIC_VERSION,
    "STALE_FINANCIALS",
    "Current decision logic evaluation required",
    409,
  );
  const latest = await tx.returnEvaluation.findFirst({
    where: { caseId: c.id, merchantId: c.merchantId },
    orderBy: { caseVersion: "desc" },
  });
  invariant(
    latest?.id === evaluation.id,
    "STALE_FINANCIALS",
    "Proposal evaluation has changed",
    409,
  );
  const returns = new ReturnService(db),
    current = await returns.input(tx, c),
    saved = evaluation.inputs as unknown as EngineInput;
  const checked = {
    ...saved,
    source: current.source,
    orderMinor: current.orderMinor,
    timingTrusted: current.timingTrusted,
    purchasedAt: current.purchasedAt,
    capturedMinor: current.capturedMinor,
    refundedMinor: current.refundedMinor,
    reservedMinor: current.reservedMinor,
    paymentVerified: current.paymentVerified,
    ledgerReconciled: current.ledgerReconciled,
    currency: current.currency,
    ...(current.evidence ? { evidence: current.evidence } : {}),
  };
  invariant(
    current.source === "SANDBOX" && digest(checked) === evaluation.inputHash,
    "STALE_FINANCIALS",
    "Verified financial or evidence state changed; no refund sent",
    409,
  );
  const result = evaluateReturn(checked, returns.rules(c));
  invariant(
    !result.manualReview &&
      result.options.some(
        (o) =>
          o.resolution === p.resolution &&
          BigInt(o.refundMinor) === p.amountMinor,
      ),
    "INELIGIBLE_OPTION",
    "The exact remedy is not eligible",
    409,
  );
}
// Caller locks the case BEFORE the payment; this never performs network I/O.
export async function validateCaseApproval(
  tx: Tx,
  db: PrismaClient,
  approval: RefundApproval,
  payment: Payment,
  initial: boolean,
) {
  invariant(
    approval.caseId && approval.proposalId,
    "CASE_BINDING_REQUIRED",
    "Case binding required",
    409,
  );
  const c = await tx.returnCase.findFirst({
      where: { id: approval.caseId, merchantId: payment.merchantId },
    }),
    p = await tx.returnProposal.findFirst({
      where: {
        id: approval.proposalId,
        merchantId: payment.merchantId,
        caseId: approval.caseId,
      },
    });
  invariant(
    c &&
      p &&
      c.orderId === payment.orderId &&
      financialStates.includes(c.status) &&
      !c.aiReviewRequired &&
      p.status === "APPROVED" &&
      p.approvedAt &&
      (!p.requiresConsent || p.respondedAt),
    "CASE_AUTHORIZATION_INVALID",
    "Current approved exact resolution and reviewed evidence required",
    409,
  );
  invariant(
    approval.policyId === c.policyId &&
      approval.amountMinor === p.amountMinor &&
      approval.currency === p.currency &&
      digest(binding(c, p, payment)) === digest(approval.caseBinding),
    "CASE_BINDING_MISMATCH",
    "Authorized case, capture or terms changed",
    409,
  );
  invariant(
    p.resolution !== "FULL_REFUND_RETURN" ||
      (c.returnReceivedAt && c.returnReceivedBy && c.returnReceiptNote),
    "RETURN_RECEIPT_REQUIRED",
    "Merchant receipt and inspection confirmation required",
    409,
  );
  if (initial) {
    invariant(
      p.expiresAt > new Date(),
      "APPROVAL_EXPIRED",
      "Exact offer expired; manual review required",
      409,
    );
    await assertCaseFinancials(tx, db, c, p);
  }
  return c;
}
export async function syncCaseRefunds(db: PrismaClient, paymentId: string) {
  const approvals = await db.refundApproval.findMany({
    where: { paymentId, caseId: { not: null } },
    select: { caseId: true, merchantId: true, id: true },
  });
  for (const a of approvals)
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ReturnCase" WHERE id=${a.caseId}::uuid AND "merchantId"=${a.merchantId}::uuid FOR UPDATE`;
      const c = await tx.returnCase.findUniqueOrThrow({
          where: { id: a.caseId! },
        }),
        op = await tx.refundOperation.findUnique({
          where: { approvalId: a.id },
          include: { providerRefund: true, payment: true },
        });
      if (!op || c.status === "CLOSED") return;
      const verified = op.providerRefund;
      const completed =
        op.status === "COMPLETED" &&
        verified?.providerStatus === "COMPLETED" &&
        verified.amountMinor === op.amountMinor &&
        verified.currency === op.currency &&
        verified.verifiedAt &&
        op.payment.ledgerState === "RECONCILED";
      const status: CaseStatus = completed
        ? "CLOSED"
        : ["FAILED_FINAL", "CANCELLED"].includes(op.status)
          ? "REFUND_FAILED"
          : op.status === "PROCESSING"
            ? "REFUND_PROCESSING"
            : "REFUND_PENDING";
      if (c.status === status) return;
      await tx.returnCase.update({
        where: { id: c.id },
        data: { status, version: { increment: 1 } },
      });
      await audit(
        tx,
        c,
        completed ? "CASE_REFUND_COMPLETED_AND_CLOSED" : `CASE_${status}`,
        {
          operationId: op.id,
          providerStatus: verified?.providerStatus ?? null,
          amountMinor: op.amountMinor.toString(),
          currency: op.currency,
          from: c.status,
          to: status,
        },
      );
    });
}
export class CaseRefundService {
  constructor(readonly payments: PaymentService) {}
  async receipt(p: Principal, id: string, version: number, note: string) {
    z.uuid().parse(id);
    note = z.string().trim().min(10).max(1500).parse(note);
    await this.payments.actor(p);
    return this.payments.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ReturnCase" WHERE id=${id}::uuid AND "merchantId"=${p.merchantId}::uuid FOR UPDATE`;
      const c = await tx.returnCase.findFirst({
        where: { id, merchantId: p.merchantId },
        include: { proposals: { where: { status: "APPROVED" } } },
      });
      invariant(
        c &&
          c.version === version &&
          c.status === "APPROVED" &&
          c.proposals.some((x) => x.resolution === "FULL_REFUND_RETURN") &&
          !c.returnReceivedAt,
        "RETURN_RECEIPT_INVALID",
        "Verify receipt only for the current approved physical return",
        409,
      );
      await tx.returnCase.update({
        where: { id },
        data: {
          returnReceivedAt: new Date(),
          returnReceivedBy: p.userId,
          returnReceiptNote: note,
          version: { increment: 1 },
        },
      });
      await audit(tx, c, "RETURN_RECEIPT_VERIFIED", { note }, p);
      return { received: true };
    });
  }
  async execute(
    p: Principal,
    id: string,
    command: {
      version: number;
      proposalId: string;
      termsHash: string;
      confirmed: boolean;
      eligibilityConfirmed: boolean;
    },
  ) {
    z.uuid().parse(id);
    z.uuid().parse(command.proposalId);
    await this.payments.actor(p);
    invariant(
      command.confirmed === true && command.eligibilityConfirmed === true,
      "CONFIRMATION_REQUIRED",
      "Explicit exact-amount and eligibility confirmation required",
      400,
    );
    const approval = await this.payments.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ReturnCase" WHERE id=${id}::uuid AND "merchantId"=${p.merchantId}::uuid FOR UPDATE`;
      const c = await tx.returnCase.findFirst({
        where: { id, merchantId: p.merchantId },
      });
      invariant(c, "NOT_FOUND", "Case not found", 404);
      const prior = await tx.refundApproval.findUnique({
        where: { caseId: id },
      });
      if (prior) {
        invariant(
          prior.proposalId === command.proposalId &&
            prior.termsHash === command.termsHash,
          "STALE_OFFER",
          "A different resolution was authorized",
          409,
        );
        return prior;
      }
      invariant(
        c.status === "APPROVED" &&
          c.version === command.version &&
          !c.aiReviewRequired,
        "STALE_CASE",
        "Current approved case and reviewed evidence required",
        409,
      );
      const proposal = await tx.returnProposal.findFirst({
        where: {
          id: command.proposalId,
          caseId: id,
          merchantId: p.merchantId,
          status: "APPROVED",
          termsHash: command.termsHash,
          expiresAt: { gt: new Date() },
        },
      });
      invariant(
        proposal &&
          proposal.approvedAt &&
          (!proposal.requiresConsent || proposal.respondedAt),
        "ACCEPTANCE_REQUIRED",
        "Current exact approved/accepted proposal required",
        409,
      );
      const payment = await tx.payment.findFirst({
        where: { orderId: c.orderId, merchantId: p.merchantId },
      });
      invariant(
        payment,
        "UNVERIFIED_CAPTURE",
        "Provider payment required; synthetic cases cannot refund",
        409,
      );
      await tx.$queryRaw`SELECT id FROM "Payment" WHERE id=${payment.id}::uuid FOR UPDATE`;
      const current = await tx.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });
      invariant(
        current.expectedPayeeId === this.payments.configuredMerchantId,
        "MERCHANT_MISMATCH",
        "Sandbox account mismatch",
        409,
      );
      invariant(
        proposal.resolution !== "FULL_REFUND_RETURN" ||
          (c.returnReceivedAt && c.returnReceivedBy && c.returnReceiptNote),
        "RETURN_RECEIPT_REQUIRED",
        "Confirm receipt and inspection before authorizing the physical-return refund",
        409,
      );
      await assertCaseFinancials(tx, this.payments.db, c, proposal);
      const a = await tx.refundApproval.create({
        data: {
          merchantId: p.merchantId,
          paymentId: current.id,
          caseId: id,
          proposalId: proposal.id,
          caseBinding: json(binding(c, proposal, current)),
          policyId: c.policyId,
          requestedByUserId: p.userId,
          amountMinor: proposal.amountMinor,
          currency: proposal.currency,
          reason: `Return case ${id}: ${proposal.resolution}`,
          termsHash: proposal.termsHash,
          requiresConsent: proposal.requiresConsent,
          consentedAt: proposal.requiresConsent ? proposal.respondedAt : null,
          consentTokenHash: proposal.requiresConsent
            ? hashToken(newToken())
            : null,
          expiresAt: proposal.expiresAt,
        },
      });
      await tx.returnCase.update({
        where: { id },
        data: { status: "REFUND_AUTHORIZED", version: { increment: 1 } },
      });
      await audit(
        tx,
        c,
        "CASE_REFUND_AUTHORIZED",
        {
          approvalId: a.id,
          proposalId: proposal.id,
          termsHash: proposal.termsHash,
          amountMinor: proposal.amountMinor.toString(),
          currency: proposal.currency,
          policyId: c.policyId,
          evidenceRevision: c.evidenceRevision,
        },
        p,
      );
      return a;
    });
    try {
      return await this.payments.approveRefund(
        p,
        approval.paymentId,
        approval.id,
        true,
        true,
      );
    } finally {
      await syncCaseRefunds(this.payments.db, approval.paymentId);
    }
  }
  async reconcile(p: Principal, id: string, retry = false) {
    await this.payments.actor(p);
    z.uuid().parse(id);
    const approval = await this.payments.db.refundApproval.findFirst({
      where: { caseId: id, merchantId: p.merchantId },
      include: { operation: true },
    });
    invariant(approval, "NOT_FOUND", "No authorized case refund found", 404);
    try {
      return await this.payments.reconcile(
        p,
        approval.paymentId,
        retry ? approval.operation?.id : undefined,
      );
    } finally {
      await syncCaseRefunds(this.payments.db, approval.paymentId);
    }
  }
}
