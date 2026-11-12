import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { testDatabase } from "../../scripts/test-database";
import { syntheticCase } from "../fixtures/return-case";
import { caseRefundFixture } from "../fixtures/case-refund";
import { AnalyticsService } from "@/server/services/analytics";
import { randomUUID } from "node:crypto";
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  db = await testDatabase();
});
afterAll(async () => {
  await db?.$disconnect();
});
describe("tenant-scoped analytics on isolated PostgreSQL", () => {
  it("bounds Studio data while paginating older cases through PostgreSQL", async () => {
    const f = await syntheticCase(db),
      original = await db.returnCase.findUniqueOrThrow({
        where: { id: f.caseId },
      });
    const ids = Array.from({ length: 501 }, () => randomUUID());
    await db.order.createMany({
      data: ids.map((id) => ({
        id,
        merchantId: f.p.merchantId,
        productId: f.product.id,
        publicOrderNumber: id,
        productSnapshot: { name: "Synthetic bulk analytics fixture" },
        customerRef: "PRIVATE",
        currency: "USD",
        totalMinor: 8000n,
        origin: "SIMULATED",
        timingProvenance: "SIMULATED",
        purchasedAt: new Date(),
      })),
    });
    await db.returnCase.createMany({
      data: ids.map((orderId) => ({
        merchantId: f.p.merchantId,
        orderId,
        policyId: original.policyId,
        policySnapshot: original.policySnapshot!,
        reason: "OTHER",
        description: "Synthetic bounded pagination fixture",
        customerClaim: {},
        status: "MANUAL_REVIEW",
        workflowVersion: 1,
        condition: "UNKNOWN",
        submittedAt: new Date(),
      })),
    });
    const s = await new AnalyticsService(db).snapshot(f.p, { page: 21 });
    expect(s.total).toBe(502);
    expect(s.rows).toHaveLength(500);
    expect(s.coverage.truncated).toBe(true);
    expect(s.pageRows).toHaveLength(2);
  }, 15000);
  it("keeps charts available when AI provider configuration is invalid", async () => {
    const f = await syntheticCase(db);
    vi.stubEnv("DEEPSEEK_BASE_URL", "https://invalid.example");
    try {
      const data = await new AnalyticsService(db).snapshot(f.p);
      expect(data.total).toBe(1);
      expect(data.agent.enabled).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("reads persisted estimates without exposing evidence, capability or customer data", async () => {
    const f = await syntheticCase(db),
      service = new AnalyticsService(db);
    const before = await db.refundOperation.count();
    const snapshot = await service.snapshot(f.p);
    expect(snapshot.total).toBe(1);
    expect(snapshot.economics.avoidanceMinor).toBe("1300");
    expect(snapshot.rows[0]).toMatchObject({
      source: "Synthetic scenario",
      aiStatus: "NOT_REQUESTED",
    });
    const text = JSON.stringify(snapshot);
    for (const secret of [
      f.token,
      "PRIVATE-CUSTOMER",
      f.p.email,
      "customerClaim",
      "contentHash",
      "storageKey",
      "paypalCaptureId",
      "description",
    ])
      expect(text).not.toContain(secret);
    expect(await db.refundOperation.count()).toBe(before);
  });
  it("isolates another merchant and rejects a spoofed principal or tenant parameter", async () => {
    const a = await syntheticCase(db),
      b = await syntheticCase(db),
      s = new AnalyticsService(db);
    expect(JSON.stringify(await s.snapshot(a.p))).not.toContain(b.caseId);
    await expect(
      s.snapshot({ ...a.p, merchantId: b.p.merchantId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      s.snapshot(a.p, { merchantId: b.p.merchantId }),
    ).rejects.toThrow();
  });
  it("excludes untrusted historical dates from trends and date-filtered metrics", async () => {
    const f = await syntheticCase(db);
    await db.order.update({
      where: { id: f.order.id },
      data: { timingProvenance: "UNVERIFIED" },
    });
    const s = new AnalyticsService(db),
      all = await s.snapshot(f.p);
    expect(all.total).toBe(1);
    expect(all.trends).toHaveLength(0);
    expect(all.excludedHistoricalDates).toBe(1);
    expect((await s.snapshot(f.p, { period: "30" })).total).toBe(0);
  });
  it("counts provider-verified refunds separately from synthetic modeled values", async () => {
    const f = await caseRefundFixture(db);
    await f.propose();
    await f.approve();
    await f.service.execute(f.p, f.caseId, await f.request());
    const s = new AnalyticsService(db),
      snapshot = await s.snapshot(f.p);
    expect(snapshot.summary).toMatchObject({
      verifiedRefundMinor: "8000",
      verifiedRefundCount: 1,
      pendingRefunds: 0,
    });
    expect(snapshot.rows[0]).toMatchObject({
      source: "Sandbox order",
      status: "closed",
    });
    expect(
      (await s.snapshot(f.p, { source: "synthetic" })).summary
        .verifiedRefundMinor,
    ).toBe("0");
    expect(snapshot.economics.avoidanceMinor).toBe("1300");
  });
  it("supports filters, bounded pages and read-only staff without resurrecting inactive users", async () => {
    const f = await syntheticCase(db),
      s = new AnalyticsService(db);
    expect((await s.snapshot(f.p, { source: "sandbox" })).total).toBe(0);
    expect((await s.snapshot(f.p, { category: "Other" })).total).toBe(0);
    expect((await s.snapshot(f.p, { page: 2 })).pageRows).toHaveLength(0);
    await db.user.update({
      where: { id: f.p.userId },
      data: { role: "STAFF" },
    });
    expect((await s.snapshot({ ...f.p, role: "STAFF" })).total).toBe(1);
    await db.user.update({
      where: { id: f.p.userId },
      data: { disabledAt: new Date() },
    });
    await expect(s.snapshot(f.p)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("excludes AI evaluation cases from merchant decision metrics", async () => {
    const f = await syntheticCase(db);
    await db.order.update({
      where: { id: f.order.id },
      data: { publicOrderNumber: `AI-EVAL-${f.order.id}` },
    });
    expect((await new AnalyticsService(db).snapshot(f.p)).total).toBe(0);
  });
});
