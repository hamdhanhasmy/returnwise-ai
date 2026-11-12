import type { PrismaClient } from "@/generated/prisma/client";
import {
  checkedObjectKeys,
  configuredEvidenceStore,
  type EvidenceStore,
} from "@/lib/evidence/storage";
import { randomUUID } from "node:crypto";

/** System-only cleanup: accepts a persisted ID, never client-supplied object paths. */
export async function purgeStoredEvidence(
  db: PrismaClient,
  id: string,
  store: EvidenceStore | null = configuredEvidenceStore(),
) {
  const e = await db.returnEvidence.findFirst({
    where: {
      id,
      storageProvider: "SUPABASE",
      storageState: "DELETE_PENDING",
      deletedAt: { not: null },
    },
  });
  if (!e) return;
  if (!store) throw Error("Supabase cleanup is not configured");
  const keys = checkedObjectKeys(e);
  await store.remove([keys.storageKey, keys.inferenceStorageKey]);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(712001)`;
    const removed = await tx.returnEvidence.updateMany({
      where: {
        id: e.id,
        merchantId: e.merchantId,
        caseId: e.caseId,
        storageState: "DELETE_PENDING",
      },
      data: { storageState: "PURGED", storageBytes: 0 },
    });
    if (removed.count)
      await tx.auditLog.create({
        data: {
          merchantId: e.merchantId,
          caseId: e.caseId,
          actorType: "SYSTEM",
          action: "PRIVATE_EVIDENCE_OBJECTS_PURGED",
          correlationId: randomUUID(),
          redactedMetadataJson: { evidenceId: e.id },
        },
      });
  });
}
