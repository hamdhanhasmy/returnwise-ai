import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../../scripts/test-database";
import { FakePayPal } from "../fixtures/paypal";
import { PaymentService } from "@/server/services/payments";
import { WebhookService } from "@/server/services/webhooks";
import { ProviderError } from "@/lib/payments/paypal-client";
import { refundableBalance } from "@/server/services/payment-rules";
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  db = await testDatabase();
});
afterAll(async () => {
  await db?.$disconnect();
});
async function fixture(captured = true) {
  const fakeMerchantId = randomUUID().replaceAll("-", "").toUpperCase();
  const merchant = await db.merchant.create({
    data: {
      name: "Isolated mock PayPal merchant",
      sandboxAccountAlias: "AUTOMATED MOCK",
      paypalMerchantId: fakeMerchantId,
      paymentsEnabled: true,
    },
  });
  const user = await db.user.create({
    data: {
      merchantId: merchant.id,
      email: `${randomUUID()}@example.invalid`,
      role: "ADMIN",
    },
  });
  const principal = {
    userId: user.id,
    merchantId: merchant.id,
    email: user.email,
    role: user.role,
    merchantName: merchant.name,
  };
  await db.merchantPolicy.create({
    data: {
      merchantId: merchant.id,
      version: 1,
      effectiveAt: new Date(Date.now() - 10000),
      returnWindowDays: 30,
      eligibleCategories: ["Home"],
      allowKeepWithoutReturn: true,
      allowPartialKeep: true,
      requireReturnReceipt: false,
      manualReviewThresholdMinor: 100000n,
      currency: "USD",
      termsVersion: "test-v1",
      rulesJson: { source: "AUTOMATED_MOCK" },
    },
  });
  const product = await db.product.create({
    data: {
      merchantId: merchant.id,
      name: "Mock product",
      sku: randomUUID(),
      category: "Home",
      currency: "USD",
      saleAmountMinor: 8000n,
      recoveryValueMinor: 0n,
    },
  });
  const provider = new FakePayPal(fakeMerchantId),
    service = new PaymentService(db, provider, fakeMerchantId),
    key = randomUUID();
  let payment = await service.create(principal, product.id, key);
  if (captured) {
    provider.approve(payment.paypalOrderId!);
    payment = await service.capture(principal, payment.id);
  }
  return { principal, product, provider, service, payment, key };
}
async function review(
  f: Awaited<ReturnType<typeof fixture>>,
  amount = "80.00",
) {
  const r = await f.service.prepareRefund(
    f.principal,
    f.payment.id,
    amount,
    "Buyer agreed sandbox resolution",
  );
  if (r.consentToken) await f.service.consent(r.consentToken, true);
  return r.approval;
}
async function balance(id: string) {
  const p = await db.payment.findUniqueOrThrow({
    where: { id },
    include: { providerRefunds: true, refundOperations: true },
  });
  return refundableBalance(p, p.providerRefunds, p.refundOperations);
}
const headers = () =>
  new Headers({
    "paypal-cert-url":
      "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-test",
    "paypal-auth-algo": "SHA256withRSA",
    "paypal-transmission-id": randomUUID(),
    "paypal-transmission-sig": "mock-signature",
    "paypal-transmission-time": new Date().toISOString(),
  });
