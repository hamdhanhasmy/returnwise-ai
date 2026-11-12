import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  Prisma,
  type PrismaClient,
  type ReturnCase,
  type CaseStatus,
} from "@/generated/prisma/client";
import type { Principal } from "./auth";
import { hashToken, newToken, opaqueTokenSchema } from "@/lib/auth/tokens";
import { digest, invariant } from "./payment-rules";
import {
  returnPolicySchema,
  submissionSchema,
  type EngineInput,
  type Resolution,
} from "@/lib/returns/contracts";
import { evaluateReturn, LOGIC_VERSION } from "@/lib/returns/engine";
import { assertTransition } from "@/lib/returns/state";
import { assessmentSchema } from "@/lib/ai/contracts";
import { syncCaseRefunds } from "./case-refunds";
type Tx = Prisma.TransactionClient;
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const noteSchema = z.string().trim().min(10).max(1500);
export type CaseCommand = {
  action:
    | "evaluate"
    | "manual-review"
    | "request-information"
    | "propose"
    | "approve"
    | "reject"
    | "close";
  version: number;
  note: string;
  resolution?: Resolution;
  rightsConfirmed?: boolean;
};

export class ReturnService {
  constructor(
    readonly db: PrismaClient,
    private readonly clock = () => new Date(),
  ) {}
  private async actor(tx: Tx, p: Principal) {
    const user = await tx.user.findFirst({
      where: {
        id: p.userId,
        merchantId: p.merchantId,
        disabledAt: null,
        role: "ADMIN",
      },
    });
    invariant(
      user,
      "FORBIDDEN",
      "An active merchant administrator is required",
      403,
    );
  }
  private audit(
    tx: Tx,
    c: Pick<ReturnCase, "id" | "merchantId">,
    action: string,
    metadata: unknown,
    p?: Principal,
  ) {
    return tx.auditLog.create({
      data: {
        merchantId: c.merchantId,
        caseId: c.id,
        actorType: p ? "USER" : "CUSTOMER",
        actorUserId: p?.userId,
        action,
        correlationId: randomUUID(),
        redactedMetadataJson: json(metadata),
      },
    });
  }
  private async token(tx: Tx, raw: string) {
    invariant(
      opaqueTokenSchema.safeParse(raw).success,
      "INVALID_ACCESS",
      "This private link is invalid or expired",
      404,
    );
    const token = await tx.accessToken.findFirst({
      where: {
        tokenHash: hashToken(raw),
        purpose: { in: ["CUSTOMER_INTAKE", "CUSTOMER_TRACK"] },
        consumedAt: null,
        revokedAt: null,
        expiresAt: { gt: this.clock() },
      },
    });
    invariant(
      token?.orderId,
      "INVALID_ACCESS",
      "This private link is invalid or expired",
      404,
    );
    return token;
  }
  async savePolicy(p: Principal, raw: unknown) {
    const rules = returnPolicySchema.parse(raw);
    return this.db.$transaction(async (tx) => {
      await this.actor(tx, p);
      await tx.$queryRaw`SELECT id FROM "Merchant" WHERE id=${p.merchantId}::uuid FOR UPDATE`;
      const latest = await tx.merchantPolicy.findFirst({
        where: { merchantId: p.merchantId },
        orderBy: { version: "desc" },
      });
      const policy = await tx.merchantPolicy.create({
        data: {
          merchantId: p.merchantId,
          version: (latest?.version ?? 0) + 1,
          usage: "RETURNS",
          effectiveAt: this.clock(),
          returnWindowDays: rules.windowDays,
          eligibleCategories: rules.eligibleCategories,
          allowKeepWithoutReturn: rules.allowReturnless,
          allowPartialKeep: rules.allowPartial,
          requireReturnReceipt: true,
          manualReviewThresholdMinor: BigInt(rules.highValueMinor),
          currency: "USD",
          termsVersion: "returns-v1",
          rulesJson: { source: "MERCHANT_ESTIMATE" },
          returnRules: json(rules),
        },
      });
      await tx.auditLog.create({
        data: {
          merchantId: p.merchantId,
          actorType: "USER",
          actorUserId: p.userId,
          action: "RETURN_POLICY_VERSION_CREATED",
          correlationId: randomUUID(),
          redactedMetadataJson: {
            policyId: policy.id,
            version: policy.version,
          },
        },
      });
      return policy;
    });
  }
  async issueAccess(p: Principal, orderId: string) {
    z.uuid().parse(orderId);
    return this.db.$transaction(async (tx) => {
      await this.actor(tx, p);
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${orderId}::uuid AND "merchantId"=${p.merchantId}::uuid FOR UPDATE`;
      const order = await tx.order.findFirst({
        where: { id: orderId, merchantId: p.merchantId },
      });
      invariant(order, "NOT_FOUND", "Order not found", 404);
      const current = await tx.returnCase.findFirst({
        where: { orderId, merchantId: p.merchantId },
        orderBy: { createdAt: "desc" },
      });
      const raw = newToken();
      // Issuing a replacement revokes previous customer access for this order.
      await tx.accessToken.updateMany({
        where: {
          merchantId: p.merchantId,
          orderId,
          purpose: { in: ["CUSTOMER_INTAKE", "CUSTOMER_TRACK"] },
          revokedAt: null,
        },
        data: { revokedAt: this.clock() },
      });
      await tx.accessToken.create({
        data: {
          merchantId: p.merchantId,
          orderId,
          caseId: current?.id,
          purpose: current ? "CUSTOMER_TRACK" : "CUSTOMER_INTAKE",
          tokenHash: hashToken(raw),
          expiresAt: new Date(
            this.clock().getTime() + (current ? 7 : 1) * 86400000,
          ),
        },
      });
      await tx.auditLog.create({
        data: {
          merchantId: p.merchantId,
          actorType: "USER",
          actorUserId: p.userId,
          caseId: current?.id,
          action: "CUSTOMER_ACCESS_ISSUED",
          correlationId: randomUUID(),
          redactedMetadataJson: {
            orderId,
            purpose: current ? "CASE_ACCESS" : "INTAKE",
          },
        },
      });
      return { token: raw, days: current ? 7 : 1 };
    });
  }
  async revokeAccess(p: Principal, orderId: string) {
    z.uuid().parse(orderId);
    return this.db.$transaction(async (tx) => {
      await this.actor(tx, p);
      invariant(
        await tx.order.findFirst({
          where: { id: orderId, merchantId: p.merchantId },
        }),
        "NOT_FOUND",
        "Order not found",
        404,
      );
      await tx.accessToken.updateMany({
        where: {
          merchantId: p.merchantId,
          orderId,
          purpose: { in: ["CUSTOMER_INTAKE", "CUSTOMER_TRACK"] },
          revokedAt: null,
        },
        data: { revokedAt: this.clock() },
      });
      await tx.auditLog.create({
        data: {
          merchantId: p.merchantId,
          actorType: "USER",
          actorUserId: p.userId,
          action: "CUSTOMER_ACCESS_REVOKED",
          correlationId: randomUUID(),
          redactedMetadataJson: { orderId },
        },
      });
      return { revoked: true };
    });
  }
  async input(tx: Tx, c: ReturnCase): Promise<EngineInput> {
    const order = await tx.order.findFirstOrThrow({
      where: { id: c.orderId, merchantId: c.merchantId },
      include: {
        product: true,
        payment: { include: { providerRefunds: true, refundOperations: true } },
      },
    });
    const snapshot = z
      .object({ category: z.string() })
      .safeParse(order.productSnapshot);
    const payment = order.payment;
    const refunded =
      payment?.providerRefunds
        .filter((r) => r.providerStatus === "COMPLETED")
        .reduce((n, r) => n + r.amountMinor, 0n) ?? 0n;
    const reserved =
      (payment?.refundOperations
        .filter((r) => r.reservation === "HELD")
        .reduce((n, r) => n + r.amountMinor, 0n) ?? 0n) +
      (payment?.providerRefunds
        .filter(
          (r) =>
            !r.operationId &&
            !["COMPLETED", "FAILED", "CANCELLED"].includes(r.providerStatus),
        )
        .reduce((n, r) => n + r.amountMinor, 0n) ?? 0n);
    const synthetic = order.origin === "SIMULATED";
    const analysis =
      c.evidenceRevision > 0
        ? await tx.evidenceAnalysis.findFirst({
            where: {
              caseId: c.id,
              merchantId: c.merchantId,
              evidenceRevision: c.evidenceRevision,
            },
            orderBy: { createdAt: "desc" },
          })
        : null;
    const observed = assessmentSchema.safeParse(
      analysis?.status === "SUCCEEDED" ? analysis.result : null,
    );
    return {
      ...(c.evidenceRevision > 0
        ? {
            evidence: {
              revision: c.evidenceRevision,
              reviewed: !c.aiReviewRequired,
              analysisId: analysis?.id ?? null,
              status: analysis?.status ?? "HUMAN_ONLY",
              uncertainty: observed.success ? observed.data.uncertainty : null,
              claimSupport: observed.success
                ? observed.data.claimSupport
                : null,
              injectionSuspected:
                observed.success && observed.data.injectionSuspected,
              observations: observed.success
                ? observed.data.visibleObservations
                : [],
              limitations: observed.success
                ? observed.data.evidenceLimitations
                : [
                    "No current validated AI assessment; independent human review required.",
                  ],
            },
          }
        : {}),
      source: synthetic ? "SIMULATED" : "SANDBOX",
      orderMinor: order.totalMinor.toString(),
      capturedMinor: synthetic
        ? order.totalMinor.toString()
        : (payment?.captureAmountMinor?.toString() ?? null),
      refundedMinor: refunded.toString(),
      reservedMinor: reserved.toString(),
      currency: order.currency,
      paymentVerified: !!(
        payment?.captureCompletedAt &&
        payment.paypalCaptureId &&
        payment.currency === order.currency &&
        ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(payment.status)
      ),
      ledgerReconciled: payment?.ledgerState === "RECONCILED",
      category: snapshot.success ? snapshot.data.category : "",
      reason: c.reason,
      condition: c.condition ?? "UNKNOWN",
      purchasedAt: order.purchasedAt?.toISOString() ?? null,
      submittedAt: c.submittedAt?.toISOString() ?? null,
      timingTrusted:
        order.timingProvenance === "UTC_RECORDED" ||
        (synthetic && order.timingProvenance === "SIMULATED"),
      recoveryMinor: order.product.recoveryValueMinor.toString(),
    };
  }
  rules(c: ReturnCase): unknown {
    const parsed = z.object({ rules: z.unknown() }).safeParse(c.policySnapshot);
    return parsed.success ? parsed.data.rules : null;
  }
  private async evaluate(tx: Tx, c: ReturnCase, p?: Principal) {
    const inputs = await this.input(tx, c),
      result = evaluateReturn(inputs, this.rules(c));
    const status = result.manualReview ? "MANUAL_REVIEW" : "EVALUATED";
    assertTransition(c.status, status);
    const record = await tx.returnEvaluation.create({
      data: {
        merchantId: c.merchantId,
        caseId: c.id,
        caseVersion: c.version,
        logicVersion: LOGIC_VERSION,
        inputHash: digest(inputs),
        inputs: json(inputs),
        result: json(result),
      },
    });
    await tx.returnCase.update({
      where: { id: c.id },
      data: {
        status,
        recommendation: result.recommended,
        priority: result.manualReview ? "HIGH" : "NORMAL",
        version: { increment: 1 },
      },
    });
    await this.audit(
      tx,
      c,
      "CASE_EVALUATED",
      {
        evaluationId: record.id,
        logicVersion: LOGIC_VERSION,
        reasonCodes: result.reasonCodes,
      },
      p,
    );
    return record;
  }
  async submit(rawToken: string, rawSubmission: unknown) {
    const submission = submissionSchema.parse(rawSubmission);
    return this.db.$transaction(async (tx) => {
      const token = await this.token(tx, rawToken);
      invariant(
        token.purpose === "CUSTOMER_INTAKE",
        "INVALID_ACCESS",
        "This link does not authorize another return submission",
        403,
      );
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${token.orderId}::uuid AND "merchantId"=${token.merchantId}::uuid FOR UPDATE`;
      const order = await tx.order.findFirstOrThrow({
        where: { id: token.orderId!, merchantId: token.merchantId },
      });
      invariant(
        order.productId === submission.productId,
        "NOT_FOUND",
        "Item does not belong to this order",
        404,
      );
      invariant(
        !(await tx.returnCase.findFirst({
          where: { merchantId: token.merchantId, orderId: order.id },
        })),
        "CASE_EXISTS",
        "A return case already exists. Ask the merchant for its private access link.",
      );
      const policy = await tx.merchantPolicy.findFirst({
        where: {
          merchantId: token.merchantId,
          usage: "RETURNS",
          effectiveAt: { lte: this.clock() },
          retiredAt: null,
        },
        orderBy: { version: "desc" },
      });
      invariant(
        policy,
        "POLICY_UNAVAILABLE",
        "The merchant must configure a return policy before intake",
        409,
      );
      const rules = returnPolicySchema.parse(policy.returnRules);
      const used = await tx.accessToken.updateMany({
        where: {
          id: token.id,
          consumedAt: null,
          revokedAt: null,
          expiresAt: { gt: this.clock() },
        },
        data: { consumedAt: this.clock() },
      });
      invariant(
        used.count === 1,
        "INVALID_ACCESS",
        "This private link is invalid or expired",
        404,
      );
      const c = await tx.returnCase.create({
        data: {
          merchantId: token.merchantId,
          orderId: order.id,
          policyId: policy.id,
          policySnapshot: json({
            id: policy.id,
            version: policy.version,
            rules,
          }),
          reason: submission.reason,
          condition: submission.condition,
          description: submission.description,
          customerClaim: {
            source:
              order.origin === "SIMULATED" ? "SIMULATED" : "CUSTOMER_REPORTED",
            notice: "Unverified customer description; no AI analysis",
          },
          status: "SUBMITTED",
          workflowVersion: 1,
          submittedAt: this.clock(),
        },
      });
      await this.audit(tx, c, "CASE_SUBMITTED", {
        policyVersion: policy.version,
        source: order.origin,
      });
      await this.evaluate(tx, c);
      const tracking = newToken();
      await tx.accessToken.create({
        data: {
          merchantId: c.merchantId,
          orderId: c.orderId,
          caseId: c.id,
          purpose: "CUSTOMER_TRACK",
          tokenHash: hashToken(tracking),
          expiresAt: new Date(this.clock().getTime() + 7 * 86400000),
        },
      });
      return { caseId: c.id, token: tracking };
    });
  }
  async customerView(rawToken: string) {
    return this.db.$transaction(async (tx) => {
      const token = await this.token(tx, rawToken);
      const order = await tx.order.findFirstOrThrow({
        where: { id: token.orderId!, merchantId: token.merchantId },
        include: { merchant: { select: { name: true } } },
      });
      const product = z
        .object({ name: z.string(), sku: z.string().optional() })
        .safeParse(order.productSnapshot);
      if (token.caseId) {
        const linked = await tx.refundApproval.findFirst({
          where: { caseId: token.caseId, merchantId: token.merchantId },
          select: { paymentId: true },
        });
        if (linked) await syncCaseRefunds(this.db, linked.paymentId);
      }
      const c = token.caseId
        ? await tx.returnCase.findFirst({
            where: {
              id: token.caseId,
              orderId: order.id,
              merchantId: token.merchantId,
            },
            include: {
              refundApproval: {
                include: { operation: { include: { providerRefund: true } } },
              },
              proposals: { orderBy: { createdAt: "desc" }, take: 1 },
              audit: {
                where: { action: "CASE_INFORMATION_REQUESTED" },
                orderBy: { createdAt: "desc" },
                take: 1,
              },
            },
          })
        : null;
      const proposal = c?.proposals[0];
      // Explicit projection: no customerRef, provider IDs, policy internals or merchant finances.
      return {
        orderNumber: order.publicOrderNumber,
        productId: order.productId,
        productName: product.success ? product.data.name : "Ordered item",
        totalMinor: order.totalMinor.toString(),
        currency: order.currency,
        merchantName: order.merchant.name,
        synthetic: order.origin === "SIMULATED",
        intake: token.purpose === "CUSTOMER_INTAKE",
        expiresAt: token.expiresAt.toISOString(),
        case: c
          ? {
              id: c.id,
              status: c.status,
              version: c.version,
              description: c.description,
              reason: c.reason,
              condition: c.condition,
              informationRequest: c.audit[0]?.redactedMetadataJson ?? null,
            }
          : null,
        proposal: proposal
          ? {
              id: proposal.id,
              resolution: proposal.resolution,
              amountMinor: proposal.amountMinor.toString(),
              currency: proposal.currency,
              explanation: proposal.explanation,
              status: proposal.status,
              requiresConsent: proposal.requiresConsent,
              expiresAt: proposal.expiresAt.toISOString(),
              termsHash: proposal.termsHash,
            }
          : null,
        refund: c?.refundApproval?.operation
          ? {
              status: c.refundApproval.operation.status,
              providerStatus:
                c.refundApproval.operation.providerRefund?.providerStatus ??
                null,
              amountMinor: c.refundApproval.operation.amountMinor.toString(),
              currency: c.refundApproval.operation.currency,
              verifiedAt:
                c.refundApproval.operation.providerRefund?.verifiedAt.toISOString() ??
                null,
            }
          : null,
      };
    });
  }
  async customerRespond(
    rawToken: string,
    command: {
      action: "accept" | "decline" | "information";
      version: number;
      proposalId?: string;
      termsHash?: string;
      message?: string;
    },
  ) {
    return this.db.$transaction(async (tx) => {
      const token = await this.token(tx, rawToken);
      invariant(
        token.purpose === "CUSTOMER_TRACK" && token.caseId,
        "INVALID_ACCESS",
        "Case access is required",
        403,
      );
      await tx.$queryRaw`SELECT id FROM "ReturnCase" WHERE id=${token.caseId}::uuid AND "merchantId"=${token.merchantId}::uuid FOR UPDATE`;
      const c = await tx.returnCase.findFirstOrThrow({
        where: {
          id: token.caseId,
          orderId: token.orderId!,
          merchantId: token.merchantId,
        },
      });
      invariant(
        c.version === command.version,
        "STALE_CASE",
        "This case changed. Refresh before continuing.",
      );
      invariant(
        c.status === "AWAITING_CUSTOMER",
        "INVALID_TRANSITION",
        "This case is not awaiting a customer response",
      );
      const active = await tx.accessToken.updateMany({
        where: {
          id: token.id,
          revokedAt: null,
          expiresAt: { gt: this.clock() },
        },
        data: { updatedAt: this.clock() },
      });
      invariant(
        active.count === 1,
        "INVALID_ACCESS",
        "This private link is invalid or expired",
        404,
      );
      if (command.action === "information") {
        invariant(
          !(await tx.returnProposal.findFirst({
            where: {
              caseId: c.id,
              merchantId: c.merchantId,
              status: "PROPOSED",
            },
          })),
          "INVALID_TRANSITION",
          "Respond to the current offer first",
        );
        const message = noteSchema.parse(command.message);
        await tx.returnCase.update({
          where: { id: c.id },
          data: {
            status: "SUBMITTED",
            version: { increment: 1 },
            evidenceRevision: { increment: 1 },
            aiReviewRequired: true,
          },
        });
        await this.audit(tx, c, "CUSTOMER_INFORMATION_ADDED", { message });
        return { status: "SUBMITTED" };
      }
      const proposal = await tx.returnProposal.findFirst({
        where: {
          id: z.uuid().parse(command.proposalId),
          merchantId: c.merchantId,
          caseId: c.id,
          status: "PROPOSED",
          expiresAt: { gt: this.clock() },
          termsHash: command.termsHash,
        },
      });
      invariant(
        proposal?.requiresConsent && typeof command.termsHash === "string",
        "OFFER_UNAVAILABLE",
        "The exact offer is expired, changed or no longer available",
      );
      const accepted = command.action === "accept",
        status = accepted ? "RESOLUTION_PROPOSED" : "MANUAL_REVIEW";
      assertTransition(c.status, status);
      await tx.returnProposal.update({
        where: { id: proposal.id },
        data: {
          status: accepted ? "ACCEPTED" : "DECLINED",
          respondedAt: this.clock(),
        },
      });
      await tx.returnCase.update({
        where: { id: c.id },
        data: { status, version: { increment: 1 } },
      });
      await this.audit(
        tx,
        c,
        accepted ? "CUSTOMER_OFFER_ACCEPTED" : "CUSTOMER_OFFER_DECLINED",
        {
          proposalId: proposal.id,
          termsHash: proposal.termsHash,
          amountMinor: proposal.amountMinor.toString(),
        },
      );
      return { status };
    });
  }
  async command(p: Principal, id: string, command: CaseCommand) {
    z.uuid().parse(id);
    return this.db.$transaction(async (tx) => {
      await this.actor(tx, p);
      await tx.$queryRaw`SELECT id FROM "ReturnCase" WHERE id=${id}::uuid AND "merchantId"=${p.merchantId}::uuid FOR UPDATE`;
      const c = await tx.returnCase.findFirst({
        where: { id, merchantId: p.merchantId },
      });
      invariant(c, "NOT_FOUND", "Case not found", 404);
      invariant(
        c.version === command.version,
        "STALE_CASE",
        "This case changed. Refresh before continuing.",
      );
      if (command.action === "evaluate") return this.evaluate(tx, c, p);
      if (command.action === "close" && c.status === "APPROVED") {
        const order = await tx.order.findUniqueOrThrow({
          where: { id: c.orderId },
        });
        invariant(
          order.origin === "SIMULATED",
          "REFUND_REQUIRED",
          "A Sandbox case closes only after its linked refund is verified",
          409,
        );
      }
      const note = noteSchema.parse(command.note);
      let status: CaseStatus;
      if (command.action === "propose" || command.action === "approve") {
        invariant(
          !c.aiReviewRequired,
          "EVIDENCE_REVIEW_REQUIRED",
          "Review the current evidence and AI limitations before proposing or approving a remedy",
          409,
        );
        invariant(
          command.rightsConfirmed === true,
          "RIGHTS_REVIEW_REQUIRED",
          "Confirm customer entitlement and policy review before continuing",
        );
        const evaluation = await tx.returnEvaluation.findFirst({
          where: { merchantId: c.merchantId, caseId: c.id },
          orderBy: { caseVersion: "desc" },
        });
        invariant(
          evaluation,
          "EVALUATION_REQUIRED",
          "Evaluate this case first",
        );
        invariant(
          evaluation.logicVersion === LOGIC_VERSION,
          "EVALUATION_REQUIRED",
          "Re-evaluate using the current decision logic before proposing or approving",
          409,
        );
        const saved = evaluation.inputs as unknown as EngineInput;
        // Serialize this local approval check with payment ledger mutations. No network I/O.
        await tx.$queryRaw`SELECT id FROM "Payment" WHERE "orderId"=${c.orderId}::uuid AND "merchantId"=${c.merchantId}::uuid FOR UPDATE`;
        const current = await this.input(tx, c);
        // Estimates remain frozen; current verified balances must still match the evaluated ledger.
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
          digest(checked) === evaluation.inputHash,
          "STALE_FINANCIALS",
          "Financial state changed. Re-evaluate before proposing or approving.",
        );
        const result = evaluateReturn(checked, this.rules(c));
        invariant(
          !result.manualReview,
          "MANUAL_REVIEW_REQUIRED",
          "Resolve missing eligibility information before proposing a resolution",
        );
        if (command.action === "propose") {
          invariant(
            c.status === "EVALUATED",
            "INVALID_TRANSITION",
            "Evaluate this case before proposing an option",
          );
          const option = result.options.find(
            (o) => o.resolution === command.resolution,
          );
          invariant(
            option,
            "INELIGIBLE_OPTION",
            "Select an eligible resolution from this evaluation",
          );
          const terms = {
            caseId: c.id,
            evaluationId: evaluation.id,
            resolution: option.resolution,
            amountMinor: option.refundMinor,
            currency: "USD",
            explanation: note,
          };
          await tx.returnProposal.create({
            data: {
              merchantId: c.merchantId,
              caseId: c.id,
              evaluationId: evaluation.id,
              resolution: option.resolution,
              amountMinor: BigInt(option.refundMinor),
              currency: "USD",
              explanation: note,
              termsHash: digest(terms),
              requiresConsent: option.requiresConsent,
              expiresAt: new Date(this.clock().getTime() + 7 * 86400000),
            },
          });
          status = option.requiresConsent
            ? "AWAITING_CUSTOMER"
            : "RESOLUTION_PROPOSED";
        } else {
          const proposal = await tx.returnProposal.findFirst({
            where: {
              merchantId: c.merchantId,
              caseId: c.id,
              status: { in: ["PROPOSED", "ACCEPTED"] },
              expiresAt: { gt: this.clock() },
            },
            orderBy: { createdAt: "desc" },
          });
          invariant(
            proposal &&
              proposal.evaluationId === evaluation.id &&
              (!proposal.requiresConsent || proposal.status === "ACCEPTED"),
            "ACCEPTANCE_REQUIRED",
            "The current exact offer needs customer acceptance or has expired",
          );
          const option = result.options.find(
            (o) =>
              o.resolution === proposal.resolution &&
              BigInt(o.refundMinor) === proposal.amountMinor,
          );
          invariant(
            option,
            "INELIGIBLE_OPTION",
            "This resolution is no longer eligible",
          );
          status = "APPROVED";
          await tx.returnProposal.update({
            where: { id: proposal.id },
            data: { status: "APPROVED", approvedAt: this.clock() },
          });
        }
      } else {
        status =
          command.action === "reject"
            ? "REJECTED"
            : command.action === "close"
              ? "CLOSED"
              : command.action === "request-information"
                ? "AWAITING_CUSTOMER"
                : "MANUAL_REVIEW";
        await tx.returnProposal.updateMany({
          where: {
            merchantId: c.merchantId,
            caseId: c.id,
            status: { in: ["PROPOSED", "ACCEPTED"] },
          },
          data: { status: "WITHDRAWN" },
        });
      }
      assertTransition(c.status, status);
      await tx.returnCase.update({
        where: { id },
        data: {
          status,
          version: { increment: 1 },
          ...(status === "MANUAL_REVIEW" ? { priority: "HIGH" } : {}),
        },
      });
      await this.audit(
        tx,
        c,
        command.action === "request-information"
          ? "CASE_INFORMATION_REQUESTED"
          : `CASE_${command.action.replaceAll("-", "_").toUpperCase()}`,
        {
          message: note,
          from: c.status,
          to: status,
          rightsConfirmed: command.rightsConfirmed ?? false,
          paymentExecuted: false,
        },
        p,
      );
      return { status, paymentExecuted: false };
    });
  }
}
