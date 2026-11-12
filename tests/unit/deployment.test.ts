import { describe, it, expect } from "vitest";
import {
  validateRenderEnvironment,
  hostedStudioEnabled,
} from "@/lib/deployment";
import { publicAnalytics, published } from "@/lib/demo/analytics";
const env = {
  DATABASE_URL:
    "postgresql://returnwise_runtime:fake@dpg-fictional-a/returnwise_hosted",
  APP_BASE_URL: "https://fictional.onrender.com",
  RENDER_EXTERNAL_URL: "https://fictional.onrender.com",
  EVIDENCE_STORAGE: "supabase",
  SUPABASE_URL: "https://fictional.supabase.co",
  SUPABASE_SECRET_KEY: "sb_secret_fake_test_only",
  PAYPAL_ENV: "sandbox",
  PORT: "10000",
};
describe("strictly free hosted configuration and public read-only snapshots", () => {
  it("requires HTTPS, fixed origin, Supabase and sandbox-only configuration", () => {
    expect(validateRenderEnvironment(env)).toEqual({
      port: 10000,
      origin: env.APP_BASE_URL,
    });
    expect(
      validateRenderEnvironment({ ...env, APP_BASE_URL: undefined }).origin,
    ).toBe(env.RENDER_EXTERNAL_URL);
    for (const change of [
      { APP_BASE_URL: "http://127.0.0.1:3000" },
      { APP_BASE_URL: "https://wrong.example" },
      { EVIDENCE_STORAGE: "database" },
      { PAYPAL_ENV: "live" },
      { SUPABASE_SECRET_KEY: "" },
      { PORT: "18012" },
      { TEST_DATABASE_URL: "postgresql://test:fake@host/isolated_test" },
      { DATABASE_MIGRATION_URL: env.DATABASE_URL },
    ])
      expect(() => validateRenderEnvironment({ ...env, ...change })).toThrow();
  });
  it("does not equate a licence key with authorization for hosted use", () => {
    expect(
      hostedStudioEnabled({
        RENDER: "true",
        NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY: "example",
      }),
    ).toBe(false);
    expect(
      hostedStudioEnabled({
        RENDER: "true",
        AG_STUDIO_HOSTED_AUTHORIZED: "true",
      }),
    ).toBe(false);
    expect(
      hostedStudioEnabled({
        RENDER: "true",
        AG_STUDIO_HOSTED_AUTHORIZED: "true",
        NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY: "example",
      }),
    ).toBe(true);
    expect(hostedStudioEnabled({})).toBe(true);
  });
  it("publishes a bounded genuine-history snapshot separately from synthetic estimates", () => {
    const snapshot = publicAnalytics();
    expect(snapshot.total).toBe(4);
    expect(snapshot.agent.enabled).toBe(false);
    expect(snapshot.summary.verifiedRefundMinor).toBe("500");
    expect(
      publicAnalytics({ source: "synthetic" }).summary.verifiedRefundMinor,
    ).toBe("0");
    expect(
      publicAnalytics({ source: "synthetic" }).economics.avoidanceMinor,
    ).toBe("1300");
    expect(
      publicAnalytics({ source: "sandbox" }).economics.avoidanceMinor,
    ).toBe("275");
    expect(published.provenance).toContain("LOCAL");
    expect(
      published.cases.find((c) => c.slug === "verified-sandbox-bowl")
        ?.assessment?.result.requiresHumanReview,
    ).toBe(true);
  });
  it("exposes no access capabilities, private storage keys, emails or complete provider IDs", () => {
    const text = JSON.stringify(published);
    for (const forbidden of [
      "tokenHash",
      "accessToken",
      "storageKey",
      "inferenceStorageKey",
      "customerRef",
      "@",
      "paypalCaptureId",
      "paypalRefundId",
      "DEEPSEEK_API_KEY",
    ])
      expect(text).not.toContain(forbidden);
    for (const c of published.cases)
      if (c.payment) {
        expect(c.payment.captureReference).toMatch(/^…[A-Za-z0-9]{6}$/);
        expect(
          c.payment.refunds.every((r) => /^…[A-Za-z0-9]{6}$/.test(r.reference)),
        ).toBe(true);
      }
  });
  it("rejects tenant selectors and mutation/query parameters", () => {
    for (const input of [
      { merchantId: "tenant" },
      { action: "refund" },
      { query: "SELECT *" },
    ])
      expect(() => publicAnalytics(input)).toThrow();
    expect(publicAnalytics({ category: "missing" }).rows).toEqual([]);
    expect(publicAnalytics({ page: 2 }).pageRows).toEqual([]);
  });
  it("never relabels non-USD refunds as USD and retains persisted evidence usage", () => {
    const payment = published.cases.find((c) => c.payment)?.payment;
    expect(payment).toBeTruthy();
    const currency = payment!.currency;
    try {
      payment!.currency = "EUR";
      expect(publicAnalytics().summary.verifiedRefundMinor).toBe("0");
    } finally {
      payment!.currency = currency;
    }
    expect(BigInt(publicAnalytics().summary.aiEstimatedNano)).toBeGreaterThan(
      0n,
    );
  });
});
