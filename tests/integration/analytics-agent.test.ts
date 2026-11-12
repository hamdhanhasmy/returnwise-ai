import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../../scripts/test-database";
import { syntheticCase } from "../fixtures/return-case";
import { aiConfig } from "@/lib/ai/config";
import { AnalyticsAgentService } from "@/server/services/analytics-agent";
import type { AnalyticsProvider } from "@/lib/analytics/deepseek-tools";
const request = (question = "Show the most common return reasons.") => ({
  question,
  consent: true,
  filter: { source: "all", period: "all", category: "" },
});
const configuration = () =>
  aiConfig({ AI_ENABLED: "true", DEEPSEEK_API_KEY: "mock-analytics-only" });
const selected = {
  tool: "return_reasons" as const,
  usage: { promptTokens: 800, cachedTokens: 128, completionTokens: 12 },
  latencyMs: 3,
};
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  db = await testDatabase();
});
afterAll(async () => {
  await db?.$disconnect();
});
describe("bounded AG Studio server runner", () => {
  it("limits new questions while allowing free cache reads", async () => {
    const f = await syntheticCase(db);
    let calls = 0;
    const s = new AnalyticsAgentService(
      db,
      configuration(),
      {
        select: async () => {
          calls++;
          return selected;
        },
      },
      randomUUID(),
    );
    for (let i = 0; i < 6; i++)
      await s.ask(f.p, request(`Show return overview question ${i}`));
    await expect(
      s.ask(f.p, request("Show return overview question 7")),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(
      (await s.ask(f.p, request("Show return overview question 0"))).cacheHit,
    ).toBe(true);
    expect(calls).toBe(6);
  }, 15000);
  it("reserves before provider I/O, stores exact aggregates and usage, and caches unchanged questions", async () => {
    const f = await syntheticCase(db),
      budgetId = randomUUID();
    let calls = 0;
    const provider: AnalyticsProvider = {
      select: async () => {
        calls++;
        expect(
          await db.analyticsQuery.count({
            where: { merchantId: f.p.merchantId, status: "RESERVED" },
          }),
        ).toBe(1);
        expect(
          (await db.aiBudget.findUniqueOrThrow({ where: { id: budgetId } }))
            .reservedNano,
        ).toBeGreaterThan(0n);
        return selected;
      },
    };
    const s = new AnalyticsAgentService(
        db,
        configuration(),
        provider,
        budgetId,
      ),
      before = await db.refundOperation.count();
    const a = await s.ask(f.p, request()),
      b = await s.ask(f.p, request());
    expect(a).toMatchObject({ status: "SUCCEEDED", cacheHit: false });
    expect(b.cacheHit).toBe(true);
    expect(calls).toBe(1);
    expect(JSON.stringify(a.result)).toContain("damaged: 1");
    expect(JSON.stringify(a)).not.toContain(f.token);
    expect(await db.refundOperation.count()).toBe(before);
    const row = await db.analyticsQuery.findFirstOrThrow({
      where: { merchantId: f.p.merchantId },
    });
    expect(row.promptTokens).toBe(800);
    expect(row.estimatedNano).toBe(216768n);
    expect(
      JSON.stringify(row, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
    ).not.toContain(request().question);
    expect(
      (await db.aiBudget.findUniqueOrThrow({ where: { id: budgetId } }))
        .reservedNano,
    ).toBe(0n);
  });
  it("deduplicates concurrent questions without repeating a model call", async () => {
    const f = await syntheticCase(db);
    let release!: () => void,
      started!: () => void,
      calls = 0;
    const gate = new Promise<void>((r) => {
        release = r;
      }),
      ready = new Promise<void>((r) => {
        started = r;
      });
    const s = new AnalyticsAgentService(
      db,
      configuration(),
      {
        select: async () => {
          calls++;
          started();
          await gate;
          return selected;
        },
      },
      randomUUID(),
    );
    const first = s.ask(f.p, request());
    await ready;
    try {
      expect(await s.ask(f.p, request())).toMatchObject({
        status: "RESERVED",
        cacheHit: true,
      });
    } finally {
      release();
    }
    await first;
    expect(calls).toBe(1);
  });
  it("enforces the same durable cap against reservations from other AI work", async () => {
    const f = await syntheticCase(db),
      config = configuration(),
      budgetId = randomUUID();
    let calls = 0;
    await db.aiBudget.create({
      data: { id: budgetId, reservedNano: config.capNano - 1n },
    });
    await expect(
      new AnalyticsAgentService(
        db,
        config,
        {
          select: async () => {
            calls++;
            return selected;
          },
        },
        budgetId,
      ).ask(f.p, request()),
    ).rejects.toMatchObject({ code: "BUDGET_EXHAUSTED" });
    expect(calls).toBe(0);
  });
  it("serializes different concurrent questions under one spending reservation limit", async () => {
    const f = await syntheticCase(db),
      config = configuration(),
      budgetId = randomUUID();
    let release!: () => void,
      started!: () => void,
      calls = 0;
    const gate = new Promise<void>((r) => {
        release = r;
      }),
      ready = new Promise<void>((r) => {
        started = r;
      });
    const s = new AnalyticsAgentService(
      db,
      config,
      {
        select: async () => {
          calls++;
          started();
          await gate;
          return selected;
        },
      },
      budgetId,
    );
    const first = s.ask(f.p, request());
    await ready;
    config.capNano = (
      await db.aiBudget.findUniqueOrThrow({ where: { id: budgetId } })
    ).reservedNano;
    try {
      await expect(
        s.ask(
          f.p,
          request("Compare returnless refunds with physical returns."),
        ),
      ).rejects.toMatchObject({ code: "BUDGET_EXHAUSTED" });
    } finally {
      release();
    }
    await first;
    expect(calls).toBe(1);
  });
  it("falls back on unknown, provider failure and insufficient balance without automatic replay", async () => {
    for (const response of [
      { errorCode: "NETWORK_OR_RESPONSE_UNKNOWN", latencyMs: 1 },
      {
        errorCode: "INSUFFICIENT_BALANCE",
        definitelyUnbilled: true,
        latencyMs: 1,
      },
    ]) {
      const f = await syntheticCase(db);
      let calls = 0;
      const s = new AnalyticsAgentService(
        db,
        configuration(),
        {
          select: async () => {
            calls++;
            return response;
          },
        },
        randomUUID(),
      );
      const a = await s.ask(f.p, request()),
        b = await s.ask(f.p, request());
      expect(a.status).toBe(response.definitelyUnbilled ? "FAILED" : "UNKNOWN");
      expect(b.cacheHit).toBe(true);
      expect(calls).toBe(1);
      if (response.definitelyUnbilled)
        expect(BigInt(a.estimatedNano!)).toBe(0n);
      else expect(BigInt(a.estimatedNano!)).toBeGreaterThan(0n);
    }
  });
  it("rejects unavailable AI, staff, forged tenants, missing consent and commands before inference", async () => {
    const f = await syntheticCase(db),
      other = await syntheticCase(db);
    let calls = 0;
    const provider = {
      select: async () => {
        calls++;
        return selected;
      },
    };
    await expect(
      new AnalyticsAgentService(db, aiConfig(), provider, randomUUID()).ask(
        { ...f.p, merchantId: other.p.merchantId },
        request(),
      ),
    ).rejects.toThrow();
    const s = new AnalyticsAgentService(
      db,
      configuration(),
      provider,
      randomUUID(),
    );
    for (const raw of [
      { ...request(), consent: false },
      request("Send a refund now"),
    ])
      await expect(s.ask(f.p, raw)).rejects.toThrow();
    await db.user.update({
      where: { id: f.p.userId },
      data: { role: "STAFF" },
    });
    await expect(s.ask(f.p, request())).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      new AnalyticsAgentService(
        db,
        aiConfig({ AI_ENABLED: "false" }),
        provider,
        randomUUID(),
      ).ask(other.p, request()),
    ).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    expect(calls).toBe(0);
  });
});
