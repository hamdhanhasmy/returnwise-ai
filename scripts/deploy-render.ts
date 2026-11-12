import { readFile, writeFile } from "node:fs/promises";
import { parse } from "dotenv";
import { z } from "zod";
import { RenderApi } from "./render-api";
import { freeRenderRequest, checkedFreeService } from "./render-contract";
try {
  const api = new RenderApi(),
    ownerUrl = new URL(process.env.DATABASE_MIGRATION_URL ?? "");
  const hostnameId = ownerUrl.hostname.split(".")[0]!;
  if (
    !/^dpg-[a-z0-9]+(?:-[a-z])?$/.test(hostnameId) ||
    ownerUrl.pathname !== "/returnwise_hosted"
  )
    throw Error("Dedicated hosted database required");
  const candidates = z
    .array(
      z.object({
        postgres: z
          .object({
            id: z.string(),
            databaseName: z.string(),
            region: z.string(),
          })
          .passthrough(),
      }),
    )
    .parse(await api.request("/postgres?region=ohio&limit=100"));
  const matched = candidates.filter(
    (c) =>
      c.postgres.databaseName === "returnwise_hosted" &&
      c.postgres.region === "ohio" &&
      hostnameId.startsWith(c.postgres.id),
  );
  if (matched.length !== 1)
    throw Error(
      "The configured database did not match exactly one API-returned Ohio resource; no resources changed",
    );
  const database = z
    .object({
      id: z.string(),
      plan: z.literal("free"),
      region: z.literal("ohio"),
      databaseName: z.literal("returnwise_hosted"),
      diskAutoscalingEnabled: z.literal(false),
      highAvailabilityEnabled: z.literal(false),
      readReplicas: z.array(z.unknown()).length(0),
      owner: z.object({ id: z.string() }),
      expiresAt: z.string().optional(),
    })
    .parse(
      await api.request(
        `/postgres/${encodeURIComponent(matched[0]!.postgres.id)}`,
      ),
    );
  const env = parse(await readFile(".local/render-web.env"));
  const request = freeRenderRequest(database.owner.id, env);
  const existing = z
    .array(z.object({ service: z.unknown() }))
    .parse(
      await api.request(
        `/services?name=returnwise-ai&ownerId=${encodeURIComponent(database.owner.id)}&limit=100`,
      ),
    );
  if (existing.length > 1)
    throw Error("Ambiguous existing service; no resource was changed");
  let service = existing[0] ? checkedFreeService(existing[0].service) : null;
  if (service && service.ownerId !== database.owner.id)
    throw Error("Workspace mismatch");
  let deployId: string | null = null;
  if (process.argv.includes("--create") && !service) {
    if (process.env.RENDER_ZERO_COST_CONFIRMED !== "true")
      throw Error(
        "Confirm no payment method/paid overages with RENDER_ZERO_COST_CONFIRMED=true in private operator environment before creation",
      );
    const result = z
      .object({ service: z.unknown(), deployId: z.string().optional() })
      .parse(await api.request("/services", "POST", request));
    service = checkedFreeService(result.service);
    deployId = result.deployId ?? null;
  }
  if (service) {
    await writeFile(
      ".local/render-deployment.json",
      JSON.stringify(
        {
          serviceId: service.id,
          url: service.serviceDetails.url,
          deployId,
          plan: "free",
          region: "ohio",
          ownerId: database.owner.id,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    if (process.argv.includes("--status")) {
      const deploys = z
        .array(
          z.object({
            deploy: z.object({
              id: z.string(),
              status: z.string(),
              commit: z.object({ id: z.string() }).optional(),
            }),
          }),
        )
        .parse(await api.request(`/services/${service.id}/deploys?limit=1`));
      console.log(
        JSON.stringify({
          serviceId: service.id,
          url: service.serviceDetails.url,
          servicePlan: "free",
          databasePlan: "free",
          deploy: deploys[0]?.deploy ?? null,
          httpsVerified: false,
        }),
      );
    } else
      console.log(
        JSON.stringify({
          serviceId: service.id,
          url: service.serviceDetails.url,
          servicePlan: "free",
          databasePlan: "free",
          region: "ohio",
          deployId,
          httpsVerified: false,
        }),
      );
  } else
    console.log(
      JSON.stringify({
        prepared: true,
        existingService: false,
        databasePlan: "free",
        databaseRegion: "ohio",
        databaseExpiry: database.expiresAt ?? null,
        request: {
          type: request.type,
          name: request.name,
          repo: request.repo,
          branch: request.branch,
          autoDeployTrigger: request.autoDeployTrigger,
          serviceDetails: request.serviceDetails,
          envVariableNames: request.envVars.map((e) => e.key),
        },
        resourceCreated: false,
      }),
    );
} catch (e) {
  console.error(
    e instanceof Error && !(e instanceof z.ZodError)
      ? e.message
      : "Render response/configuration did not match the strict Free-only contract; values withheld",
  );
  process.exitCode = 1;
}
