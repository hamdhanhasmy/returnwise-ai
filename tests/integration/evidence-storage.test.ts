import {
  beforeAll,
  afterAll,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../../scripts/test-database";
import { syntheticCase } from "../fixtures/return-case";
import { syntheticImage, mockAssessment } from "../fixtures/evidence";
import { EvidenceService } from "@/server/services/evidence";
import { purgeStoredEvidence } from "@/server/services/evidence-retention";
import { aiConfig } from "@/lib/ai/config";
import { CONSENT_VERSION } from "@/lib/ai/contracts";
import type { EvidenceStore } from "@/lib/evidence/storage";
import { objectKeys } from "@/lib/evidence/storage";
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  db = await testDatabase();
});
afterAll(async () => {
  await db?.$disconnect();
});
afterEach(() => vi.unstubAllEnvs());
const config = aiConfig({
  AI_ENABLED: "true",
  DEEPSEEK_API_KEY: "mock-evidence-storage-only",
});
async function fixture() {
  const f = await syntheticCase(db),
    files = new Map<string, Buffer>();
  const store: EvidenceStore = {
    put: vi.fn(async (key, bytes) => {
      files.set(key, bytes);
    }),
    get: vi.fn(async (key) => {
      if (!files.has(key)) throw Error("missing");
      return files.get(key)!;
    }),
    remove: vi.fn(async (keys: string[]) => {
      keys.forEach((k) => files.delete(k));
    }),
  };
  const provider = {
    analyze: vi.fn(async () => ({
      assessment: mockAssessment,
      usage: { promptTokens: 100, cachedTokens: 0, completionTokens: 30 },
      latencyMs: 1,
    })),
  };
  return {
    ...f,
    store,
    files,
    provider,
    service: new EvidenceService(db, config, provider, randomUUID(), store),
  };
}
describe("Supabase-backed evidence lifecycle using isolated PostgreSQL and a storage mock", () => {
  it("persists references, survives a new service instance, uses optimized bytes for AI and deletes privately", async () => {
    const f = await fixture(),
      upload = await f.service.upload(
        f.token,
        await syntheticImage(),
        "image/png",
        true,
      );
    const e = await db.returnEvidence.findUniqueOrThrow({
      where: { id: upload.id },
    });
    expect(e).toMatchObject({
      storageProvider: "SUPABASE",
      storageState: "READY",
      image: null,
      inferenceImage: null,
    });
    expect(e.storageBytes).toBeGreaterThan(0);
    expect(f.files.size).toBe(2);
    const restarted = new EvidenceService(
      db,
      config,
      f.provider,
      randomUUID(),
      f.store,
    );
    expect(
      (await restarted.merchantImage(f.p, f.caseId, e.id)).length,
    ).toBeGreaterThan(0);
    const duplicate = await restarted.upload(
      f.token,
      await syntheticImage(),
      "image/png",
      true,
    );
    expect(duplicate.duplicate).toBe(true);
    expect(f.store.put).toHaveBeenCalledTimes(2);
    await restarted.consent(f.token, true, CONSENT_VERSION);
    expect((await restarted.analyze(f.p, f.caseId)).status).toBe("SUCCEEDED");
    expect(f.provider.analyze).toHaveBeenCalledOnce();
    await restarted.remove(f.token, e.id);
    expect(f.files.size).toBe(0);
    expect(
      await db.returnEvidence.findUnique({ where: { id: e.id } }),
    ).toMatchObject({ storageState: "PURGED", storageBytes: 0 });
    await expect(restarted.customerImage(f.token, e.id)).rejects.toMatchObject({
      status: 404,
    });
  });
  it("rejects invalid customers and other tenants before any object operation", async () => {
    const f = await fixture(),
      other = await fixture();
    await expect(
      f.service.upload("invalid", await syntheticImage(), "image/png", true),
    ).rejects.toMatchObject({ status: 404 });
    const e = await f.service.upload(
      f.token,
      await syntheticImage(),
      "image/png",
      true,
    );
    await expect(
      f.service.merchantImage(other.p, f.caseId, e.id),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      f.service.customerImage(other.token, e.id),
    ).rejects.toMatchObject({ status: 404 });
    await expect(f.service.remove(other.token, e.id)).rejects.toMatchObject({
      status: 404,
    });
    expect(f.store.get).not.toHaveBeenCalled();
    expect(f.store.remove).not.toHaveBeenCalled();
  });
  it("reserves quota before I/O and deduplicates simultaneous uploads", async () => {
    const f = await fixture();
    let release!: () => void;
    const blocked = new Promise<void>((r) => {
      release = r;
    });
    const put = f.store.put;
    f.store.put = vi.fn(async (key, bytes) => {
      const reserved = await db.returnEvidence.findFirst({
        where: { merchantId: f.p.merchantId },
      });
      expect(reserved?.storageState).toBe("UPLOADING");
      expect(reserved?.storageBytes).toBeGreaterThan(0);
      await blocked;
      await put(key, bytes);
    });
    const first = f.service.upload(
      f.token,
      await syntheticImage(),
      "image/png",
      true,
    );
    await vi.waitFor(() => expect(f.store.put).toHaveBeenCalledOnce());
    await expect(
      f.service.upload(f.token, await syntheticImage(), "image/png", true),
    ).rejects.toMatchObject({ status: 409 });
    release();
    await first;
    expect(
      await db.returnEvidence.count({ where: { merchantId: f.p.merchantId } }),
    ).toBe(1);
  });
  it("holds uncertain uploads against quota and retries tracked deletion without exposing objects", async () => {
    const f = await fixture();
    f.store.put = vi.fn(async () => {
      throw Error("timeout");
    });
    await expect(
      f.service.upload(f.token, await syntheticImage(), "image/png", true),
    ).rejects.toMatchObject({ status: 503 });
    const e = await db.returnEvidence.findFirstOrThrow({
      where: { merchantId: f.p.merchantId },
    });
    expect(e.storageState).toBe("DELETE_PENDING");
    expect(e.storageBytes).toBeGreaterThan(0);
    expect((await f.service.customerView(f.token)).images).toHaveLength(0);
    f.store.remove = vi.fn(async () => {
      throw Error("offline");
    });
    await expect(purgeStoredEvidence(db, e.id, f.store)).rejects.toThrow();
    expect(
      (await db.returnEvidence.findUniqueOrThrow({ where: { id: e.id } }))
        .storageBytes,
    ).toBeGreaterThan(0);
    f.store.remove = vi.fn(async () => undefined);
    await purgeStoredEvidence(db, e.id, f.store);
    expect(
      (await db.returnEvidence.findUniqueOrThrow({ where: { id: e.id } }))
        .storageBytes,
    ).toBe(0);
  });
  it("fails closed at the application storage cap before an external upload", async () => {
    const f = await fixture();
    vi.stubEnv("EVIDENCE_STORAGE_CAP_BYTES", "1048576");
    const id = randomUUID();
    await db.returnEvidence.create({
      data: {
        id,
        merchantId: f.p.merchantId,
        caseId: f.caseId,
        contentHash: "f".repeat(64),
        width: 64,
        height: 64,
        bytes: 524288,
        storageProvider: "SUPABASE",
        storageState: "UPLOADING",
        storageBytes: 1048576,
        ...objectKeys({ id, merchantId: f.p.merchantId, caseId: f.caseId }),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    await expect(
      f.service.upload(f.token, await syntheticImage(), "image/png", true),
    ).rejects.toMatchObject({ code: "STORAGE_QUOTA" });
    expect(f.store.put).not.toHaveBeenCalled();
  });
});