describe("isolated PostgreSQL payment ledger with mocked PayPal", () => {
  it("requires trusted UTC purchase timing before refund review", async () => {
    const f = await fixture();
    await db.order.update({
      where: { id: f.payment.orderId },
      data: { timingProvenance: "UNVERIFIED" },
    });
    await expect(review(f)).rejects.toMatchObject({
      code: "POLICY_REVIEW_REQUIRED",
    });
    expect(
      await db.refundOperation.count({ where: { paymentId: f.payment.id } }),
    ).toBe(0);
    await db.order.update({
      where: { id: f.payment.orderId },
      data: {
        timingProvenance: "UTC_RECORDED",
        purchasedAt: new Date(Date.now() + 86400000),
      },
    });
    await expect(review(f)).rejects.toMatchObject({
      code: "POLICY_REVIEW_REQUIRED",
    });
  });
  it("commits capture intent and refund reservation before provider I/O", async () => {
    const f = await fixture(false);
    const capture = f.provider.captureOrder.getMockImplementation()!;
    f.provider.captureOrder.mockImplementationOnce(
      async (orderId, requestId) => {
        const intent = await db.checkoutOperation.findUniqueOrThrow({
          where: {
            paymentId_kind: { paymentId: f.payment.id, kind: "CAPTURE_ORDER" },
          },
        });
        expect(intent.requestId).toBe(requestId);
        expect(intent.status).toBe("PROCESSING");
        expect(intent.firstSentAt).not.toBeNull();
        return capture(orderId, requestId);
      },
    );
    f.provider.approve(f.payment.paypalOrderId!);
    await f.service.capture(f.principal, f.payment.id);
    const approval = await review(f, "20.00");
    const refund = f.provider.refundCapture.getMockImplementation()!;
    f.provider.refundCapture.mockImplementationOnce(
      async (captureId, payload, requestId) => {
        const intent = await db.refundOperation.findUniqueOrThrow({
          where: { approvalId: approval.id },
        });
        expect(intent.requestId).toBe(requestId);
        expect(intent.requestPayload).toEqual(payload);
        expect(intent.reservation).toBe("HELD");
        expect(intent.amountMinor).toBe(2000n);
        expect(intent.firstSentAt).not.toBeNull();
        expect((await balance(f.payment.id)).held).toBe(2000n);
        return refund(captureId, payload, requestId);
      },
    );
    await f.service.approveRefund(
      f.principal,
      f.payment.id,
      approval.id,
      true,
      true,
    );
    expect(f.provider.captureOrder).toHaveBeenCalledTimes(1);
    expect(f.provider.refundCapture).toHaveBeenCalledTimes(1);
    expect((await balance(f.payment.id)).completed).toBe(2000n);
  });
  it("full-refund timeout plus early webhook remains recoverable by the same request ID", async () => {
    const f = await fixture(),
      a = await review(f);
    const real = f.provider.refundCapture.getMockImplementation()!;
    f.provider.refundCapture.mockImplementationOnce(async (...args) => {
      await real(...args);
      throw new ProviderError("NETWORK_OR_TIMEOUT", true, true);
    });
    await expect(
      f.service.approveRefund(f.principal, f.payment.id, a.id, true, true),
    ).rejects.toThrow();
    const op = await db.refundOperation.findUniqueOrThrow({
        where: { approvalId: a.id },
      }),
      refund = [...f.provider.refunds.values()][0]!;
    const event = {
      id: randomUUID(),
      event_type: "PAYMENT.CAPTURE.REFUNDED",
      resource: { id: refund.id },
    };
    const webhook = new WebhookService(f.service, "registered-test");
    await expect(webhook.receive(headers(), event)).rejects.toMatchObject({
      code: "REFUND_UNRESOLVED",
    });
    expect((await balance(f.payment.id)).held).toBe(8000n);
    await f.service.reconcile(f.principal, f.payment.id, op.id);
    await webhook.receive(headers(), event);
    expect(f.provider.refunds.size).toBe(1);
    expect((await balance(f.payment.id)).completed).toBe(8000n);
  });
  it("creates at persisted price and reuses checkout key", async () => {
    const f = await fixture(false);
    const again = await f.service.create(f.principal, f.product.id, f.key);
    expect(again.id).toBe(f.payment.id);
    expect(f.provider.createOrder).toHaveBeenCalledTimes(1);
    expect(f.payment.expectedAmountMinor).toBe(8000n);
  });
  it("captures only approved orders, verifies IDs, and never captures twice", async () => {
    const f = await fixture(false);
    await expect(
      f.service.capture(f.principal, f.payment.id),
    ).rejects.toMatchObject({ code: "BUYER_APPROVAL_REQUIRED" });
    expect(f.provider.captureOrder).not.toHaveBeenCalled();
    f.provider.approve(f.payment.paypalOrderId!);
    const p = await f.service.capture(f.principal, f.payment.id);
    expect(p.status).toBe("CAPTURED");
    expect(p.paypalCaptureId).toBeTruthy();
    await f.service.capture(f.principal, p.id);
    expect(f.provider.captureOrder).toHaveBeenCalledTimes(1);
  });
  it("rejects missing identity, inactive users, and staff payment actions", async () => {
    const f = await fixture();
    await expect(
      f.service.prepareRefund(
        { ...f.principal, userId: randomUUID() },
        f.payment.id,
        "80",
        "Reason",
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db.user.update({
      where: { id: f.principal.userId },
      data: { role: "STAFF" },
    });
    await expect(
      f.service.prepareRefund(f.principal, f.payment.id, "80", "Reason"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("rejects cross-tenant payment references", async () => {
    const a = await fixture(),
      b = await fixture();
    await expect(
      a.service.prepareRefund(a.principal, b.payment.id, "80", "Reason"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(a.provider.refundCapture).not.toHaveBeenCalled();
  });
  it("freezes incorrect order amount before capture", async () => {
    const f = await fixture(false);
    f.provider.orders.get(
      f.payment.paypalOrderId!,
    )!.purchase_units[0]!.amount.value = "79.99";
    await expect(
      f.service.capture(f.principal, f.payment.id),
    ).rejects.toMatchObject({ code: "ORDER_MISMATCH" });
    expect(f.provider.captureOrder).not.toHaveBeenCalled();
    expect(
      (await db.payment.findUniqueOrThrow({ where: { id: f.payment.id } }))
        .ledgerState,
    ).toBe("FROZEN");
  });
  it("rejects a capture belonging to another payee or order", async () => {
    const f = await fixture();
    f.provider.captures.get(f.payment.paypalCaptureId!)!.payee = {
      merchant_id: "OTHER",
    };
    await expect(
      f.service.reconcile(f.principal, f.payment.id),
    ).rejects.toMatchObject({ code: "CAPTURE_MISMATCH" });
    await expect(
      f.service.prepareRefund(f.principal, f.payment.id, "80", "Reason"),
    ).rejects.toMatchObject({ code: "UNVERIFIED_CAPTURE" });
  });
  it("records a failed capture without reporting success", async () => {
    const f = await fixture(false);
    f.provider.captureStatus = "DECLINED";
    f.provider.approve(f.payment.paypalOrderId!);
    const p = await f.service.capture(f.principal, f.payment.id);
    expect(p.status).toBe("FAILED");
    expect(p.captureCompletedAt).toBeNull();
    await expect(review(f)).rejects.toMatchObject({
      code: "UNVERIFIED_CAPTURE",
    });
  });
  it("full refund is verified and duplicate confirmation reuses its operation", async () => {
    const f = await fixture(),
      a = await review(f);
    const op = await f.service.approveRefund(
      f.principal,
      f.payment.id,
      a.id,
      true,
      true,
    );
    expect(op.status).toBe("COMPLETED");
    expect(op.candidateRefundId).toBeTruthy();
    expect(f.provider.refundCapture.mock.calls[0]![1]).toEqual({});
    const again = await f.service.approveRefund(
      f.principal,
      f.payment.id,
      a.id,
      true,
      true,
    );
    expect(again.id).toBe(op.id);
    expect(f.provider.refundCapture).toHaveBeenCalledTimes(1);
    expect((await balance(f.payment.id)).remaining).toBe(0n);
  });
  it("requires exact buyer consent and human confirmation for partial refunds", async () => {
    const f = await fixture();
    const r = await f.service.prepareRefund(
      f.principal,
      f.payment.id,
      "20",
      "Partial agreement",
    );
    await expect(
      f.service.approveRefund(
        f.principal,
        f.payment.id,
        r.approval.id,
        true,
        true,
      ),
    ).rejects.toMatchObject({ code: "CONSENT_OR_POLICY_REQUIRED" });
    await f.service.consent(r.consentToken!, true);
    await expect(f.service.consent(r.consentToken!, true)).rejects.toThrow();
    await expect(
      f.service.approveRefund(
        f.principal,
        f.payment.id,
        r.approval.id,
        false,
        true,
      ),
    ).rejects.toMatchObject({ code: "CONFIRMATION_REQUIRED" });
    await f.service.approveRefund(
      f.principal,
      f.payment.id,
      r.approval.id,
      true,
      true,
    );
    expect((await balance(f.payment.id)).remaining).toBe(6000n);
  });
  it("multiple partial refunds use exact integer balances", async () => {
    const f = await fixture();
    for (const amount of ["20.01", "29.99", "30"]) {
      const a = await review(f, amount);
      await f.service.approveRefund(
        f.principal,
        f.payment.id,
        a.id,
        true,
        true,
      );
    }
    expect((await balance(f.payment.id)).completed).toBe(8000n);
    expect(f.provider.refundCapture).toHaveBeenCalledTimes(3);
  });
  it.each(["0", "-1", "80.01", "1.001"])(
    "rejects invalid or excessive amount %s",
    async (amount) => {
      const f = await fixture();
      await expect(review(f, amount)).rejects.toThrow();
      expect(f.provider.refundCapture).not.toHaveBeenCalled();
    },
  );
  it("concurrent refunds cannot over-reserve or over-refund", async () => {
    const f = await fixture(),
      a = await review(f, "60"),
      b = await review(f, "60");
    const results = await Promise.allSettled([
      f.service.approveRefund(f.principal, f.payment.id, a.id, true, true),
      f.service.approveRefund(f.principal, f.payment.id, b.id, true, true),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(f.provider.refundCapture).toHaveBeenCalledTimes(1);
    expect((await balance(f.payment.id)).remaining).toBe(2000n);
  });
  it("capture timeout after processing reconciles through GET without replay", async () => {
    const f = await fixture(false);
    f.provider.approve(f.payment.paypalOrderId!);
    const real = f.provider.captureOrder.getMockImplementation()!;
    f.provider.captureOrder.mockImplementationOnce(async (...args) => {
      await real(...args);
      throw new ProviderError("NETWORK_OR_TIMEOUT", true, true);
    });
    await expect(
      f.service.capture(f.principal, f.payment.id),
    ).rejects.toThrow();
    expect((await f.service.reconcile(f.principal, f.payment.id)).status).toBe(
      "CAPTURED",
    );
    expect(f.provider.captureOrder).toHaveBeenCalledTimes(1);
  });
  it("ambiguous refund retains reservation and retries exact key after restart", async () => {
    const f = await fixture(),
      a = await review(f, "25");
    const real = f.provider.refundCapture.getMockImplementation()!;
    f.provider.refundCapture.mockImplementationOnce(async (...args) => {
      await real(...args);
      throw new ProviderError("NETWORK_OR_TIMEOUT", true, true);
    });
    await expect(
      f.service.approveRefund(f.principal, f.payment.id, a.id, true, true),
    ).rejects.toThrow();
    const op = await db.refundOperation.findUniqueOrThrow({
      where: { approvalId: a.id },
    });
    expect(op.reservation).toBe("HELD");
    expect((await balance(f.payment.id)).remaining).toBe(5500n);
    await expect(review(f, "10")).rejects.toThrow();
    const restarted = new PaymentService(db, f.provider, f.provider.merchantId);
    await restarted.reconcile(f.principal, f.payment.id, op.id);
    expect(f.provider.refundCapture.mock.calls[1]![2]).toBe(
      f.provider.refundCapture.mock.calls[0]![2],
    );
    expect(f.provider.refunds.size).toBe(1);
    expect((await balance(f.payment.id)).completed).toBe(2500n);
  });
  it("pending refunds hold funds until provider reconciliation completes", async () => {
    const f = await fixture(),
      a = await review(f, "20");
    f.provider.refundStatus = "PENDING";
    const op = await f.service.approveRefund(
      f.principal,
      f.payment.id,
      a.id,
      true,
      true,
    );
    expect(op.status).toBe("PROVIDER_PENDING");
    expect(op.reservation).toBe("HELD");
    const r = f.provider.refunds.get(op.candidateRefundId!)!;
    r.status = "COMPLETED";
    f.provider.syncCapture(f.payment.paypalCaptureId!);
    await f.service.reconcile(f.principal, f.payment.id);
    expect(await balance(f.payment.id)).toEqual({
      remaining: 6000n,
      completed: 2000n,
      held: 0n,
    });
  });
  it("invalid signature never persists or changes payment records", async () => {
    const f = await fixture(),
      webhooks = new WebhookService(f.service, "registered-test-id"),
      id = randomUUID();
    f.provider.verifyWebhook.mockResolvedValueOnce(false);
    await expect(
      webhooks.receive(headers(), {
        id,
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: { id: f.payment.paypalCaptureId },
      }),
    ).rejects.toMatchObject({ code: "INVALID_SIGNATURE" });
    expect(await db.webhookEvent.findUnique({ where: { id } })).toBeNull();
  });
  it("duplicate and out-of-order webhooks use current provider truth", async () => {
    const f = await fixture(),
      a = await review(f);
    await f.service.approveRefund(f.principal, f.payment.id, a.id, true, true);
    const webhook = new WebhookService(f.service, "registered-test-id");
    const event = {
      id: randomUUID(),
      event_type: "PAYMENT.CAPTURE.PENDING",
      resource: { id: f.payment.paypalCaptureId, status: "PENDING" },
    };
    await webhook.receive(headers(), event);
    const reads = f.provider.getCapture.mock.calls.length;
    expect(await webhook.receive(headers(), event)).toEqual({
      duplicate: true,
    });
    expect(f.provider.getCapture).toHaveBeenCalledTimes(reads);
    expect(
      (await db.payment.findUniqueOrThrow({ where: { id: f.payment.id } }))
        .status,
    ).toBe("REFUNDED");
  });
  it("immutability constraints block changing approved money and request identity", async () => {
    const f = await fixture(),
      a = await review(f);
    await expect(
      db.refundApproval.update({
        where: { id: a.id },
        data: { amountMinor: 1n },
      }),
    ).rejects.toThrow();
    const op = await f.service.approveRefund(
      f.principal,
      f.payment.id,
      a.id,
      true,
      true,
    );
    await expect(
      db.refundOperation.update({
        where: { id: op.id },
        data: { requestId: randomUUID() },
      }),
    ).rejects.toThrow();
    await expect(
      db.payment.update({
        where: { id: f.payment.id },
        data: { expectedAmountMinor: 1n },
      }),
    ).rejects.toThrow();
  });
  it("ambiguous order creation never issues a second POST on refresh", async () => {
    const f = await fixture(false),
      key = randomUUID();
    const real = f.provider.createOrder.getMockImplementation()!;
    f.provider.createOrder.mockImplementationOnce(async (...args) => {
      await real(...args);
      throw new ProviderError("NETWORK_OR_TIMEOUT", true, true);
    });
    await expect(
      f.service.create(f.principal, f.product.id, key),
    ).rejects.toThrow();
    await expect(
      f.service.create(f.principal, f.product.id, key),
    ).rejects.toMatchObject({ code: "RECONCILIATION_REQUIRED" });
    expect(f.provider.createOrder).toHaveBeenCalledTimes(2);
  });
  it.each(["FAILED", "CANCELLED"])(
    "verified %s refund releases only that reservation",
    async (status) => {
      const f = await fixture(),
        a = await review(f, "10");
      f.provider.refundStatus = status;
      const op = await f.service.approveRefund(
        f.principal,
        f.payment.id,
        a.id,
        true,
        true,
      );
      expect(op.reservation).toBe("RELEASED");
      expect((await balance(f.payment.id)).remaining).toBe(8000n);
    },
  );
  it("incorrect refund amount remains held and freezes the ledger", async () => {
    const f = await fixture(),
      a = await review(f, "20");
    const real = f.provider.getRefund.getMockImplementation()!;
    f.provider.getRefund.mockImplementationOnce(async (id) => ({
      ...(await real(id)),
      amount: { currency_code: "USD", value: "20.01" },
    }));
    await expect(
      f.service.approveRefund(f.principal, f.payment.id, a.id, true, true),
    ).rejects.toMatchObject({ code: "REFUND_MISMATCH" });
    expect((await balance(f.payment.id)).held).toBe(2000n);
    expect(
      (await db.payment.findUniqueOrThrow({ where: { id: f.payment.id } }))
        .ledgerState,
    ).toBe("FROZEN");
  });
  it("expired refund retry window never replays a financial request", async () => {
    const f = await fixture(),
      a = await review(f, "20");
    f.provider.refundCapture.mockRejectedValueOnce(
      new ProviderError("NETWORK_OR_TIMEOUT", true, true),
    );
    await expect(
      f.service.approveRefund(f.principal, f.payment.id, a.id, true, true),
    ).rejects.toThrow();
    const op = await db.refundOperation.findUniqueOrThrow({
      where: { approvalId: a.id },
    });
    await db.refundOperation.update({
      where: { id: op.id },
      data: { retryNotAfter: new Date(0) },
    });
    await expect(
      f.service.reconcile(f.principal, f.payment.id, op.id),
    ).rejects.toMatchObject({ code: "RETRY_WINDOW_CLOSED" });
    expect(f.provider.refundCapture).toHaveBeenCalledTimes(1);
    expect((await balance(f.payment.id)).held).toBe(2000n);
  });
  it("registered refund webhook settles a pending partial refund without a second POST", async () => {
    const f = await fixture(),
      a = await review(f, "20");
    f.provider.refundStatus = "PENDING";
    const op = await f.service.approveRefund(
      f.principal,
      f.payment.id,
      a.id,
      true,
      true,
    );
    const r = f.provider.refunds.get(op.candidateRefundId!)!;
    r.status = "COMPLETED";
    f.provider.syncCapture(f.payment.paypalCaptureId!);
    await new WebhookService(f.service, "registered-test").receive(headers(), {
      id: randomUUID(),
      event_type: "PAYMENT.CAPTURE.REFUNDED",
      resource: { id: r.id, status: "PENDING" },
    });
    expect((await balance(f.payment.id)).completed).toBe(2000n);
    expect(f.provider.refundCapture).toHaveBeenCalledTimes(1);
  });
});
