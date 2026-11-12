import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { storageConfig } from "./config";
import { MAX_UPLOAD_BYTES } from "@/lib/ai/images";
import { PaymentError } from "@/server/services/payment-rules";
export type EvidenceIdentity = {
  id: string;
  merchantId: string;
  caseId: string;
};
export interface EvidenceStore {
  put(key: string, bytes: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(keys: string[]): Promise<void>;
}
export function objectKeys(e: EvidenceIdentity) {
  for (const id of [e.id, e.merchantId, e.caseId]) z.uuid().parse(id);
  const prefix = `${e.merchantId}/${e.caseId}/${e.id}`;
  return {
    storageKey: `${prefix}/review.jpg`,
    inferenceStorageKey: `${prefix}/inference.jpg`,
  };
}
function validKey(key: string) {
  const parts = key.split("/");
  if (
    parts.length !== 4 ||
    !["review.jpg", "inference.jpg"].includes(parts[3]!)
  )
    throw Error("Invalid evidence object reference");
  for (const id of parts.slice(0, 3)) z.uuid().parse(id);
}
export class SupabaseEvidenceStore implements EvidenceStore {
  readonly client;
  constructor(
    readonly config = storageConfig(),
    fetcher: typeof fetch = fetch,
  ) {
    if (config.provider !== "supabase" || !config.url || !config.secret)
      throw Error("Supabase evidence storage is not configured");
    this.client = createClient(config.url, config.secret, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (url, init) =>
          fetcher(url, {
            ...init,
            redirect: "error",
            signal: AbortSignal.timeout(15000),
          }),
      },
    });
  }
  private async bucket() {
    const { data, error } = await this.client.storage.getBucket(
      this.config.bucket,
    );
    if (
      error ||
      !data ||
      data.public ||
      Number(data.file_size_limit) > MAX_UPLOAD_BYTES ||
      !data.file_size_limit ||
      !data.allowed_mime_types?.length ||
      data.allowed_mime_types.some((t) => t !== "image/jpeg")
    )
      throw Error(
        "Private JPEG-only evidence bucket with a maximum 5 MiB limit is required",
      );
    return this.client.storage.from(this.config.bucket);
  }
  async put(key: string, bytes: Buffer) {
    validKey(key);
    if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES)
      throw Error("Evidence object exceeds limit");
    const bucket = await this.bucket();
    const { error } = await bucket.upload(key, bytes, {
      contentType: "image/jpeg",
      cacheControl: "0",
      upsert: false,
    });
    if (error) throw Error("Private evidence upload unavailable");
  }
  async get(key: string) {
    validKey(key);
    const bucket = await this.bucket();
    const { data, error } = await bucket.download(key);
    if (error || !data || data.size > MAX_UPLOAD_BYTES || data.size < 1)
      throw Error("Private evidence retrieval unavailable");
    return Buffer.from(await data.arrayBuffer());
  }
  async remove(keys: string[]) {
    if (!keys.length || keys.length > 2)
      throw Error("Scoped evidence references required");
    keys.forEach(validKey);
    const bucket = await this.bucket();
    const { error } = await bucket.remove(keys);
    if (error) throw Error("Private evidence deletion pending");
  }
}
export function configuredEvidenceStore(): EvidenceStore | null {
  return storageConfig().provider === "supabase"
    ? new SupabaseEvidenceStore()
    : null;
}
export type StoredEvidence = EvidenceIdentity & {
  storageProvider: string;
  storageKey: string | null;
  inferenceStorageKey: string | null;
  image: Uint8Array | null;
  inferenceImage: Uint8Array | null;
};
export function checkedObjectKeys(e: StoredEvidence) {
  const keys = objectKeys(e);
  if (
    keys.storageKey !== e.storageKey ||
    keys.inferenceStorageKey !== e.inferenceStorageKey
  )
    throw Error("Evidence reference does not match tenant and case");
  return keys;
}
export async function readStoredEvidence(
  e: StoredEvidence,
  inference: boolean,
  store: EvidenceStore | null,
) {
  try {
    if (e.storageProvider === "SUPABASE") {
      const keys = checkedObjectKeys(e);
      if (!store) throw Error("Storage unavailable");
      return await store.get(
        inference ? keys.inferenceStorageKey : keys.storageKey,
      );
    }
    const bytes = inference ? e.inferenceImage : e.image;
    if (e.storageProvider !== "DATABASE" || !bytes) throw Error("Unavailable");
    return Buffer.from(bytes);
  } catch {
    throw new PaymentError(
      "STORAGE_UNAVAILABLE",
      "Private evidence is temporarily unavailable; use manual review or retry later.",
      503,
    );
  }
}
