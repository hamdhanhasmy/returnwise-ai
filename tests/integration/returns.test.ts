import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../../scripts/test-database";
import { ReturnService } from "@/server/services/returns";
import { conservativePolicy } from "@/lib/returns/contracts";
import { hashToken } from "@/lib/auth/tokens";
import { digest } from "@/server/services/payment-rules";
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  db = await testDatabase();
});
afterAll(async () => {
  await db?.$disconnect();
});
const rules = {
  ...conservativePolicy,
  allowReturnless: true,
  allowPartial: true,
  partialOfferMinor: "2000",
  maxPartialMinor: "3000",
  maxPartialBps: 5000,
  shippingMinor: "1800",
  handlingMinor: "700",
  recoveryMethod: "PRODUCT_ESTIMATE" as const,
  highValueMinor: "50000",
};
async function fixture() {
  const merchant = await db.merchant.create({
    data: {
      name: "Isolated returns test",
      sandboxAccountAlias: "AUTOMATED SYNTHETIC",
    },
  });
  const user = await db.user.create({
    data: {
      merchantId: merchant.id,
      email: `${randomUUID()}@example.invalid`,
      role: "ADMIN",
    },
  });
  const p = {
    merchantId: merchant.id,
    userId: user.id,
    email: user.email,
    role: user.role,
    merchantName: merchant.name,
  };
  const service = new ReturnService(db);
  const policy = await service.savePolicy(p, rules);
  const product = await db.product.create({
    data: {
      merchantId: merchant.id,
      name: "Synthetic bowl",
      sku: randomUUID(),
      category: "Home",
      currency: "USD",
      saleAmountMinor: 8000n,
      recoveryValueMinor: 1200n,
    },
  });
  const order = await db.order.create({
    data: {
      merchantId: merchant.id,
      productId: product.id,
      publicOrderNumber: randomUUID(),
      productSnapshot: { name: product.name, category: product.category },
      customerRef: "private-not-in-projection",
      currency: "USD",
      totalMinor: 8000n,
      origin: "SIMULATED",
      timingProvenance: "SIMULATED",
      purchasedAt: new Date(Date.now() - 86400000),
    },
  });
  const link = await service.issueAccess(p, order.id);
  const submission = {
    productId: product.id,
    reason: "DAMAGED",
    condition: "DAMAGED",
    description: "The synthetic bowl arrived with a large chipped rim.",
  };
  return { p, service, product, order, policy, link, submission };
}
async function submitted() {
  const f = await fixture();
  const result = await f.service.submit(f.link.token, f.submission);
  return {
    ...f,
    result,
    c: await db.returnCase.findUniqueOrThrow({ where: { id: result.caseId } }),
  };
}
async function propose(
  f: Awaited<ReturnType<typeof submitted>>,
  resolution: "FULL_REFUND_KEEP" | "PARTIAL_REFUND_KEEP" = "FULL_REFUND_KEEP",
) {
  await f.service.command(f.p, f.c.id, {
    action: "propose",
    version: f.c.version,
    note: "Customer-visible agreed remedy after entitlement review.",
    resolution,
    rightsConfirmed: true,
  });
  return f.service.customerView(f.result.token);
}
describe("return management on isolated PostgreSQL; no provider network", () => {
  it("rejects a previously evaluated case when purchase provenance becomes unreliable", async () => {
    const f = await submitted();
    await db.order.update({
      where: { id: f.order.id },
      data: { timingProvenance: "UNVERIFIED" },
    });
    await expect(
      f.service.command(f.p, f.c.id, {
        action: "propose",
        version: f.c.version,
        note: "Trusted timing must remain available",
        rightsConfirmed: true,
        resolution: "FULL_REFUND_KEEP",
      }),
    ).rejects.toMatchObject({ code: "STALE_FINANCIALS" });
  });
  it("rejects expired proposals, wrong case capabilities and missing rights review", async () => {
    const f = await submitted(),
      other = await submitted();
    await expect(
      f.service.command(f.p, f.c.id, {
        action: "propose",
        version: f.c.version,
        resolution: "PARTIAL_REFUND_KEEP",
        note: "Missing explicit entitlement review",
      }),
    ).rejects.toMatchObject({ code: "RIGHTS_REVIEW_REQUIRED" });
    const view = await propose(f, "PARTIAL_REFUND_KEEP");
    await propose(other, "PARTIAL_REFUND_KEEP");
    const otherView = await other.service.customerView(other.result.token);
    await expect(
      other.service.customerRespond(other.result.token, {
        action: "accept",
        version: otherView.case!.version,
        proposalId: view.proposal!.id,
        termsHash: view.proposal!.termsHash,
      }),
    ).rejects.toMatchObject({ code: "OFFER_UNAVAILABLE" });
    const expired = new ReturnService(
      db,
      () => new Date(Date.now() + 8 * 86400000),
    );
    await expect(
      expired.command(f.p, f.c.id, {
        action: "approve",
        version: view.case!.version,
        note: "Expired offer cannot be approved",
        rightsConfirmed: true,
      }),
    ).rejects.toMatchObject({ code: "ACCEPTANCE_REQUIRED" });
  });
  it("rejects invalid policy and malformed customer input without creating cases", async () => {
    const f = await fixture();
    await expect(
      f.service.savePolicy(f.p, { ...rules, shippingMinor: "-1" }),
    ).rejects.toThrow();
    await expect(
      f.service.submit(f.link.token, { ...f.submission, description: "short" }),
    ).rejects.toThrow();
    expect(await db.returnCase.count({ where: { orderId: f.order.id } })).toBe(
      0,
    );
  });
  it("submits once, snapshots policy, evaluates and projects only the authorized order", async () => {
    const f = await submitted(),
      view = await f.service.customerView(f.result.token);
    expect(f.c.status).toBe("EVALUATED");
    expect(f.c.recommendation).toBe("FULL_REFUND_KEEP");
    expect(view.productName).toBe(f.product.name);
    expect(JSON.stringify(view)).not.toContain("private-not-in-projection");
    expect(JSON.stringify(view)).not.toContain("shippingMinor");
    const stored = await db.accessToken.findUniqueOrThrow({
      where: { tokenHash: hashToken(f.result.token) },
    });
    expect(stored.tokenHash).not.toBe(f.result.token);
    expect(stored.caseId).toBe(f.c.id);
    expect(await db.auditLog.count({ where: { caseId: f.c.id } })).toBe(2);
    const epoch = await db.$queryRaw<
      { ms: number }[]
    >`SELECT (extract(epoch from "submittedAt")*1000)::double precision AS ms FROM "ReturnCase" WHERE id=${f.c.id}::uuid`;
    expect(epoch[0]?.ms).toBe(f.c.submittedAt!.getTime());
  });
  it("rejects invalid, expired, revoked and wrong-purpose customer access", async () => {
    const f = await fixture();
    await expect(f.service.customerView("invalid")).rejects.toMatchObject({
      code: "INVALID_ACCESS",
    });
    await expect(
      f.service.submit("a".repeat(43), f.submission),
    ).rejects.toThrow();
    await db.accessToken.update({
      where: { tokenHash: hashToken(f.link.token) },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    await expect(
      f.service.submit(f.link.token, f.submission),
    ).rejects.toMatchObject({ code: "INVALID_ACCESS" });
    const next = await f.service.issueAccess(f.p, f.order.id);
    await f.service.revokeAccess(f.p, f.order.id);
    await expect(f.service.customerView(next.token)).rejects.toMatchObject({
      code: "INVALID_ACCESS",
    });
  });
  it("rejects cross-tenant links and item substitution", async () => {
    const a = await fixture(),
      b = await fixture();
    await expect(a.service.issueAccess(a.p, b.order.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      a.service.submit(a.link.token, {
        ...a.submission,
        productId: b.product.id,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const result = await b.service.submit(b.link.token, b.submission);
    await expect(
      a.service.command(a.p, result.caseId, {
        action: "reject",
        version: 1,
        note: "Not my merchant case",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("prevents double and concurrent submissions", async () => {
    const f = await fixture();
    const results = await Promise.allSettled([
      f.service.submit(f.link.token, f.submission),
      f.service.submit(f.link.token, f.submission),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.returnCase.count({ where: { orderId: f.order.id } })).toBe(
      1,
    );
  });
  it("preserves immutable policy and evaluation when settings change", async () => {
    const f = await submitted();
    await f.service.savePolicy(f.p, { ...rules, allowReturnless: false });
    await f.service.command(f.p, f.c.id, {
      action: "evaluate",
      version: f.c.version,
      note: "Reevaluate the frozen snapshot",
    });
    const c = await db.returnCase.findUniqueOrThrow({ where: { id: f.c.id } });
    expect(c.policyId).toBe(f.policy.id);
    expect(c.recommendation).toBe("FULL_REFUND_KEEP");
    await expect(
      db.merchantPolicy.update({
        where: { id: f.policy.id },
        data: { returnWindowDays: 1 },
      }),
    ).rejects.toThrow();
    const evaluation = await db.returnEvaluation.findFirstOrThrow({
      where: { caseId: c.id },
    });
    await expect(
      db.returnEvaluation.update({
        where: { id: evaluation.id },
        data: { result: {} },
      }),
    ).rejects.toThrow();
    await expect(
      db.returnCase.update({
        where: { id: c.id },
        data: { policySnapshot: {} },
      }),
    ).rejects.toThrow();
  });
  it("records merchant approval without executing or fabricating a payment", async () => {
    const f = await submitted(),
      view = await propose(f);
    const result = await f.service.command(f.p, f.c.id, {
      action: "approve",
      version: view.case!.version,
      note: "Confirmed eligibility and customer rights",
      rightsConfirmed: true,
    });
    expect(result).toMatchObject({
      status: "APPROVED",
      paymentExecuted: false,
    });
    expect(
      await db.refundOperation.count({ where: { merchantId: f.p.merchantId } }),
    ).toBe(0);
    expect(
      await db.payment.count({ where: { merchantId: f.p.merchantId } }),
    ).toBe(0);
  });
  it("requires exact customer acceptance and protects terms for partial offers", async () => {
    const f = await submitted(),
      view = await propose(f, "PARTIAL_REFUND_KEEP");
    await expect(
      f.service.command(f.p, f.c.id, {
        action: "approve",
        version: view.case!.version,
        note: "Cannot bypass customer acceptance",
        rightsConfirmed: true,
      }),
    ).rejects.toMatchObject({ code: "ACCEPTANCE_REQUIRED" });
    await expect(
      f.service.customerRespond(f.result.token, {
        action: "accept",
        version: view.case!.version,
        proposalId: view.proposal!.id,
        termsHash: "wrong",
      }),
    ).rejects.toMatchObject({ code: "OFFER_UNAVAILABLE" });
    await expect(
      db.returnProposal.update({
        where: { id: view.proposal!.id },
        data: { amountMinor: 1n },
      }),
    ).rejects.toThrow();
    await f.service.customerRespond(f.result.token, {
      action: "accept",
      version: view.case!.version,
      proposalId: view.proposal!.id,
      termsHash: view.proposal!.termsHash,
    });
    const after = await f.service.customerView(f.result.token);
    await f.service.command(f.p, f.c.id, {
      action: "approve",
      version: after.case!.version,
      note: "Approved the exact customer accepted terms",
      rightsConfirmed: true,
    });
    expect((await f.service.customerView(f.result.token)).case!.status).toBe(
      "APPROVED",
    );
  });
  it("supports decline and additional-information workflow", async () => {
    const f = await submitted(),
      view = await propose(f, "PARTIAL_REFUND_KEEP");
    await f.service.customerRespond(f.result.token, {
      action: "decline",
      version: view.case!.version,
      proposalId: view.proposal!.id,
      termsHash: view.proposal!.termsHash,
    });
    let c = (await f.service.customerView(f.result.token)).case!;
    expect(c.status).toBe("MANUAL_REVIEW");
    await f.service.command(f.p, c.id, {
      action: "request-information",
      version: c.version,
      note: "Please describe the damaged component.",
    });
    c = (await f.service.customerView(f.result.token)).case!;
    await f.service.customerRespond(f.result.token, {
      action: "information",
      version: c.version,
      message: "The handle is completely detached from the bowl.",
    });
    expect((await f.service.customerView(f.result.token)).case!.status).toBe(
      "SUBMITTED",
    );
  });
  it("rejects concurrent transitions and inactive/staff administrators", async () => {
    const f = await submitted();
    const commands = await Promise.allSettled(
      ["manual-review", "reject"].map((action) =>
        f.service.command(f.p, f.c.id, {
          action: action as "reject" | "manual-review",
          version: f.c.version,
          note: "Documented concurrent merchant action",
        }),
      ),
    );
    expect(commands.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await db.user.update({
      where: { id: f.p.userId },
      data: { role: "STAFF" },
    });
    await expect(f.service.savePolicy(f.p, rules)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(f.service.issueAccess(f.p, f.order.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it("keeps legacy timing untrusted and manual requests unapprovable", async () => {
    const f = await fixture();
    await db.order.update({
      where: { id: f.order.id },
      data: { timingProvenance: "UNVERIFIED" },
    });
    const r = await f.service.submit(f.link.token, f.submission);
    const c = await db.returnCase.findUniqueOrThrow({
      where: { id: r.caseId },
    });
    expect(c.status).toBe("MANUAL_REVIEW");
    await expect(
      f.service.command(f.p, c.id, {
        action: "propose",
        version: c.version,
        resolution: "FULL_REFUND_KEEP",
        note: "Trying to bypass unknown purchase date",
        rightsConfirmed: true,
      }),
    ).rejects.toMatchObject({ code: "MANUAL_REVIEW_REQUIRED" });
  });
  it.each(["COMPLETED", "PENDING"])(
    "blocks decisions after a %s provider refund changes the evaluated balance",
    async (status) => {
      const f = await fixture();
      await db.order.update({
        where: { id: f.order.id },
        data: { origin: "PAYPAL_SANDBOX", timingProvenance: "UTC_RECORDED" },
      });
      const payment = await db.payment.create({
        data: {
          merchantId: f.p.merchantId,
          orderId: f.order.id,
          checkoutKey: randomUUID(),
          expectedPayeeId: "AUTOMATEDMOCK",
          expectedAmountMinor: 8000n,
          currency: "USD",
          status: "CAPTURED",
          paypalOrderId: randomUUID(),
          paypalCaptureId: randomUUID(),
          captureAmountMinor: 8000n,
          captureCompletedAt: new Date(),
          captureProviderStatus: "COMPLETED",
          ledgerState: "RECONCILED",
        },
      });
      const submitted = await f.service.submit(f.link.token, f.submission),
        c = await db.returnCase.findUniqueOrThrow({
          where: { id: submitted.caseId },
        });
      await db.providerRefund.create({
        data: {
          merchantId: f.p.merchantId,
          paymentId: payment.id,
          paypalRefundId: randomUUID(),
          amountMinor: status === "COMPLETED" ? 8000n : 100n,
          currency: "USD",
          providerStatus: status,
          external: true,
          verifiedAt: new Date(),
        },
      });
      await expect(
        f.service.command(f.p, c.id, {
          action: "propose",
          version: c.version,
          resolution: "FULL_REFUND_KEEP",
          note: "Current provider balances must be rechecked",
          rightsConfirmed: true,
        }),
      ).rejects.toMatchObject({ code: "STALE_FINANCIALS" });
      await f.service.command(f.p, c.id, {
        action: "evaluate",
        version: c.version,
        note: "Recheck changed ledger",
      });
      expect(
        (await db.returnCase.findUniqueOrThrow({ where: { id: c.id } })).status,
      ).toBe("MANUAL_REVIEW");
    },
  );
  it("can reproduce the persisted recommendation from its exact input hash", async () => {
    const f = await submitted();
    const e = await db.returnEvaluation.findFirstOrThrow({
      where: { caseId: f.c.id },
    });
    expect(digest(e.inputs)).toBe(e.inputHash);
    expect(e.logicVersion).toBe("returns-v2-reviewed-evidence");
  });
});
