import { describe, it, expect } from "vitest";
import {
  freeRenderRequest,
  checkedFreeService,
  RENDER_REPO,
} from "../../scripts/render-contract";
const env = {
  DATABASE_URL:
    "postgresql://returnwise_runtime:fake@private/returnwise_hosted",
  AI_ENABLED: "false",
  AG_STUDIO_HOSTED_AUTHORIZED: "false",
  PAYPAL_ENV: "sandbox",
  EVIDENCE_STORAGE: "supabase",
  PUBLIC_DEMO_ENABLED: "true",
};
describe("strictly $0 Render provisioning contract", () => {
  it("explicitly selects Free and excludes every optional paid resource", () => {
    const r = freeRenderRequest("tea-example", env);
    expect(r.serviceDetails).toMatchObject({
      plan: "free",
      numInstances: 1,
      region: "ohio",
      runtime: "node",
    });
    expect(r.autoDeployTrigger).toBe("off");
    for (const key of [
      "disk",
      "autoscaling",
      "preDeployCommand",
      "buildSourceId",
    ])
      expect(r.serviceDetails).not.toHaveProperty(key);
    const forbidden: Record<string, string>[] = [
      { RENDER_API_KEY: "secret" },
      { DATABASE_MIGRATION_URL: env.DATABASE_URL },
      { TEST_DATABASE_URL: env.DATABASE_URL },
    ];
    for (const extra of forbidden)
      expect(() =>
        freeRenderRequest("tea-example", { ...env, ...extra }),
      ).toThrow();
    expect(() =>
      freeRenderRequest("tea-example", { ...env, AI_ENABLED: "true" }),
    ).toThrow();
  });
  it("refuses paid/mismatched responses rather than upgrading or accepting them", () => {
    const r = {
      id: "srv-example",
      name: "returnwise-ai",
      ownerId: "tea-example",
      type: "web_service",
      repo: RENDER_REPO,
      serviceDetails: {
        plan: "free",
        region: "ohio",
        numInstances: 1,
        runtime: "node",
        url: "https://fictional.onrender.com",
      },
    };
    expect(checkedFreeService(r).serviceDetails.plan).toBe("free");
    for (const change of [
      { plan: "starter" },
      { numInstances: 2 },
      { region: "oregon" },
      { disk: { sizeGB: 1 } },
      { autoscaling: { enabled: true } },
    ])
      expect(() =>
        checkedFreeService({
          ...r,
          serviceDetails: { ...r.serviceDetails, ...change },
        }),
      ).toThrow();
  });
});
