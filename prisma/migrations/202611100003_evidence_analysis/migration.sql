-- AlterTable
ALTER TABLE "ReturnCase" ADD COLUMN     "aiConsentAt" TIMESTAMPTZ(3),
ADD COLUMN     "aiConsentVersion" TEXT,
ADD COLUMN     "aiReviewRequired" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ReturnEvidence" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "contentHash" CHAR(64) NOT NULL,
    "image" BYTEA,
    "inferenceImage" BYTEA,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ReturnEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceAnalysis" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "evidenceRevision" INTEGER NOT NULL,
    "evidenceHash" CHAR(64) NOT NULL,
    "cacheKey" CHAR(64) NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "result" JSONB,
    "errorCode" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),
    "reviewedBy" UUID,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "EvidenceAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiBudget" (
    "id" TEXT NOT NULL,
    "spentNano" BIGINT NOT NULL DEFAULT 0,
    "reservedNano" BIGINT NOT NULL DEFAULT 0,
    "blocked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AiBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisAttempt" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "analysisId" UUID NOT NULL,
    "budgetId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "reservationNano" BIGINT NOT NULL,
    "estimatedNano" BIGINT,
    "costBasis" TEXT NOT NULL,
    "pricingVersion" TEXT NOT NULL,
    "promptTokens" INTEGER,
    "cachedTokens" INTEGER,
    "completionTokens" INTEGER,
    "providerModel" TEXT,
    "providerRequestId" TEXT,
    "latencyMs" INTEGER,
    "errorCode" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "AnalysisAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReturnEvidence_merchantId_caseId_createdAt_idx" ON "ReturnEvidence"("merchantId", "caseId", "createdAt");

-- CreateIndex
CREATE INDEX "ReturnEvidence_expiresAt_idx" ON "ReturnEvidence"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnEvidence_caseId_contentHash_key" ON "ReturnEvidence"("caseId", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceAnalysis_cacheKey_key" ON "EvidenceAnalysis"("cacheKey");

-- CreateIndex
CREATE INDEX "EvidenceAnalysis_merchantId_caseId_createdAt_idx" ON "EvidenceAnalysis"("merchantId", "caseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceAnalysis_merchantId_id_key" ON "EvidenceAnalysis"("merchantId", "id");

-- CreateIndex
CREATE INDEX "AnalysisAttempt_merchantId_createdAt_idx" ON "AnalysisAttempt"("merchantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisAttempt_analysisId_sequence_key" ON "AnalysisAttempt"("analysisId", "sequence");

-- AddForeignKey
ALTER TABLE "ReturnEvidence" ADD CONSTRAINT "ReturnEvidence_merchantId_caseId_fkey" FOREIGN KEY ("merchantId", "caseId") REFERENCES "ReturnCase"("merchantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceAnalysis" ADD CONSTRAINT "EvidenceAnalysis_merchantId_caseId_fkey" FOREIGN KEY ("merchantId", "caseId") REFERENCES "ReturnCase"("merchantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisAttempt" ADD CONSTRAINT "AnalysisAttempt_merchantId_analysisId_fkey" FOREIGN KEY ("merchantId", "analysisId") REFERENCES "EvidenceAnalysis"("merchantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisAttempt" ADD CONSTRAINT "AnalysisAttempt_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "AiBudget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AiBudget" ADD CONSTRAINT "AiBudget_nonnegative" CHECK ("spentNano">=0 AND "reservedNano">=0);
ALTER TABLE "AnalysisAttempt" ADD CONSTRAINT "AnalysisAttempt_values" CHECK ("sequence" BETWEEN 1 AND 2 AND "reservationNano">0 AND ("estimatedNano" IS NULL OR "estimatedNano">=0) AND ("cachedTokens" IS NULL OR "cachedTokens" BETWEEN 0 AND "promptTokens"));
ALTER TABLE "EvidenceAnalysis" ADD CONSTRAINT "EvidenceAnalysis_status" CHECK (status IN ('RUNNING','SUCCEEDED','FAILED','STALE'));
ALTER TABLE "ReturnEvidence" ADD CONSTRAINT "ReturnEvidence_limits" CHECK (bytes BETWEEN 1 AND 5242880 AND width BETWEEN 1 AND 4096 AND height BETWEEN 1 AND 4096 AND "expiresAt">"createdAt" AND (("deletedAt" IS NULL AND image IS NOT NULL AND "inferenceImage" IS NOT NULL) OR ("deletedAt" IS NOT NULL AND image IS NULL AND "inferenceImage" IS NULL)));
CREATE FUNCTION returnwise_protect_analysis_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND OLD.status <> 'RESERVED') THEN RAISE EXCEPTION 'Settled AI usage is immutable'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "AnalysisAttempt_immutable_settled" BEFORE UPDATE OR DELETE ON "AnalysisAttempt" FOR EACH ROW EXECUTE FUNCTION returnwise_protect_analysis_attempt();
CREATE TRIGGER "AnalysisAttempt_no_truncate" BEFORE TRUNCATE ON "AnalysisAttempt" FOR EACH STATEMENT EXECUTE FUNCTION returnwise_protect_audit();
