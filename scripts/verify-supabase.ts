import "dotenv/config";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { SupabaseEvidenceStore, objectKeys } from "../src/lib/evidence/storage";
import { storageConfig } from "../src/lib/evidence/config";
import { normalizeEvidence } from "../src/lib/ai/images";
const c = storageConfig({ ...process.env, EVIDENCE_STORAGE: "supabase" });
const store = new SupabaseEvidenceStore(c);
const keys = objectKeys({
  id: randomUUID(),
  merchantId: randomUUID(),
  caseId: randomUUID(),
});
let uploaded = false;
let stage = "bucket lookup";
try {
  const { data, error } = await store.client.storage.getBucket(c.bucket);
  if (error)
    console.error(
      JSON.stringify({
        bucketLookupStatus: error.status ?? null,
        bucketLookupCode: error.statusCode ?? null,
        errorType: error.name,
      }),
    );
  if (error || !data || data.public) throw Error("Private bucket required");
  if (!process.argv.includes("--roundtrip")) {
    console.log(
      JSON.stringify({
        bucketReachable: true,
        private: !data.public,
        mimeTypes: data.allowed_mime_types,
        objectLimitBytes: data.file_size_limit,
        roundtrip: "not requested",
      }),
    );
  } else {
    const clean = await normalizeEvidence(
      await readFile("assets/demo/synthetic-broken-bowl.png"),
      "image/png",
    );
    stage = "review image upload (private bucket settings enforced)";
    uploaded = true; // A timed-out PUT may still have persisted an object.
    await store.put(keys.storageKey, clean.image);
    stage = "optimized image upload";
    await store.put(keys.inferenceStorageKey, clean.inferenceImage);
    const restarted = new SupabaseEvidenceStore(c);
    stage = "private retrieval";
    const bytes = await restarted.get(keys.storageKey);
    if (createHash("sha256").update(bytes).digest("hex") !== clean.contentHash)
      throw Error("Storage integrity mismatch");
    const publicResponse = await fetch(
      `${c.url}/storage/v1/object/public/${c.bucket}/${keys.storageKey}`,
      { signal: AbortSignal.timeout(15000), redirect: "error" },
    );
    if (publicResponse.ok)
      throw Error("Unauthenticated evidence retrieval succeeded");
    await restarted.remove([keys.storageKey, keys.inferenceStorageKey]);
    uploaded = false;
    let deleted = false;
    try {
      await restarted.get(keys.storageKey);
    } catch {
      deleted = true;
    }
    if (!deleted) throw Error("Delete not confirmed");
    const report = {
      genuineSupabase: true,
      syntheticImage: true,
      normalizedBytes: clean.image.length,
      privateRoundtrip: true,
      freshClientRetrieval: true,
      unauthenticatedStatus: publicResponse.status,
      deletionConfirmed: true,
      paypalCalls: 0,
      aiCalls: 0,
      hostedRestartVerified: false,
    };
    await mkdir(".local/evaluation", { recursive: true });
    await writeFile(
      ".local/evaluation/supabase-storage.json",
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
  }
} catch {
  console.error(
    `Supabase verification failed at: ${stage}. Check the private JPEG-only bucket, 5 MiB limit and server credentials. No secret values were printed.`,
  );
  process.exitCode = 1;
} finally {
  if (uploaded) {
    try {
      await store.remove([keys.storageKey, keys.inferenceStorageKey]);
    } catch {
      await mkdir(".local/evaluation", { recursive: true });
      await writeFile(
        ".local/evaluation/storage-cleanup-pending.json",
        JSON.stringify({
          bucket: c.bucket,
          keys,
          reason:
            "Operator verification objects require cleanup; investigate uncertain uploads before deletion.",
        }),
      );
      console.error(
        "Temporary verification cleanup pending; private references saved in ignored .local/evaluation/storage-cleanup-pending.json.",
      );
    }
  }
}
