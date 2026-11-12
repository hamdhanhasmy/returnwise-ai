import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { storageConfig } from "@/lib/evidence/config";
import {
  objectKeys,
  checkedObjectKeys,
  SupabaseEvidenceStore,
} from "@/lib/evidence/storage";
const config = () =>
  storageConfig({
    EVIDENCE_STORAGE: "supabase",
    SUPABASE_URL: "https://fictional-project.supabase.co",
    SUPABASE_SECRET_KEY: "sb_secret_fake_unit_test_only",
  });
describe("private evidence object adapter", () => {
  it("requires explicit secure provider credentials and caps storage below Free allocation", () => {
    expect(storageConfig({}).provider).toBe("database");
    expect(() => storageConfig({ EVIDENCE_STORAGE: "supabase" })).toThrow();
    for (const url of [
      "http://fictional-project.supabase.co",
      "https://evil.example",
      "https://fictional-project.supabase.co/path",
    ])
      expect(() =>
        storageConfig({ ...configEnv(), SUPABASE_URL: url }),
      ).toThrow();
    expect(() =>
      storageConfig({ EVIDENCE_STORAGE_CAP_BYTES: "104857601" }),
    ).toThrow();
  });
  it("binds opaque paths to merchant, case and evidence identity", () => {
    const e = {
      id: randomUUID(),
      merchantId: randomUUID(),
      caseId: randomUUID(),
      image: null,
      inferenceImage: null,
      storageProvider: "SUPABASE",
    };
    expect(checkedObjectKeys({ ...e, ...objectKeys(e) })).toEqual(
      objectKeys(e),
    );
    expect(() =>
      checkedObjectKeys({ ...e, ...objectKeys(e), storageKey: "../other.jpg" }),
    ).toThrow();
    expect(() => objectKeys({ ...e, merchantId: "../tenant" })).toThrow();
  });
  it("uploads without overwrite, downloads privately and deletes only scoped objects", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith("/bucket/return-evidence"))
        return Response.json({
          id: "return-evidence",
          public: false,
          file_size_limit: 5242880,
          allowed_mime_types: ["image/jpeg"],
        });
      if (init?.method === "POST") return Response.json({ Key: "key" });
      if (init?.method === "DELETE") return Response.json([]);
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { "Content-Type": "image/jpeg" },
      });
    });
    const store = new SupabaseEvidenceStore(config(), fetcher),
      keys = objectKeys({
        id: randomUUID(),
        merchantId: randomUUID(),
        caseId: randomUUID(),
      });
    await store.put(keys.storageKey, Buffer.from([1, 2, 3]));
    expect(await store.get(keys.storageKey)).toEqual(Buffer.from([1, 2, 3]));
    await store.remove([keys.storageKey, keys.inferenceStorageKey]);
    const upload = calls.find((c) => c.init?.method === "POST")!;
    expect(new Headers(upload.init?.headers).get("x-upsert")).toBe("false");
    expect(
      calls.every((c) => c.init?.redirect === "error" && c.init.signal),
    ).toBe(true);
    expect(
      calls.every(
        (c) => !c.url.includes("/public/") && !c.url.includes("token="),
      ),
    ).toBe(true);
    await expect(store.remove(["other-tenant.jpg"])).rejects.toThrow();
  });
  it("rejects public or unrestricted buckets and sanitizes provider failures", async () => {
    for (const bucket of [
      { public: true },
      { public: false, file_size_limit: null },
      {
        public: false,
        file_size_limit: 5242880,
        allowed_mime_types: ["image/*"],
      },
    ]) {
      const store = new SupabaseEvidenceStore(
        config(),
        vi.fn(async () => Response.json(bucket)),
      );
      await expect(
        store.put(
          objectKeys({
            id: randomUUID(),
            merchantId: randomUUID(),
            caseId: randomUUID(),
          }).storageKey,
          Buffer.from([1]),
        ),
      ).rejects.toThrow("Private JPEG-only");
    }
  });
});
function configEnv() {
  return {
    EVIDENCE_STORAGE: "supabase",
    SUPABASE_SECRET_KEY: "sb_secret_fake_unit_test_only",
  };
}
