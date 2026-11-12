import { z } from "zod";
export const RENDER_REPO = "https://github.com/hamdhanhasmy/returnwise-ai";
const allowed = new Set([
  "NODE_VERSION",
  "NODE_ENV",
  "NEXT_TELEMETRY_DISABLED",
  "DATABASE_URL",
  "PAYPAL_ENV",
  "PUBLIC_DEMO_ENABLED",
  "EVIDENCE_STORAGE",
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "EVIDENCE_STORAGE_CAP_BYTES",
  "AI_ENABLED",
  "AI_SPENDING_CAP_USD",
  "AG_STUDIO_HOSTED_AUTHORIZED",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
  "DEEPSEEK_MODEL",
  "DEEPSEEK_IMAGE_DETAIL",
  "AI_MAX_OUTPUT_TOKENS",
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "PAYPAL_MERCHANT_ID",
]);
export function freeRenderRequest(
  ownerId: string,
  env: Record<string, string>,
) {
  if (
    !/^(tea|own)-[a-z0-9]+$/.test(ownerId) ||
    Object.keys(env).some((k) => !allowed.has(k))
  )
    throw Error("Unexpected deployment owner or runtime variable");
  if (
    env.AI_ENABLED !== "false" ||
    env.AG_STUDIO_HOSTED_AUTHORIZED !== "false" ||
    env.PAYPAL_ENV !== "sandbox" ||
    env.EVIDENCE_STORAGE !== "supabase" ||
    env.PUBLIC_DEMO_ENABLED !== "true" ||
    new URL(env.DATABASE_URL!).username !== "returnwise_runtime"
  )
    throw Error("Safe hosted runtime configuration required");
  return {
    type: "web_service",
    name: "returnwise-ai",
    ownerId,
    repo: RENDER_REPO,
    branch: "main",
    autoDeployTrigger: "off",
    envVars: Object.entries(env).map(([key, value]) => ({ key, value })),
    serviceDetails: {
      runtime: "node",
      plan: "free",
      region: "ohio",
      numInstances: 1,
      healthCheckPath: "/api/health",
      envSpecificDetails: {
        buildCommand:
          "npm ci --include=dev && npm run db:generate && npm run build",
        startCommand: "npm run start:render",
      },
    },
  } as const;
}
export function checkedFreeService(raw: unknown) {
  const service = z
    .object({
      id: z.string().regex(/^srv-[a-z0-9]+$/),
      name: z.literal("returnwise-ai"),
      type: z.literal("web_service"),
      ownerId: z.string(),
      repo: z.string(),
      serviceDetails: z
        .object({
          plan: z.literal("free"),
          region: z.literal("ohio"),
          numInstances: z.literal(1),
          runtime: z.literal("node"),
          url: z.string().url(),
          disk: z.unknown().optional(),
          autoscaling: z.unknown().optional(),
        })
        .passthrough(),
    })
    .passthrough()
    .parse(raw);
  if (
    service.repo.replace(/\.git$/, "") !== RENDER_REPO ||
    service.serviceDetails.disk ||
    service.serviceDetails.autoscaling
  )
    throw Error(
      "Unexpected repository, disk or autoscaling; no upgrade/fallback is allowed",
    );
  return service;
}
