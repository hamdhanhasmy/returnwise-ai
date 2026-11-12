ALTER TABLE "ReturnEvidence"
  ADD COLUMN "storageProvider" TEXT NOT NULL DEFAULT 'DATABASE',
  ADD COLUMN "storageState" TEXT NOT NULL DEFAULT 'READY',
  ADD COLUMN "storageKey" TEXT,
  ADD COLUMN "inferenceStorageKey" TEXT,
  ADD COLUMN "storageBytes" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "ReturnEvidence_storageKey_key" ON "ReturnEvidence"("storageKey");
CREATE UNIQUE INDEX "ReturnEvidence_inferenceStorageKey_key" ON "ReturnEvidence"("inferenceStorageKey");
-- Preserve existing bytes and timestamps; extend the storage invariant additively.
ALTER TABLE "ReturnEvidence" DROP CONSTRAINT "ReturnEvidence_limits";
ALTER TABLE "ReturnEvidence" ADD CONSTRAINT "ReturnEvidence_limits" CHECK (
 bytes BETWEEN 1 AND 5242880 AND width BETWEEN 1 AND 4096 AND height BETWEEN 1 AND 4096 AND "expiresAt">"createdAt" AND
 (("storageProvider"='DATABASE' AND "storageKey" IS NULL AND "inferenceStorageKey" IS NULL AND "storageBytes"=0 AND
   (("deletedAt" IS NULL AND image IS NOT NULL AND "inferenceImage" IS NOT NULL AND "storageState"='READY') OR
    ("deletedAt" IS NOT NULL AND image IS NULL AND "inferenceImage" IS NULL AND "storageState" IN ('READY','PURGED')))) OR
  ("storageProvider"='SUPABASE' AND image IS NULL AND "inferenceImage" IS NULL AND "storageKey" IS NOT NULL AND "inferenceStorageKey" IS NOT NULL AND
   (("deletedAt" IS NULL AND "storageState" IN ('UPLOADING','READY') AND "storageBytes" BETWEEN 1 AND 10485760) OR
    ("deletedAt" IS NOT NULL AND "storageState"='DELETE_PENDING' AND "storageBytes" BETWEEN 1 AND 10485760) OR
    ("deletedAt" IS NOT NULL AND "storageState"='PURGED' AND "storageBytes"=0))))
);
