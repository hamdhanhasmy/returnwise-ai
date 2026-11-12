import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../../scripts/test-database";
import { syntheticCase } from "../fixtures/return-case";
import { syntheticImage, mockAssessment } from "../fixtures/evidence";
import { EvidenceService } from "@/server/services/evidence";
import { aiConfig } from "@/lib/ai/config";
import { CONSENT_VERSION } from "@/lib/ai/contracts";
import { reservation, estimatedCost } from "@/lib/ai/cost";
import type { EvidenceProvider, ProviderResult } from "@/lib/ai/deepseek";
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  db = await testDatabase();
});
afterAll(async () => {
  await db?.$disconnect();
});
const config = aiConfig({
  AI_ENABLED: "true",
  DEEPSEEK_API_KEY: "mock-not-a-real-key",
});
const success: ProviderResult = {
  assessment: mockAssessment,
  usage: { promptTokens: 200, cachedTokens: 50, completionTokens: 100 },
  latencyMs: 10,
  model: "mock-flash",
};
async function fixture(
  provider: EvidenceProvider = { analyze: vi.fn(async () => success) },
  cap = config.capNano,
  budget = randomUUID(),
) {
  const f = await syntheticCase(db),
    service = new EvidenceService(
      db,
      { ...config, capNano: cap },
      provider,
      budget,
    );
  const image = await service.upload(
    f.token,
    await syntheticImage(),
    "image/png",
    true,
  );
  await service.consent(f.token, true, CONSENT_VERSION);
  return { ...f, service, image, provider, budget };
}
describe("isolated evidence, consent, usage and global budget", () => {
  it("requires consent and scopes images to customer/merchant", async () => {
    const f = await fixture(),
      other = await fixture();
    await f.service.consent(f.token, false, CONSENT_VERSION);
    await expect(f.service.analyze(f.p, f.caseId)).rejects.toMatchObject({
      code: "CONSENT_REQUIRED",
    });
    await expect(
      f.service.customerImage(other.token, f.image.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      f.service.merchantImage(other.p, f.caseId, f.image.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      f.service.customerImage("bad", f.image.id),
    ).rejects.toMatchObject({ code: "INVALID_ACCESS" });
    expect(
      (await f.service.customerImage(f.token, f.image.id)).length,
    ).toBeGreaterThan(100);
    expect(await f.service.customerView(f.token)).not.toHaveProperty(
      "analyses",
    );
  });
  it("deduplicates uploads and concurrent analyses, caches unchanged successful results", async () => {
    const f = await fixture();
    expect(
      (
        await f.service.upload(
          f.token,
          await syntheticImage(),
          "image/png",
          true,
        )
      ).duplicate,
    ).toBe(true);
    const results = await Promise.all([
      f.service.analyze(f.p, f.caseId),
      f.service.analyze(f.p, f.caseId),
    ]);
    expect(results.some((r) => r.cached)).toBe(true);
    expect(f.provider.analyze).toHaveBeenCalledTimes(1);
    await f.service.analyze(f.p, f.caseId);
    expect(f.provider.analyze).toHaveBeenCalledTimes(1);
    const view = await f.service.view(f.p, f.caseId);
    expect(view.analyses[0]?.result).toEqual(mockAssessment);
    expect(view.budget.spentNano).toBe(estimatedCost(success.usage!));
    expect(view.budget.reservedNano).toBe(0n);
    await expect(
      db.analysisAttempt.update({
        where: { id: view.analyses[0]!.attempts[0]!.id },
        data: { estimatedNano: 0n },
      }),
    ).rejects.toThrow();
  });
  it("commits reservation before network I/O and prevents concurrent budget overspend", async () => {
    let release!: () => void, started!: () => void;
    const waiting = new Promise<void>((r) => {
        started = r;
      }),
      held = new Promise<void>((r) => {
        release = r;
      });
    const budget = randomUUID();
    const bound = reservation(
      "The synthetic bowl arrived broken into two separated pieces.",
      1,
      1200,
    );
    const provider = {
      analyze: vi.fn(async () => {
        const b = await db.aiBudget.findUniqueOrThrow({
          where: { id: budget },
        });
        expect(b.reservedNano).toBe(bound);
        started();
        await held;
        return success;
      }),
    };
    const a = await fixture(provider, bound, budget),
      b = await fixture({ analyze: vi.fn(async () => success) }, bound, budget);
    const first = a.service.analyze(a.p, a.caseId);
    await waiting;
    try {
      expect((await b.service.analyze(b.p, b.caseId)).status).toBe("FAILED");
      expect(b.provider.analyze).not.toHaveBeenCalled();
    } finally {
      release();
    }
    await first;
    expect(
      (await db.aiBudget.findUniqueOrThrow({ where: { id: budget } }))
        .spentNano,
    ).toBeLessThanOrEqual(bound);
  });
  it.each([
    "TIMEOUT_UNKNOWN",
    "NETWORK_UNKNOWN",
    "BLANK_JSON",
    "INVALID_SCHEMA",
  ])(
    "retains conservative accounting and no reanalysis for %s",
    async (errorCode) => {
      const f = await fixture({
        analyze: vi.fn(async () => ({ errorCode, latencyMs: 10 })),
      });
      await f.service.analyze(f.p, f.caseId);
      await f.service.analyze(f.p, f.caseId);
      expect(f.provider.analyze).toHaveBeenCalledTimes(1);
      const view = await f.service.view(f.p, f.caseId);
      expect(view.budget.spentNano).toBeGreaterThan(0n);
      expect(view.analyses[0]?.status).toBe("FAILED");
      expect(view.reviewRequired).toBe(true);
    },
  );
  it("retries only an explicit rate limit once and records both attempts", async () => {
    const mock = vi
        .fn()
        .mockResolvedValueOnce({
          errorCode: "RATE_LIMITED",
          definitelyUnbilled: true,
          latencyMs: 1,
        })
        .mockResolvedValue(success),
      f = await fixture({ analyze: mock });
    await f.service.analyze(f.p, f.caseId);
    expect(mock).toHaveBeenCalledTimes(2);
    expect(
      (await f.service.view(f.p, f.caseId)).analyses[0]?.attempts,
    ).toHaveLength(2);
  });
  it("handles exhausted provider balance without spending or automatic retry", async () => {
    const f = await fixture({
      analyze: vi.fn(async () => ({
        errorCode: "INSUFFICIENT_BALANCE",
        definitelyUnbilled: true,
        latencyMs: 1,
      })),
    });
    await f.service.analyze(f.p, f.caseId);
    const v = await f.service.view(f.p, f.caseId);
    expect(v.budget.spentNano).toBe(0n);
    expect(v.analyses[0]?.errorCode).toBe("INSUFFICIENT_BALANCE");
  });
  it("invalidates in-flight output when consent is withdrawn", async () => {
    const f: Awaited<ReturnType<typeof fixture>> = await fixture({
      analyze: async () => {
        await f.service.consent(f.token, false, CONSENT_VERSION);
        return success;
      },
    });
    expect((await f.service.analyze(f.p, f.caseId)).status).toBe("STALE");
    expect(
      (await f.service.view(f.p, f.caseId)).analyses[0]?.result,
    ).toBeNull();
  });
  it("discards late output after an interrupted analysis was resolved by human review", async () => {
    const f: Awaited<ReturnType<typeof fixture>> = await fixture({
      analyze: async () => {
        // Simulate an old request resuming after another process used manual recovery.
        await db.evidenceAnalysis.updateMany({
          where: { caseId: f.caseId },
          data: { createdAt: new Date(Date.now() - 180000) },
        });
        const current = await db.returnCase.findUniqueOrThrow({
          where: { id: f.caseId },
        });
        await f.service.review(
          f.p,
          f.caseId,
          current.evidenceRevision,
          "Human review completed while the provider request was interrupted.",
        );
        return success;
      },
    });
    expect((await f.service.analyze(f.p, f.caseId)).status).toBe("STALE");
    const view = await f.service.view(f.p, f.caseId);
    expect(view.analyses[0]?.result).toBeNull();
    expect(view.reviewRequired).toBe(false);
    expect(view.budget.spentNano).toBe(estimatedCost(success.usage!));
  });
  it("requires human evidence review, invalidates proposals and never changes money", async () => {
    const f = await fixture();
    await f.service.analyze(f.p, f.caseId);
    let c = await db.returnCase.findUniqueOrThrow({ where: { id: f.caseId } });
    await expect(
      f.returns.command(f.p, c.id, {
        action: "propose",
        version: c.version,
        note: "Cannot bypass the human evidence review",
        rightsConfirmed: true,
        resolution: "FULL_REFUND_KEEP",
      }),
    ).rejects.toMatchObject({ code: "EVIDENCE_REVIEW_REQUIRED" });
    await f.service.review(
      f.p,
      c.id,
      c.evidenceRevision,
      "Manually checked synthetic evidence and all limitations.",
    );
    c = await db.returnCase.findUniqueOrThrow({ where: { id: c.id } });
    await f.returns.command(f.p, c.id, {
      action: "evaluate",
      version: c.version,
      note: "Reevaluate frozen policy",
    });
    c = await db.returnCase.findUniqueOrThrow({ where: { id: c.id } });
    await f.returns.command(f.p, c.id, {
      action: "propose",
      version: c.version,
      note: "Human review supports this full remedy",
      rightsConfirmed: true,
      resolution: "FULL_REFUND_KEEP",
    });
    await f.service.upload(
      f.token,
      await syntheticImage("scratched"),
      "image/png",
      true,
    );
    expect(
      (await db.returnProposal.findFirstOrThrow({ where: { caseId: c.id } }))
        .status,
    ).toBe("WITHDRAWN");
    expect(
      await db.refundOperation.count({ where: { merchantId: f.p.merchantId } }),
    ).toBe(0);
  });
  it("removes image bytes, invalidates old tokens and rejects staff analysis", async () => {
    const f = await fixture();
    await f.service.remove(f.token, f.image.id);
    expect(
      (await db.returnEvidence.findUniqueOrThrow({ where: { id: f.image.id } }))
        .image,
    ).toBeNull();
    await expect(
      f.service.customerImage(f.token, f.image.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await f.returns.revokeAccess(f.p, f.order.id);
    await expect(f.service.customerView(f.token)).rejects.toMatchObject({
      code: "INVALID_ACCESS",
    });
    await db.user.update({
      where: { id: f.p.userId },
      data: { role: "STAFF" },
    });
    await expect(f.service.analyze(f.p, f.caseId)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it("blocks requests when application budget is exhausted before provider execution", async () => {
    const f = await fixture(undefined, 0n);
    await f.service.analyze(f.p, f.caseId);
    expect(f.provider.analyze).not.toHaveBeenCalled();
    expect((await f.service.view(f.p, f.caseId)).analyses[0]?.errorCode).toBe(
      "BUDGET_EXHAUSTED",
    );
  });
  it("does not disclose another merchant's spending in a shared budget", async () => {
    const budget = randomUUID(),
      a = await fixture(undefined, config.capNano, budget),
      b = await fixture(undefined, config.capNano, budget);
    await a.service.analyze(a.p, a.caseId);
    const view = await b.service.view(b.p, b.caseId);
    expect(view.budget.spentNano).toBe(0n);
    expect(view.usage.promptTokens).toBeNull();
    expect(
      (await db.aiBudget.findUniqueOrThrow({ where: { id: budget } }))
        .spentNano,
    ).toBeGreaterThan(0n);
  });
  it("blocks expired evidence and enforces private-storage consent and active-image limits", async () => {
    const f = await fixture();
    await expect(
      f.service.upload(
        f.token,
        await syntheticImage("scratched"),
        "image/png",
        false,
      ),
    ).rejects.toMatchObject({ code: "CONSENT_REQUIRED" });
    await f.service.upload(
      f.token,
      await syntheticImage("scratched"),
      "image/png",
      true,
    );
    await f.service.upload(
      f.token,
      await syntheticImage("ambiguous"),
      "image/png",
      true,
    );
    await expect(
      f.service.upload(
        f.token,
        await syntheticImage("unsupported"),
        "image/png",
        true,
      ),
    ).rejects.toMatchObject({ code: "UPLOAD_LIMIT" });
    const past = new Date(Date.now() - 86400000);
    await db.returnEvidence.updateMany({
      where: { caseId: f.caseId },
      data: { createdAt: new Date(past.getTime() - 86400000), expiresAt: past },
    });
    await expect(
      f.service.customerImage(f.token, f.image.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(f.service.analyze(f.p, f.caseId)).rejects.toMatchObject({
      code: "EVIDENCE_REQUIRED",
    });
    expect(f.provider.analyze).not.toHaveBeenCalled();
  });
  it("halts further spending if provider usage exceeds the conservative reservation", async () => {
    const budget = randomUUID(),
      a = await fixture(
        {
          analyze: vi.fn(async () => ({
            ...success,
            usage: {
              promptTokens: 200000,
              cachedTokens: 0,
              completionTokens: 100,
            },
          })),
        },
        config.capNano,
        budget,
      );
    await a.service.analyze(a.p, a.caseId);
    expect((await a.service.view(a.p, a.caseId)).budget.blocked).toBe(true);
    const b = await fixture(undefined, config.capNano, budget);
    await b.service.analyze(b.p, b.caseId);
    expect(b.provider.analyze).not.toHaveBeenCalled();
  });
});
