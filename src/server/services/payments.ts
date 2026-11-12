import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  Payment,
  Prisma,
  PrismaClient,
  RefundOperation,
} from "@/generated/prisma/client";
import type { Principal } from "./auth";
import type { PayPalGateway, PayPalRefund } from "@/lib/payments/contracts";
import { usdDecimal, refundAmountSchema } from "@/lib/payments/contracts";
import { ProviderError } from "@/lib/payments/paypal-client";
import { hashToken, newToken, opaqueTokenSchema } from "@/lib/auth/tokens";
import { parseUsd } from "@/lib/money";
import { validateCaseApproval, syncCaseRefunds } from "./case-refunds";
import {
  digest,
  invariant,
  PaymentError,
  refundableBalance,
  verifyCapture,
  verifyOrder,
  verifyRefund,
} from "./payment-rules";

type Tx = Prisma.TransactionClient;
const uuid = (id: string) => {
  invariant(
    z.uuid().safeParse(id).success,
    "NOT_FOUND",
    "Transaction not found",
    404,
  );
  return id;
};
const codeOf = (error: unknown) =>
  error instanceof ProviderError || error instanceof PaymentError
    ? error.code
    : "VERIFICATION_UNAVAILABLE";
const payloadObject = (payload: Prisma.JsonValue) =>
  payload as Record<string, unknown>;

export class PaymentService {
  constructor(
    readonly db: PrismaClient,
    readonly provider: PayPalGateway,
    readonly configuredMerchantId: string,
  ) {}

  async actor(principal: Principal, admin = true) {
    const user = await this.db.user.findFirst({
      where: {
        id: principal.userId,
        merchantId: principal.merchantId,
        disabledAt: null,
      },
      include: { merchant: true },
    });
    invariant(
      user && (!admin || user.role === "ADMIN"),
      "FORBIDDEN",
      "Administrator payment authorization required",
      403,
    );
    invariant(
      user.merchant.paymentsEnabled &&
        user.merchant.paypalMerchantId === this.configuredMerchantId,
      "MERCHANT_NOT_CONFIGURED",
      "This merchant is not enabled for the configured sandbox account",
      403,
    );
    return user;
  }

  async payment(principal: Principal, id: string) {
    const payment = await this.db.payment.findFirst({
      where: { id: uuid(id), merchantId: principal.merchantId },
    });
    invariant(payment, "NOT_FOUND", "Transaction not found", 404);
    invariant(
      payment.expectedPayeeId === this.configuredMerchantId,
      "MERCHANT_MISMATCH",
      "Transaction merchant does not match the configured account",
      403,
    );
    return payment;
  }

  private async audit(
    tx: Tx,
    payment: Payment,
    principal: Principal | null,
    action: string,
    metadata: Prisma.InputJsonObject = {},
    operationId?: string,
  ) {
    await tx.auditLog.create({
      data: {
        merchantId: payment.merchantId,
        paymentId: payment.id,
        refundOperationId: operationId,
        actorType: principal ? "USER" : "SYSTEM",
        actorUserId: principal?.userId,
        action,
        correlationId: randomUUID(),
        redactedMetadataJson: metadata,
      },
    });
  }

