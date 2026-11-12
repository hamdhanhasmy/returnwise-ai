import "dotenv/config";
import { SupabaseEvidenceStore } from "../src/lib/evidence/storage";
import { storageConfig } from "../src/lib/evidence/config";
const store = new SupabaseEvidenceStore(
  storageConfig({ ...process.env, EVIDENCE_STORAGE: "supabase" }),
);
try {
  const existing = await store.client.storage.getBucket("return-evidence");
  if (existing.data) {
    console.log(
      "Required bucket exists; no settings changed. Run the private storage verification.",
    );
  } else if (existing.error?.statusCode === "404") {
    // Only the one requested bucket in the explicitly configured project; no plan/account upgrade.
    const { error } = await store.client.storage.createBucket(
      "return-evidence",
      {
        public: false,
        fileSizeLimit: 5242880,
        allowedMimeTypes: ["image/jpeg"],
      },
    );
    if (error) throw Error("Bucket creation rejected");
    console.log(
      "Created only private return-evidence bucket with JPEG-only, 5 MiB limits; no plan or billing change requested.",
    );
  } else throw Error("Bucket lookup rejected");
} catch {
  console.error(
    "Requested private bucket could not be configured. Check the server key/project; no account/plan change or secret output occurred.",
  );
  process.exitCode = 1;
}
