import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../../scripts/test-database";
import { caseRefundFixture } from "../fixtures/case-refund";
import { EvidenceService } from "@/server/services/evidence";
import { aiConfig } from "@/lib/ai/config";
import { CONSENT_VERSION } from "@/lib/ai/contracts";
import { syntheticImage, mockAssessment } from "../fixtures/evidence";
import { ProviderError } from "@/lib/payments/paypal-client";
import { WebhookService } from "@/server/services/webhooks";
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  db = await testDatabase();
});
afterAll(async () => {
  await db?.$disconnect();
});
const ready = async () => {
  const f = await caseRefundFixture(db);
  await f.propose();
  await f.approve();
  return f;
};
describe("case-linked financial orchestration with mocked providers", () => {
  it("completes customer evidence, reviewed AI, deterministic proposal and verified refund with audit", async () => {
    const f = await caseRefundFixture(db),
      e = new EvidenceService(
        db,
        aiConfig({ AI_ENABLED: "true", DEEPSEEK_API_KEY: "mock-case-flow" }),
        {
          analyze: vi.fn(async () => ({
            assessment: mockAssessment,
            usage: { promptTokens: 100, cachedTokens: 0, completionTokens: 80 },
            latencyMs: 1,
          })),
        },
        randomUUID(),
      );
    await e.upload(f.token, await syntheticImage(), "image/png", true);
    await e.consent(f.token, true, CONSENT_VERSION);
    await e.analyze(f.p, f.caseId);
    let c = await f.current();
    await f.returns.command(f.p, c.id, {
      action: "evaluate",
      version: c.version,
      note: "Evaluate current observed evidence",
    });
    expect((await f.current()).status).toBe("MANUAL_REVIEW");
    await e.review(
      f.p,
      c.id,
      c.evidenceRevision,
      "Independently reviewed image limitations and customer entitlement.",
    );
    c = await f.current();
    await f.returns.command(f.p, c.id, {
      action: "evaluate",
      version: c.version,
      note: "Human evidence review completed",
    });
    await f.propose();
    await f.approve();
    const original = f.provider.refundCapture.getMockImplementation()!;
    f.provider.refundCapture.mockImplementationOnce(
      async (id, payload, key) => {
        expect(
          await db.refundOperation.count({
            where: { paymentId: f.payment.id, reservation: "HELD" },
          }),
        ).toBe(1);
        expect((await f.current()).status).toBe("REFUND_PROCESSING");
        return original(id, payload, key);
      },
    );
    const op = await f.service.execute(f.p, c.id, await f.request());
    expect(op.status).toBe("COMPLETED");
    expect((await f.current()).status).toBe("CLOSED");
    expect((await f.returns.customerView(f.token)).refund?.providerStatus).toBe(
      "COMPLETED",
    );
    const actions = (
      await db.auditLog.findMany({ where: { caseId: c.id } })
    ).map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "CASE_SUBMITTED",
        "AI_ATTEMPT_RECORDED",
        "EVIDENCE_HUMAN_REVIEWED",
        "CASE_APPROVE",
        "CASE_REFUND_AUTHORIZED",
        "CASE_REFUND_COMPLETED_AND_CLOSED",
      ]),
    );
  });
  it("requires exact partial acceptance and rejects declined or stale offers", async () => {
    const f = await caseRefundFixture(db),
      proposal = await f.propose("PARTIAL_REFUND_KEEP");
    await expect(f.approve()).rejects.toMatchObject({
      code: "ACCEPTANCE_REQUIRED",
    });
    let c = await f.current();
    await expect(
      f.returns.customerRespond(f.token, {
        action: "accept",
        version: c.version,
        proposalId: proposal.id,
        termsHash: "bad",
      }),
    ).rejects.toMatchObject({ code: "OFFER_UNAVAILABLE" });
    await f.returns.customerRespond(f.token, {
      action: "decline",
      version: c.version,
      proposalId: proposal.id,
      termsHash: proposal.termsHash,
    });
    await expect(f.approve()).rejects.toThrow();
    c = await f.current();
    await f.returns.command(f.p, c.id, {
      action: "evaluate",
      version: c.version,
      note: "Review declined proposal alternatives",
    });
    const next = await f.propose("PARTIAL_REFUND_KEEP");
    c = await f.current();
    await expect(
      f.returns.customerRespond(f.token, {
        action: "accept",
        version: c.version,
        proposalId: proposal.id,
        termsHash: proposal.termsHash,
      }),
    ).rejects.toMatchObject({ code: "OFFER_UNAVAILABLE" });
    await f.returns.customerRespond(f.token, {
      action: "accept",
      version: c.version,
      proposalId: next.id,
      termsHash: next.termsHash,
    });
    await f.approve();
    const op = await f.service.execute(f.p, c.id, await f.request());
    expect(op.amountMinor).toBe(2000n);
    expect(op.status).toBe("COMPLETED");
    expect((await f.current()).status).toBe("CLOSED");
  });
  it("blocks cross-tenant, staff, stale terms and missing confirmation", async () => {
    const f = await ready(),
      other = await ready(),
      request = await f.request();
    await expect(
      other.service.execute(other.p, f.caseId, request),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      f.service.execute(f.p, f.caseId, {
        ...request,
        termsHash: "0".repeat(64),
      }),
    ).rejects.toMatchObject({ code: "ACCEPTANCE_REQUIRED" });
    await expect(
      f.service.execute(f.p, f.caseId, { ...request, confirmed: false }),
    ).rejects.toMatchObject({ code: "CONFIRMATION_REQUIRED" });
    await db.user.update({
      where: { id: f.p.userId },
      data: { role: "STAFF" },
    });
    await expect(
      f.service.execute(f.p, f.caseId, request),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.provider.refundCapture).not.toHaveBeenCalled();
  });
  it("deduplicates simultaneous confirmations and refreshes without a second operation", async () => {
    const f = await ready(),
      request = await f.request();
    const results = await Promise.allSettled([
      f.service.execute(f.p, f.caseId, request),
      f.service.execute(f.p, f.caseId, request),
    ]);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    await f.service.execute(f.p, f.caseId, request);
    expect(f.provider.refundCapture).toHaveBeenCalledTimes(1);
    expect(
      await db.refundOperation.count({ where: { paymentId: f.payment.id } }),
    ).toBe(1);
  });
  it("requires verified physical return receipt before executing", async () => {
    const f = await caseRefundFixture(db);
    await f.propose("FULL_REFUND_RETURN");
    await f.approve();
    await expect(
      f.service.execute(f.p, f.caseId, await f.request()),
    ).rejects.toMatchObject({ code: "RETURN_RECEIPT_REQUIRED" });
    await f.service.receipt(
      f.p,
      f.caseId,
      (await f.current()).version,
      "Received the correct bowl and inspected its damaged condition.",
    );
    expect(
      (await f.service.execute(f.p, f.caseId, await f.request())).status,
    ).toBe("COMPLETED");
  });
  it.each(["PENDING", "FAILED", "CANCELLED"])(
    "maps verified provider %s without falsely closing",
    async (status) => {
      const f = await ready();
      f.provider.refundStatus = status;
      const op = await f.service.execute(f.p, f.caseId, await f.request());
      expect((await f.current()).status).toBe(
        status === "PENDING" ? "REFUND_PENDING" : "REFUND_FAILED",
      );
      expect(op.status).not.toBe("COMPLETED");
      if (status === "PENDING") {
        f.provider.refunds.get(op.candidateRefundId!)!.status = "COMPLETED";
        f.provider.syncCapture(f.payment.paypalCaptureId!);
        await f.service.reconcile(f.p, f.caseId);
        expect((await f.current()).status).toBe("CLOSED");
      }
    },
  );
  it("reconciles an ambiguous processed request with the same immutable request ID", async () => {
    const f = await ready(),
      original = f.provider.refundCapture.getMockImplementation()!;
    f.provider.refundCapture.mockImplementationOnce(async (...args) => {
      await original(...args);
      throw new ProviderError("TIMEOUT", true, true);
    });
    await expect(
      f.service.execute(f.p, f.caseId, await f.request()),
    ).rejects.toThrow();
    expect((await f.current()).status).toBe("REFUND_PENDING");
    await f.service.reconcile(f.p, f.caseId, true);
    expect(f.provider.refundCapture.mock.calls[0]![2]).toBe(
      f.provider.refundCapture.mock.calls[1]![2],
    );
    expect(f.provider.refunds.size).toBe(1);
    expect((await f.current()).status).toBe("CLOSED");
  });
  it.each(["currency", "capture", "balance", "timestamp"])(
    "rejects changed %s before sending",
    async (kind) => {
      const f = await ready();
      if (kind === "currency")
        Object.assign(
          f.provider.captures.get(f.payment.paypalCaptureId!)!.amount,
          { currency_code: "EUR" },
        );
      if (kind === "capture")
        f.provider.captures.get(f.payment.paypalCaptureId!)!.status =
          "DECLINED";
      if (kind === "timestamp")
        await db.order.update({
          where: { id: f.payment.orderId },
          data: { timingProvenance: "UNVERIFIED" },
        });
      if (kind === "balance") {
        const cap = f.provider.captures.get(f.payment.paypalCaptureId!)!;
        cap.status = "REFUNDED";
      }
      await expect(
        f.service.execute(f.p, f.caseId, await f.request()),
      ).rejects.toThrow();
      expect(f.provider.refundCapture).not.toHaveBeenCalled();
      expect((await f.current()).status).not.toBe("CLOSED");
    },
  );
  it("prevents standalone bypass, mutable terms, and manual payment completion", async () => {
    const f = await ready();
    await expect(
      f.payments.prepareRefund(f.p, f.payment.id, "1.00", "Bypass case terms"),
    ).rejects.toMatchObject({ code: "CASE_WORKFLOW_REQUIRED" });
    const r = await f.request();
    await expect(
      db.returnProposal.update({
        where: { id: r.proposalId },
        data: { amountMinor: 1n },
      }),
    ).rejects.toThrow();
    await expect(
      f.returns.command(f.p, f.caseId, {
        action: "close",
        version: r.version,
        note: "Cannot mark a financial case completed manually",
      }),
    ).rejects.toMatchObject({ code: "REFUND_REQUIRED" });
  });
  it("permits documented human fallback after AI failure without inventing observations", async () => {
    const f = await caseRefundFixture(db),
      e = new EvidenceService(db, aiConfig(), undefined, randomUUID());
    await e.upload(f.token, await syntheticImage(), "image/png", true);
    let c = await f.current();
    await e.review(
      f.p,
      c.id,
      c.evidenceRevision,
      "Provider unavailable; independently inspected customer evidence.",
    );
    c = await f.current();
    await f.returns.command(f.p, c.id, {
      action: "evaluate",
      version: c.version,
      note: "Evaluate independently reviewed evidence",
    });
    await f.propose();
    await f.approve();
    expect((await f.service.execute(f.p, c.id, await f.request())).status).toBe(
      "COMPLETED",
    );
  });
  it("links authenticated duplicate webhooks to the existing case operation", async () => {
    const f = await ready();
    f.provider.refundStatus = "PENDING";
    const op = await f.service.execute(f.p, f.caseId, await f.request());
    f.provider.refunds.get(op.candidateRefundId!)!.status = "COMPLETED";
    f.provider.syncCapture(f.payment.paypalCaptureId!);
    const hooks = new WebhookService(f.payments, "mock-webhook"),
      event = {
        id: randomUUID(),
        event_type: "PAYMENT.CAPTURE.REFUNDED",
        resource: { id: op.candidateRefundId },
      };
    const headers = new Headers({
      "paypal-cert-url":
        "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-test",
      "paypal-auth-algo": "SHA256withRSA",
      "paypal-transmission-id": randomUUID(),
      "paypal-transmission-sig": "mock-signature",
      "paypal-transmission-time": new Date().toISOString(),
    });
    await hooks.receive(headers, event);
    await hooks.receive(headers, event);
    expect(f.provider.refundCapture).toHaveBeenCalledTimes(1);
    expect((await f.current()).status).toBe("CLOSED");
  });
});
