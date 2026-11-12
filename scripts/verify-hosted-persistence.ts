import "dotenv/config";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { RenderApi } from "./render-api";
import { checkedFreeService } from "./render-contract";
import { renderOwnerUrl } from "./render-database";
import { scriptDatabase } from "./database";
import { normalizeEvidence } from "../src/lib/ai/images";
import { storageConfig } from "../src/lib/evidence/config";
import { SupabaseEvidenceStore, objectKeys } from "../src/lib/evidence/storage";

// Explicit operator smoke, separate from tests. Never creates DB fixtures or provider payments.
const stateFile = ".local/evaluation/render-persistence-private.json";
const db = scriptDatabase(renderOwnerUrl().toString());
const api = new RenderApi();
const store = new SupabaseEvidenceStore(
  storageConfig({ ...process.env, EVIDENCE_STORAGE: "supabase" }),
);
const hash = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex");
async function fingerprint() {
  return hash(
    JSON.stringify({
      merchants: await db.merchant.findMany({
        select: { id: true, createdAt: true },
        orderBy: { id: "asc" },
      }),
      users: await db.user.findMany({
        select: { id: true, merchantId: true, createdAt: true },
        orderBy: { id: "asc" },
      }),
      evidence: await db.returnEvidence.count(),
      payments: await db.payment.count(),
      refunds: await db.refundOperation.count(),
      ai: await db.analysisAttempt.count(),
    }),
  );
}
try {
  const saved = JSON.parse(
    await readFile(".local/render-deployment.json", "utf8"),
  );
  const service = checkedFreeService(
    await api.request(`/services/${saved.serviceId}`),
  );
  if (
    service.ownerId !== saved.ownerId ||
    service.serviceDetails.url !== saved.url
  )
    throw Error("Target mismatch");
  if (process.argv.includes("--restart")) {
    // Refuse repeated restarts while a previous probe still needs verification/cleanup.
    try {
      await readFile(stateFile);
      throw Error("Existing persistence probe requires --check");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    const clean = await normalizeEvidence(
      await readFile("assets/demo/synthetic-broken-bowl.png"),
      "image/png",
    );
    const keys = objectKeys({
      id: randomUUID(),
      merchantId: randomUUID(),
      caseId: randomUUID(),
    });
    const state = {
      serviceId: service.id,
      ownerId: service.ownerId,
      url: saved.url,
      keys,
      hash: clean.contentHash,
      database: await fingerprint(),
      requestedAt: new Date().toISOString(),
    };
    await mkdir(".local/evaluation", { recursive: true });
    await writeFile(stateFile, JSON.stringify(state), { mode: 0o600 });
    await store.put(keys.storageKey, clean.image);
    await store.put(keys.inferenceStorageKey, clean.inferenceImage);
    await api.request(`/services/${service.id}/restart`, "POST");
    console.log(
      JSON.stringify({
        restartAccepted: true,
        servicePlan: "free",
        persistenceVerified: false,
        next: "Run --check after startup",
      }),
    );
  } else if (process.argv.includes("--check")) {
    const state = z
      .object({
        serviceId: z.string(),
        ownerId: z.string(),
        url: z.string().url(),
        keys: z.object({
          storageKey: z.string(),
          inferenceStorageKey: z.string(),
        }),
        hash: z.string(),
        database: z.string(),
        requestedAt: z.string().datetime(),
      })
      .parse(JSON.parse(await readFile(stateFile, "utf8")));
    if (
      state.serviceId !== service.id ||
      state.ownerId !== service.ownerId ||
      state.url !== saved.url
    )
      throw Error("Probe target mismatch");
    const params = new URLSearchParams({
      ownerId: service.ownerId,
      resource: service.id,
      startTime: state.requestedAt,
      direction: "forward",
      type: "app",
      limit: "100",
    });
    const logs = z
      .object({
        logs: z.array(z.object({ message: z.string(), timestamp: z.string() })),
      })
      .parse(await api.request(`/logs?${params}`));
    const startup = logs.logs.find(
      (l) =>
        /Ready in/.test(l.message) &&
        new Date(l.timestamp) >= new Date(state.requestedAt),
    );
    if (!startup)
      throw Error(
        "New process startup not yet observed; rerun --check, never restart again",
      );
    const health = await fetch(`${state.url}/api/health`, {
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    });
    if (
      !health.ok ||
      state.database !== (await fingerprint()) ||
      hash(await store.get(state.keys.storageKey)) !== state.hash
    )
      throw Error("Persistence/health verification failed");
    await store.get(state.keys.inferenceStorageKey);
    await store.remove([state.keys.storageKey, state.keys.inferenceStorageKey]);
    const report = {
      url: state.url,
      genuineRenderRestart: true,
      newProcessStartupObserved: true,
      httpsHealthy: true,
      databaseRecordsPreserved: true,
      privateSupabaseImagePreserved: true,
      temporaryObjectsDeleted: true,
      hostedCustomerUploadVerified: false,
      financialOrAiOperations: 0,
    };
    await writeFile(
      ".local/evaluation/render-persistence.json",
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
  } else throw Error("Choose --restart once, then --check");
} catch (e) {
  console.error(
    e instanceof Error && e.message.startsWith("New process startup")
      ? e.message
      : "Persistence smoke failed; private connection, log contents and object references withheld. Inspect the ignored probe state before retrying.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