  private async claim(payment: Payment) {
    const owner = randomUUID();
    const result = await this.db.payment.updateMany({
      where: {
        id: payment.id,
        merchantId: payment.merchantId,
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
      },
      data: { leaseOwner: owner, leaseUntil: new Date(Date.now() + 120_000) },
    });
    invariant(
      result.count === 1,
      "BUSY",
      "Another operation is being verified. Wait and refresh.",
    );
    return owner;
  }
  private async release(payment: Payment, owner: string) {
    await this.db.payment.updateMany({
      where: {
        id: payment.id,
        merchantId: payment.merchantId,
        leaseOwner: owner,
      },
      data: { leaseUntil: null, leaseOwner: null },
    });
    await syncCaseRefunds(this.db, payment.id);
  }
  private async locked(tx: Tx, payment: Payment, owner: string) {
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${payment.id}::uuid AND "merchantId" = ${payment.merchantId}::uuid FOR UPDATE`;
    const current = await tx.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    invariant(
      current.leaseOwner === owner,
      "LEASE_LOST",
      "Operation lease changed; reconcile before continuing",
    );
    return current;
  }
  private async uncertain(
    payment: Payment,
    owner: string,
    error: unknown,
    kind?: "CREATE_ORDER" | "CAPTURE_ORDER",
    operationId?: string,
  ) {
    await this.db.$transaction(async (tx) => {
      const current = await this.locked(tx, payment, owner);
      await tx.payment.update({
        where: { id: current.id },
        data: {
          status: "NEEDS_RECONCILIATION",
          reconciliationReason: codeOf(error),
          ...(error instanceof PaymentError && /MISMATCH/.test(error.code)
            ? { ledgerState: "FROZEN" }
            : {}),
        },
      });
      if (kind)
        await tx.checkoutOperation.updateMany({
          where: {
            merchantId: current.merchantId,
            paymentId: current.id,
            kind,
            status: { not: "COMPLETED" },
          },
          data: {
            status: "NEEDS_RECONCILIATION",
            lastErrorCode: codeOf(error),
          },
        });
      if (operationId)
        await tx.refundOperation.updateMany({
          where: {
            id: operationId,
            merchantId: current.merchantId,
            reservation: "HELD",
          },
          data: {
            status: "NEEDS_RECONCILIATION",
            lastErrorCode: codeOf(error),
          },
        });
      await this.audit(
        tx,
        current,
        null,
        "PAYMENT_RECONCILIATION_REQUIRED",
        { code: codeOf(error) },
        operationId,
      );
    });
  }

  async create(principal: Principal, productId: string, checkoutKey: string) {
    await this.actor(principal);
    uuid(productId);
    uuid(checkoutKey);
    // Merchant row serializes checkout-key creation. No network work in this transaction.
    const payment = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Merchant" WHERE id = ${principal.merchantId}::uuid FOR UPDATE`;
      const existing = await tx.payment.findUnique({
        where: {
          merchantId_checkoutKey: {
            merchantId: principal.merchantId,
            checkoutKey,
          },
        },
        include: { order: true },
      });
      if (existing) {
        invariant(
          existing.order.productId === productId,
          "IDEMPOTENCY_CONFLICT",
          "Checkout key is already bound to another product",
        );
        return existing;
      }
      const product = await tx.product.findFirst({
        where: { id: productId, merchantId: principal.merchantId },
      });
      invariant(
        product && product.currency === "USD",
        "NOT_FOUND",
        "USD demo product not found",
        404,
      );
      const orderId = randomUUID(),
        paymentId = randomUUID();
      const order = await tx.order.create({
        data: {
          id: orderId,
          merchantId: principal.merchantId,
          productId,
          publicOrderNumber: `SB-${orderId}`,
          productSnapshot: {
            name: product.name,
            sku: product.sku,
            category: product.category,
            quantity: 1,
            priceMinor: product.saleAmountMinor.toString(),
          },
          customerRef: "fictional-sandbox-buyer",
          currency: "USD",
          totalMinor: product.saleAmountMinor,
          origin: "PAYPAL_SANDBOX",
          timingProvenance: "UTC_RECORDED",
        },
      });
      const created = await tx.payment.create({
        data: {
          id: paymentId,
          merchantId: principal.merchantId,
          orderId: order.id,
          checkoutKey,
          expectedPayeeId: this.configuredMerchantId,
          expectedAmountMinor: order.totalMinor,
          currency: "USD",
        },
      });
      const payload = {
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: orderId,
            custom_id: paymentId,
            payee: { merchant_id: this.configuredMerchantId },
            amount: {
              currency_code: "USD",
              value: usdDecimal(order.totalMinor),
            },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              shipping_preference: "NO_SHIPPING",
              user_action: "PAY_NOW",
            },
          },
        },
      };
      await tx.checkoutOperation.create({
        data: {
          merchantId: created.merchantId,
          paymentId,
          kind: "CREATE_ORDER",
          requestId: randomUUID(),
          requestPayload: payload,
          requestHash: digest(payload),
        },
      });
      await this.audit(tx, created, principal, "CHECKOUT_PREPARED", {
        amountMinor: order.totalMinor.toString(),
        currency: "USD",
      });
      return created;
    });
    if (payment.paypalOrderId) return this.reconcile(principal, payment.id);
    const owner = await this.claim(payment);
    try {
      const op = await this.db.$transaction(async (tx) => {
        await this.locked(tx, payment, owner);
        const op = await tx.checkoutOperation.findUniqueOrThrow({
          where: {
            paymentId_kind: { paymentId: payment.id, kind: "CREATE_ORDER" },
          },
        });
        invariant(
          op.status === "PENDING" && !op.firstSentAt,
          "RECONCILIATION_REQUIRED",
          "Order creation may already have reached PayPal; do not create it again",
        );
        return tx.checkoutOperation.update({
          where: { id: op.id },
          data: {
            status: "PROCESSING",
            firstSentAt: new Date(),
            attemptCount: { increment: 1 },
          },
        });
      });
      invariant(
        digest(op.requestPayload) === op.requestHash,
        "PAYLOAD_MISMATCH",
        "Persisted request changed",
      );
      const receipt = await this.provider.createOrder(
        payloadObject(op.requestPayload),
        op.requestId,
      );
      const saved = await this.db.$transaction(async (tx) => {
        await this.locked(tx, payment, owner);
        return tx.payment.update({
          where: { id: payment.id },
          data: { paypalOrderId: receipt.id },
        });
      });
      const order = await this.provider.getOrder(receipt.id);
      verifyOrder(saved, order);
      invariant(
        ["CREATED", "PAYER_ACTION_REQUIRED", "APPROVED"].includes(order.status),
        "ORDER_STATE",
        "Unexpected order state requires reconciliation",
      );
      return await this.db.$transaction(async (tx) => {
        await this.locked(tx, saved, owner);
        await tx.checkoutOperation.update({
          where: { id: op.id },
          data: { status: "COMPLETED" },
        });
        await this.audit(tx, saved, principal, "PAYPAL_ORDER_CREATED", {
          paypalOrderId: receipt.id,
          providerStatus: order.status,
        });
        return tx.payment.update({
          where: { id: saved.id },
          data: {
            status: "AWAITING_APPROVAL",
            orderProviderStatus: order.status,
            lastVerifiedAt: new Date(),
            reconciliationReason: null,
          },
        });
      });
    } catch (error) {
      await this.uncertain(payment, owner, error, "CREATE_ORDER");
      throw error;
    } finally {
      await this.release(payment, owner);
    }
  }

  private async refreshCapture(
    payment: Payment,
    owner: string,
    principal: Principal | null,
  ) {
    invariant(
      payment.paypalOrderId,
      "RECONCILIATION_REQUIRED",
      "No PayPal order ID was received; manual investigation required",
    );
    const order = await this.provider.getOrder(payment.paypalOrderId);
    const unit = verifyOrder(payment, order);
    const captures = unit.payments?.captures ?? [];
    invariant(
      captures.length <= 1,
      "CAPTURE_MISMATCH",
      "Multiple captures require manual review",
    );
    if (!captures.length) {
      invariant(
        !payment.paypalCaptureId,
        "CAPTURE_MISMATCH",
        "Previously recorded capture is absent from its order",
      );
      const saved = await this.db.$transaction(async (tx) => {
        const current = await this.locked(tx, payment, owner);
        const attempted = await tx.checkoutOperation.findUnique({
          where: {
            paymentId_kind: { paymentId: current.id, kind: "CAPTURE_ORDER" },
          },
        });
        await tx.checkoutOperation.updateMany({
          where: {
            paymentId: current.id,
            merchantId: current.merchantId,
            kind: "CREATE_ORDER",
          },
          data: { status: "COMPLETED", lastErrorCode: null },
        });
        if (
          order.status === "APPROVED" &&
          current.orderProviderStatus !== "APPROVED"
        )
          await this.audit(tx, current, principal, "PAYPAL_BUYER_APPROVED", {
            paypalOrderId: order.id,
          });
        return tx.payment.update({
          where: { id: current.id },
          data: {
            orderProviderStatus: order.status,
            lastVerifiedAt: new Date(),
            status:
              attempted ||
              ![
                "CREATED",
                "PAYER_ACTION_REQUIRED",
                "APPROVED",
                "VOIDED",
              ].includes(order.status)
                ? "NEEDS_RECONCILIATION"
                : order.status === "VOIDED"
                  ? "CANCELLED"
                  : "AWAITING_APPROVAL",
          },
        });
      });
      return { payment: saved, order, capture: null };
    }
    const capture = await this.provider.getCapture(captures[0]!.id);
    verifyCapture(payment, order, capture);
    const saved = await this.db.$transaction(async (tx) => {
      const current = await this.locked(tx, payment, owner);
      const refunds = await tx.providerRefund.findMany({
        where: { merchantId: current.merchantId, paymentId: current.id },
      });
      const completed = refunds
        .filter((r) => r.providerStatus === "COMPLETED")
        .reduce((sum, r) => sum + r.amountMinor, 0n);
      const knownCompleted = !!current.captureCompletedAt;
      const completedNow = capture.status === "COMPLETED";
      const validPartial =
        capture.status === "PARTIALLY_REFUNDED" &&
        knownCompleted &&
        completed > 0n &&
        completed < current.expectedAmountMinor;
      const validFull =
        capture.status === "REFUNDED" &&
        knownCompleted &&
        completed === current.expectedAmountMinor;
      const unresolved = await tx.refundOperation.count({
        where: {
          paymentId: current.id,
          merchantId: current.merchantId,
          reservation: "HELD",
        },
      });
      const refundUncertain =
        knownCompleted &&
        unresolved > 0 &&
        ["PARTIALLY_REFUNDED", "REFUNDED"].includes(capture.status);
      const frozen =
        current.ledgerState === "FROZEN" ||
        (knownCompleted &&
          ["PENDING", "DECLINED", "DENIED", "FAILED"].includes(
            capture.status,
          )) ||
        (!["COMPLETED", "PENDING", "DECLINED", "DENIED", "FAILED"].includes(
          capture.status,
        ) &&
          !validPartial &&
          !validFull &&
          !refundUncertain);
      const pending = capture.status === "PENDING";
      const failed =
        ["DECLINED", "DENIED", "FAILED"].includes(capture.status) &&
        !knownCompleted;
      const status = frozen
        ? "NEEDS_RECONCILIATION"
        : validFull
          ? "REFUNDED"
          : validPartial
            ? "PARTIALLY_REFUNDED"
            : completedNow
              ? "CAPTURED"
              : failed
                ? "FAILED"
                : pending
                  ? "CAPTURE_PENDING"
                  : "NEEDS_RECONCILIATION";
      const result = await tx.payment.update({
        where: { id: current.id },
        data: {
          paypalCaptureId: capture.id,
          captureAmountMinor: parseUsd(capture.amount.value),
          captureProviderStatus: capture.status,
          orderProviderStatus: order.status,
          status,
          lastVerifiedAt: new Date(),
          captureCompletedAt:
            current.captureCompletedAt ?? (completedNow ? new Date() : null),
          ledgerState: frozen
            ? "FROZEN"
            : completedNow || validPartial || validFull || refundUncertain
              ? "RECONCILED"
              : "UNVERIFIED",
          reconciliationReason: frozen
            ? "EXTERNAL_OR_UNSUPPORTED_CAPTURE_STATE"
            : refundUncertain
              ? "REFUND_UNRESOLVED"
              : null,
        },
      });
      await tx.checkoutOperation.updateMany({
        where: {
          paymentId: current.id,
          merchantId: current.merchantId,
          kind: "CAPTURE_ORDER",
        },
        data: {
          status:
            knownCompleted || completedNow || validPartial || validFull
              ? "COMPLETED"
              : failed
                ? "FAILED_FINAL"
                : pending
                  ? "PROVIDER_PENDING"
                  : "NEEDS_RECONCILIATION",
        },
      });
      if (completedNow && !knownCompleted) {
        await tx.order.update({
          where: { id: current.orderId },
          data: { purchasedAt: new Date() },
        });
        await this.audit(tx, result, principal, "PAYPAL_CAPTURE_COMPLETED", {
          paypalCaptureId: capture.id,
          amountMinor: result.captureAmountMinor!.toString(),
        });
      }
      return result;
    });
    return { payment: saved, order, capture };
  }

  async capture(principal: Principal, id: string) {
    await this.actor(principal);
    let payment = await this.payment(principal, id);
    const owner = await this.claim(payment);
    try {
      const initial = await this.refreshCapture(payment, owner, principal);
      payment = initial.payment;
      if (initial.capture) return payment;
      invariant(
        initial.order.status === "APPROVED",
        "BUYER_APPROVAL_REQUIRED",
        "Approve this order through PayPal before capture",
      );
      const op = await this.db.$transaction(async (tx) => {
        await this.locked(tx, payment, owner);
        const existing = await tx.checkoutOperation.findUnique({
          where: {
            paymentId_kind: { paymentId: payment.id, kind: "CAPTURE_ORDER" },
          },
        });
        invariant(
          !existing,
          "RECONCILIATION_REQUIRED",
          "Capture was already attempted; use reconciliation instead of submitting again",
        );
        return tx.checkoutOperation.create({
          data: {
            paymentId: payment.id,
            merchantId: payment.merchantId,
            kind: "CAPTURE_ORDER",
            requestId: randomUUID(),
            requestPayload: {},
            requestHash: digest({}),
            status: "PROCESSING",
            firstSentAt: new Date(),
            attemptCount: 1,
          },
        });
      });
      const receipt = await this.provider.captureOrder(
        payment.paypalOrderId!,
        op.requestId,
      );
      invariant(
        receipt.id === payment.paypalOrderId,
        "ORDER_MISMATCH",
        "Capture response refers to another order",
      );
      const result = await this.refreshCapture(payment, owner, principal);
      invariant(
        result.capture,
        "CAPTURE_UNCONFIRMED",
        "PayPal has not returned a verifiable capture",
      );
      return result.payment;
    } catch (error) {
      if (!(
        error instanceof PaymentError &&
        error.code === "BUYER_APPROVAL_REQUIRED"
      ))
        await this.uncertain(payment, owner, error, "CAPTURE_ORDER");
      throw error;
    } finally {
      await this.release(payment, owner);
    }
  }

  private async policy(payment: Payment, tx: Tx = this.db) {
    const policy = await tx.merchantPolicy.findFirst({
      where: {
        merchantId: payment.merchantId,
        usage: "PAYMENT",
        retiredAt: null,
        effectiveAt: { lte: new Date() },
      },
      orderBy: { version: "desc" },
    });
    const order = await tx.order.findFirstOrThrow({
      where: { id: payment.orderId, merchantId: payment.merchantId },
    });
    const snapshot = z
      .object({ category: z.string() })
      .safeParse(order.productSnapshot);
    invariant(
      policy &&
        policy.currency === "USD" &&
        policy.allowKeepWithoutReturn &&
        !policy.requireReturnReceipt &&
        snapshot.success &&
        policy.eligibleCategories.includes(snapshot.data.category) &&
        payment.expectedAmountMinor <= policy.manualReviewThresholdMinor &&
        order.origin === "PAYPAL_SANDBOX" &&
        order.timingProvenance === "UTC_RECORDED" &&
        order.purchasedAt &&
        Date.now() >= order.purchasedAt.getTime() &&
        Date.now() - order.purchasedAt.getTime() <=
          policy.returnWindowDays * 86400000,
      "POLICY_REVIEW_REQUIRED",
      "Policy, purchase timing or eligibility requires manual review; no refund submitted",
    );
    return policy;
  }

  async prepareRefund(
    principal: Principal,
    id: string,
    amount: string,
    reason: string,
  ) {
    await this.actor(principal);
    const payment = await this.payment(principal, id);
    invariant(
      !(await this.db.returnCase.findFirst({
        where: {
          orderId: payment.orderId,
          merchantId: payment.merchantId,
          workflowVersion: 1,
        },
      })),
      "CASE_WORKFLOW_REQUIRED",
      "Use the return case's exact resolution to authorize this refund",
      409,
    );
    const amountMinor = parseUsd(refundAmountSchema.parse(amount));
    reason = z.string().trim().min(3).max(255).parse(reason);
    invariant(
      amountMinor > 0n &&
        payment.captureCompletedAt &&
        payment.paypalCaptureId &&
        payment.ledgerState === "RECONCILED",
      "UNVERIFIED_CAPTURE",
      "A verified completed capture and positive refund amount are required",
    );
    const policy = await this.policy(payment);
    const [refunds, operations] = await Promise.all([
      this.db.providerRefund.findMany({
        where: { paymentId: payment.id, merchantId: payment.merchantId },
      }),
      this.db.refundOperation.findMany({
        where: { paymentId: payment.id, merchantId: payment.merchantId },
      }),
    ]);
    const balance = refundableBalance(payment, refunds, operations);
    invariant(
      balance.held === 0n && amountMinor <= balance.remaining,
      "AMOUNT_UNAVAILABLE",
      "Amount exceeds the available verified balance or another refund is unresolved",
    );
    const requiresConsent = amountMinor < payment.captureAmountMinor!;
    invariant(
      !requiresConsent || policy.allowPartialKeep,
      "PARTIAL_NOT_ALLOWED",
      "The current policy does not allow partial refunds",
    );
    const token = requiresConsent ? newToken() : undefined;
    const termsHash = digest({
      paymentId: payment.id,
      amountMinor: amountMinor.toString(),
      currency: "USD",
      reason,
      policyId: policy.id,
      terms: "sandbox-refund-v1",
    });
    const approval = await this.db.refundApproval.create({
      data: {
        merchantId: payment.merchantId,
        paymentId: payment.id,
        policyId: policy.id,
        requestedByUserId: principal.userId,
        amountMinor,
        currency: "USD",
        reason,
        termsHash,
        requiresConsent,
        consentTokenHash: token ? hashToken(token) : null,
        expiresAt: new Date(Date.now() + 30 * 60_000),
      },
    });
    return { approval, consentToken: token };
  }

  async consent(rawToken: string, accept: boolean) {
    invariant(
      opaqueTokenSchema.safeParse(rawToken).success,
      "INVALID_CONSENT_LINK",
      "Consent link is invalid or expired",
      404,
    );
    const approval = await this.db.refundApproval.findFirst({
      where: {
        consentTokenHash: hashToken(rawToken),
        expiresAt: { gt: new Date() },
        approvedAt: null,
        requiresConsent: true,
      },
      include: {
        merchant: { select: { name: true } },
        payment: { select: { order: { select: { publicOrderNumber: true } } } },
      },
    });
    invariant(
      approval,
      "INVALID_CONSENT_LINK",
      "Consent link is invalid or expired",
      404,
    );
    if (accept) {
      const result = await this.db.refundApproval.updateMany({
        where: {
          id: approval.id,
          merchantId: approval.merchantId,
          consentedAt: null,
          approvedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consentedAt: new Date() },
      });
      invariant(
        result.count === 1,
        "CONSENT_ALREADY_USED",
        "This offer has already been accepted or has expired",
      );
    }
    return {
      amountMinor: approval.amountMinor.toString(),
      currency: approval.currency,
      reason: approval.reason,
      merchantName: approval.merchant.name,
      orderNumber: approval.payment.order.publicOrderNumber,
      termsHash: approval.termsHash,
      accepted: accept || !!approval.consentedAt,
    };
  }

  private async settleRefund(
    payment: Payment,
    owner: string,
    refund: PayPalRefund,
    operationId?: string,
  ) {
    return this.db.$transaction(async (tx) => {
      const current = await this.locked(tx, payment, owner);
      const previous = await tx.providerRefund.findUnique({
        where: { paypalRefundId: refund.id },
      });
      invariant(
        !previous || previous.paymentId === current.id,
        "REFUND_MISMATCH",
        "Refund belongs to a different transaction",
      );
      const candidateId =
        operationId ?? previous?.operationId ?? refund.invoice_id;
      const operation =
        candidateId && z.uuid().safeParse(candidateId).success
          ? await tx.refundOperation.findFirst({
              where: {
                id: candidateId,
                merchantId: current.merchantId,
                paymentId: current.id,
              },
            })
          : await tx.refundOperation.findFirst({
              where: {
                candidateRefundId: refund.id,
                merchantId: current.merchantId,
                paymentId: current.id,
              },
            });
      verifyRefund(current, refund, operation);
      if (!operation) {
        const held = await tx.refundOperation.count({
          where: {
            merchantId: current.merchantId,
            paymentId: current.id,
            reservation: "HELD",
          },
        });
        invariant(
          held === 0,
          "REFUND_UNRESOLVED",
          "A refund with no operation reference arrived while a request is unresolved. Reconcile the original request ID before associating this event.",
        );
      }
      invariant(
        !operationId || operation,
        "REFUND_MISMATCH",
        "Refund operation is missing",
      );
      invariant(
        !previous ||
          (previous.amountMinor === parseUsd(refund.amount.value) &&
            previous.currency === refund.amount.currency_code),
        "REFUND_MISMATCH",
        "Previously verified refund amount changed",
      );
      invariant(
        !operation?.candidateRefundId ||
          operation.candidateRefundId === refund.id,
        "REFUND_MISMATCH",
        "One operation returned multiple refund IDs",
      );
      const regressed =
        previous?.providerStatus === "COMPLETED" &&
        refund.status !== "COMPLETED";
      const state = regressed ? "COMPLETED" : refund.status;
      const updated = refund.update_time ? new Date(refund.update_time) : null;
      const total = refund.seller_payable_breakdown?.total_refunded_amount;
      const record = await tx.providerRefund.upsert({
        where: { paypalRefundId: refund.id },
        create: {
          merchantId: current.merchantId,
          paymentId: current.id,
          operationId: operation?.id,
          paypalRefundId: refund.id,
          amountMinor: parseUsd(refund.amount.value),
          currency: "USD",
          providerStatus: state,
          external: !operation,
          verifiedAt: new Date(),
          providerUpdatedAt:
            updated && !Number.isNaN(updated.getTime()) ? updated : null,
          totalRefundedMinor: total ? parseUsd(total.value) : null,
        },
        update: {
          providerStatus: state,
          verifiedAt: new Date(),
          providerUpdatedAt:
            updated && !Number.isNaN(updated.getTime()) ? updated : undefined,
          totalRefundedMinor: total ? parseUsd(total.value) : undefined,
        },
      });
      if (operation)
        await tx.refundOperation.update({
          where: { id: operation.id },
          data: {
            candidateRefundId: refund.id,
            status:
              state === "COMPLETED"
                ? "COMPLETED"
                : state === "FAILED"
                  ? "FAILED_FINAL"
                  : state === "CANCELLED"
                    ? "CANCELLED"
                    : state === "PENDING"
                      ? "PROVIDER_PENDING"
                      : "NEEDS_RECONCILIATION",
            reservation:
              state === "COMPLETED"
                ? "SETTLED"
                : ["FAILED", "CANCELLED"].includes(state)
                  ? "RELEASED"
                  : "HELD",
            lastVerifiedAt: new Date(),
            lastErrorCode: null,
          },
        });
      const refunds = await tx.providerRefund.findMany({
        where: { paymentId: current.id, merchantId: current.merchantId },
      });
      const operations = await tx.refundOperation.findMany({
        where: { paymentId: current.id, merchantId: current.merchantId },
      });
      const balance = refundableBalance(current, refunds, operations);
      const unexplained =
        !!total &&
        parseUsd(total.value) > balance.completed &&
        state === "COMPLETED";
      const frozen =
        current.ledgerState === "FROZEN" ||
        !operation ||
        regressed ||
        unexplained;
      await tx.payment.update({
        where: { id: current.id },
        data: {
          ledgerState: frozen ? "FROZEN" : "RECONCILED",
          status: frozen
            ? "NEEDS_RECONCILIATION"
            : balance.completed === current.captureAmountMinor
              ? "REFUNDED"
              : balance.completed > 0n
                ? "PARTIALLY_REFUNDED"
                : "CAPTURED",
          reconciliationReason: frozen
            ? "EXTERNAL_OR_INCONSISTENT_REFUND"
            : null,
          version: { increment: 1 },
        },
      });
      if (!previous || previous.providerStatus !== state)
        await this.audit(
          tx,
          current,
          null,
          `PAYPAL_REFUND_${["PENDING", "COMPLETED", "FAILED", "CANCELLED"].includes(state) ? state : "UNKNOWN"}`,
          {
            paypalRefundId: refund.id,
            amountMinor: record.amountMinor.toString(),
            external: !operation,
          },
          operation?.id,
        );
      return record;
    });
  }

  private async sendRefund(
    payment: Payment,
    owner: string,
    operation: RefundOperation,
  ) {
    invariant(
      payment.paypalCaptureId,
      "UNVERIFIED_CAPTURE",
      "Capture reference is missing",
    );
    invariant(
      digest(operation.requestPayload) === operation.requestHash,
      "PAYLOAD_MISMATCH",
      "Persisted request changed",
    );
    if (operation.firstSentAt)
      invariant(
        operation.retryNotAfter &&
          operation.retryNotAfter.getTime() > Date.now(),
        "RETRY_WINDOW_CLOSED",
        "The conservative retry window has ended; retain the reservation and investigate manually",
      );
    await this.db.$transaction(async (tx) => {
      await this.locked(tx, payment, owner);
      await tx.refundOperation.update({
        where: { id: operation.id },
        data: {
          status: "PROCESSING",
          attemptCount: { increment: 1 },
          firstSentAt: operation.firstSentAt ?? new Date(),
          // PayPal's REST requests guide documents 45 days for refund request IDs.
          // Restrict this application to 24 hours and explicit authenticated retries.
          retryNotAfter:
            operation.retryNotAfter ?? new Date(Date.now() + 86400000),
        },
      });
    });
    const receipt = await this.provider.refundCapture(
      payment.paypalCaptureId,
      payloadObject(operation.requestPayload),
      operation.requestId,
    );
    await this.db.$transaction(async (tx) => {
      await this.locked(tx, payment, owner);
      await tx.refundOperation.update({
        where: { id: operation.id },
        data: { candidateRefundId: receipt.id },
      });
    });
    const verified = await this.provider.getRefund(receipt.id);
    invariant(
      verified.id === receipt.id,
      "REFUND_MISMATCH",
      "Refund lookup returned another ID",
    );
    await this.settleRefund(payment, owner, verified, operation.id);
    return this.db.refundOperation.findUniqueOrThrow({
      where: { id: operation.id },
    });
  }

  async approveRefund(
    principal: Principal,
    id: string,
    approvalId: string,
    confirmed: boolean,
    eligibilityConfirmed: boolean,
  ) {
    await this.actor(principal);
    invariant(
      confirmed === true && eligibilityConfirmed === true,
      "CONFIRMATION_REQUIRED",
      "Explicit amount confirmation and human eligibility review are required",
      400,
    );
    uuid(approvalId);
    let payment = await this.payment(principal, id);
    // A retry of this same approval can never create another operation.
    const existing = await this.db.refundOperation.findFirst({
      where: {
        approvalId,
        merchantId: payment.merchantId,
        paymentId: payment.id,
      },
    });
    if (existing) {
      await syncCaseRefunds(this.db, payment.id);
      return existing;
    }
    const owner = await this.claim(payment);
    let operation: RefundOperation | undefined;
    try {
      payment = (await this.refreshCapture(payment, owner, principal)).payment;
      operation = await this.db.$transaction(async (tx) => {
        const approval = await tx.refundApproval.findFirst({
          where: {
            id: approvalId,
            merchantId: payment.merchantId,
            paymentId: payment.id,
          },
        });
        if (approval?.caseId)
          await tx.$queryRaw`SELECT id FROM "ReturnCase" WHERE id=${approval.caseId}::uuid AND "merchantId"=${payment.merchantId}::uuid FOR UPDATE`;
        const current = await this.locked(tx, payment, owner);
        const authorized = await tx.user.findFirst({
          where: {
            id: principal.userId,
            merchantId: current.merchantId,
            disabledAt: null,
            role: "ADMIN",
            merchant: {
              paymentsEnabled: true,
              paypalMerchantId: this.configuredMerchantId,
            },
          },
        });
        invariant(
          authorized,
          "FORBIDDEN",
          "Administrator payment authorization required",
          403,
        );
        invariant(
          current.ledgerState === "RECONCILED" &&
            current.captureCompletedAt &&
            current.paypalCaptureId,
          "UNVERIFIED_CAPTURE",
          "A verified, reconciled capture is required",
        );
        invariant(
          approval && approval.requestedByUserId === principal.userId,
          "NOT_FOUND",
          "Refund approval not found",
          404,
        );
        invariant(
          !approval.approvedAt && approval.expiresAt.getTime() > Date.now(),
          "APPROVAL_EXPIRED",
          "Create a fresh refund review; this one was approved or expired",
        );
        const policy = approval.caseId
          ? (await validateCaseApproval(tx, this.db, approval, current, true),
            await tx.merchantPolicy.findUniqueOrThrow({
              where: { id: approval.policyId },
            }))
          : await this.policy(current, tx);
        if (!approval.caseId)
          invariant(
            !(await tx.returnCase.findFirst({
              where: {
                orderId: current.orderId,
                merchantId: current.merchantId,
                workflowVersion: 1,
              },
            })),
            "CASE_WORKFLOW_REQUIRED",
            "Use the return case refund authorization",
            409,
          );
        invariant(
          policy.id === approval.policyId &&
            (!approval.requiresConsent ||
              (policy.allowPartialKeep && approval.consentedAt)),
          "CONSENT_OR_POLICY_REQUIRED",
          "The exact partial refund must be accepted by the buyer and allowed by the current policy",
        );
        const [refunds, operations] = await Promise.all([
          tx.providerRefund.findMany({
            where: { merchantId: current.merchantId, paymentId: current.id },
          }),
          tx.refundOperation.findMany({
            where: { merchantId: current.merchantId, paymentId: current.id },
          }),
        ]);
        const balance = refundableBalance(current, refunds, operations);
        invariant(
          operations.length < 20,
          "REFUND_LIMIT",
          "This sandbox demonstration supports at most 20 refund operations per capture",
        );
        invariant(
          balance.held === 0n &&
            approval.amountMinor > 0n &&
            approval.amountMinor <= balance.remaining,
          "AMOUNT_UNAVAILABLE",
          "Another refund is unresolved or the requested amount exceeds the remaining balance",
        );
        const operationId = randomUUID();
        // An empty full-refund payload is permitted only on a fresh untouched capture.
        const fullFresh =
          !approval.caseId &&
          approval.amountMinor === current.captureAmountMinor &&
          refunds.length === 0 &&
          operations.length === 0 &&
          current.captureProviderStatus === "COMPLETED";
        const payload = fullFresh
          ? {}
          : {
              amount: {
                currency_code: "USD",
                value: usdDecimal(approval.amountMinor),
              },
              invoice_id: operationId,
              note_to_payer: approval.reason,
            };
        await tx.refundApproval.update({
          where: { id: approval.id },
          data: { approvedAt: new Date(), eligibilityConfirmedAt: new Date() },
        });
        const created = await tx.refundOperation.create({
          data: {
            id: operationId,
            merchantId: current.merchantId,
            paymentId: current.id,
            approvalId,
            amountMinor: approval.amountMinor,
            currency: "USD",
            requestId: randomUUID(),
            requestPayload: payload,
            requestHash: digest(payload),
          },
        });
        if (approval.caseId)
          await tx.returnCase.update({
            where: { id: approval.caseId },
            data: { status: "REFUND_PROCESSING", version: { increment: 1 } },
          });
        await this.audit(
          tx,
          current,
          principal,
          "REFUND_APPROVED_AND_RESERVED",
          {
            amountMinor: approval.amountMinor.toString(),
            currency: "USD",
            policyId: policy.id,
            termsHash: approval.termsHash,
          },
          created.id,
        );
        return created;
      });
      return await this.sendRefund(payment, owner, operation);
    } catch (error) {
      if (
        operation ||
        error instanceof ProviderError ||
        (error instanceof PaymentError && /MISMATCH/.test(error.code))
      )
        await this.uncertain(payment, owner, error, undefined, operation?.id);
      throw error;
    } finally {
      await this.release(payment, owner);
    }
  }

  async reconcile(principal: Principal, id: string, retryOperationId?: string) {
    await this.actor(principal);
    const payment = await this.payment(principal, id);
    return this.reconcilePayment(payment, principal, retryOperationId);
  }

  async reconcilePayment(
    payment: Payment,
    principal: Principal | null,
    retryOperationId?: string,
    discoveredRefund?: PayPalRefund,
  ) {
    invariant(
      payment.expectedPayeeId === this.configuredMerchantId,
      "MERCHANT_MISMATCH",
      "Unexpected sandbox merchant",
    );
    const owner = await this.claim(payment);
    try {
      // Book known refunds before interpreting a capture's PARTIALLY_REFUNDED state.
      if (discoveredRefund)
        await this.settleRefund(payment, owner, discoveredRefund);
      const operations = await this.db.refundOperation.findMany({
        where: { paymentId: payment.id, merchantId: payment.merchantId },
        orderBy: { createdAt: "asc" },
      });
      for (const op of operations)
        if (op.candidateRefundId) {
          const refund = await this.provider.getRefund(op.candidateRefundId);
          invariant(
            refund.id === op.candidateRefundId,
            "REFUND_MISMATCH",
            "Refund lookup returned another ID",
          );
          await this.settleRefund(payment, owner, refund, op.id);
        }
      let current = await this.db.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });
      current = (await this.refreshCapture(current, owner, principal)).payment;
      if (retryOperationId) {
        invariant(
          principal,
          "FORBIDDEN",
          "Only an authenticated merchant can retry a refund",
          403,
        );
        await this.actor(principal);
        const op = operations.find((o) => o.id === uuid(retryOperationId));
        invariant(
          op && !op.candidateRefundId && op.reservation === "HELD",
          "RETRY_NOT_ALLOWED",
          "Only an unresolved operation without a known refund ID may be retried",
        );
        invariant(
          current.ledgerState !== "FROZEN",
          "LEDGER_FROZEN",
          "External activity or identity mismatch requires manual investigation",
        );
        const approval = await this.db.refundApproval.findUniqueOrThrow({
          where: { id: op.approvalId },
        });
        if (approval.caseId)
          await this.db.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM "ReturnCase" WHERE id=${approval.caseId}::uuid FOR UPDATE`;
            await validateCaseApproval(tx, this.db, approval, current, false);
          });
        else await this.policy(current);
        await this.sendRefund(current, owner, op);
      }
      return await this.db.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });
    } catch (error) {
      await this.uncertain(payment, owner, error, undefined, retryOperationId);
      throw error;
    } finally {
      await this.release(payment, owner);
    }
  }
}
