-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CaseStatus" ADD VALUE 'SUBMITTED';
ALTER TYPE "CaseStatus" ADD VALUE 'EVALUATED';
ALTER TYPE "CaseStatus" ADD VALUE 'RESOLUTION_PROPOSED';
ALTER TYPE "CaseStatus" ADD VALUE 'REJECTED';
ALTER TYPE "CaseStatus" ADD VALUE 'CLOSED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ClaimReason" ADD VALUE 'DEFECTIVE';
ALTER TYPE "ClaimReason" ADD VALUE 'MISSING_COMPONENTS';
ALTER TYPE "ClaimReason" ADD VALUE 'CHANGE_OF_MIND';

-- AlterTable
ALTER TABLE "MerchantPolicy" ADD COLUMN     "returnRules" JSONB,
ADD COLUMN     "usage" TEXT NOT NULL DEFAULT 'PAYMENT';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "timingProvenance" TEXT NOT NULL DEFAULT 'UNVERIFIED';

-- AlterTable
ALTER TABLE "ReturnCase" ADD COLUMN     "condition" TEXT,
ADD COLUMN     "policySnapshot" JSONB,
ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "recommendation" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMPTZ(3),
ADD COLUMN     "workflowVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ReturnEvaluation" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "caseVersion" INTEGER NOT NULL,
    "logicVersion" TEXT NOT NULL,
    "inputHash" CHAR(64) NOT NULL,
    "inputs" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReturnEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnProposal" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "evaluationId" UUID NOT NULL,
    "resolution" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "termsHash" CHAR(64) NOT NULL,
    "explanation" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "requiresConsent" BOOLEAN NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "respondedAt" TIMESTAMPTZ(3),
    "approvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReturnProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReturnEvaluation_merchantId_caseId_createdAt_idx" ON "ReturnEvaluation"("merchantId", "caseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnEvaluation_merchantId_id_caseId_key" ON "ReturnEvaluation"("merchantId", "id", "caseId");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnEvaluation_caseId_caseVersion_key" ON "ReturnEvaluation"("caseId", "caseVersion");

-- CreateIndex
CREATE INDEX "ReturnProposal_merchantId_caseId_createdAt_idx" ON "ReturnProposal"("merchantId", "caseId", "createdAt");

-- AddForeignKey
ALTER TABLE "ReturnEvaluation" ADD CONSTRAINT "ReturnEvaluation_merchantId_caseId_fkey" FOREIGN KEY ("merchantId", "caseId") REFERENCES "ReturnCase"("merchantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnProposal" ADD CONSTRAINT "ReturnProposal_merchantId_caseId_fkey" FOREIGN KEY ("merchantId", "caseId") REFERENCES "ReturnCase"("merchantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnProposal" ADD CONSTRAINT "ReturnProposal_merchantId_evaluationId_caseId_fkey" FOREIGN KEY ("merchantId", "evaluationId", "caseId") REFERENCES "ReturnEvaluation"("merchantId", "id", "caseId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve all historical rows and instants. Unverified provenance is intentional.
ALTER TABLE "Order" ADD CONSTRAINT "Order_timing_provenance" CHECK ("timingProvenance" IN ('UNVERIFIED','UTC_RECORDED','SIMULATED'));
ALTER TABLE "MerchantPolicy" ADD CONSTRAINT "MerchantPolicy_usage" CHECK ("usage" IN ('PAYMENT','RETURNS') AND ("usage" <> 'RETURNS' OR "returnRules" IS NOT NULL));
ALTER TABLE "ReturnCase" ADD CONSTRAINT "ReturnCase_workflow_snapshot" CHECK ("workflowVersion" = 0 OR ("workflowVersion" = 1 AND "policySnapshot" IS NOT NULL AND "submittedAt" IS NOT NULL AND "condition" IS NOT NULL));
ALTER TABLE "ReturnProposal" ADD CONSTRAINT "ReturnProposal_money" CHECK ("amountMinor" > 0 AND "currency"='USD');
ALTER TABLE "ReturnProposal" ADD CONSTRAINT "ReturnProposal_resolution" CHECK ("resolution" IN ('FULL_REFUND_RETURN','FULL_REFUND_KEEP','PARTIAL_REFUND_KEEP') AND ("resolution" <> 'PARTIAL_REFUND_KEEP' OR "requiresConsent"));
ALTER TABLE "ReturnProposal" ADD CONSTRAINT "ReturnProposal_status" CHECK ("status" IN ('PROPOSED','ACCEPTED','DECLINED','APPROVED','WITHDRAWN'));
CREATE UNIQUE INDEX "ReturnProposal_one_active" ON "ReturnProposal"("caseId") WHERE "status" IN ('PROPOSED','ACCEPTED');
CREATE INDEX "MerchantPolicy_return_versions" ON "MerchantPolicy"("merchantId","usage","version" DESC);

CREATE FUNCTION returnwise_protect_return_policy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."usage"='RETURNS' THEN RAISE EXCEPTION 'Return policies are immutable; create a version'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "MerchantPolicy_returns_immutable" BEFORE UPDATE OR DELETE ON "MerchantPolicy" FOR EACH ROW EXECUTE FUNCTION returnwise_protect_return_policy();
CREATE TRIGGER "ReturnEvaluation_immutable" BEFORE UPDATE OR DELETE ON "ReturnEvaluation" FOR EACH ROW EXECUTE FUNCTION returnwise_protect_audit();
CREATE TRIGGER "ReturnEvaluation_no_truncate" BEFORE TRUNCATE ON "ReturnEvaluation" FOR EACH STATEMENT EXECUTE FUNCTION returnwise_protect_audit();

CREATE FUNCTION returnwise_protect_case_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."workflowVersion"=1 AND ROW(NEW."merchantId",NEW."orderId",NEW."policyId",NEW."policySnapshot",NEW."submittedAt",NEW."workflowVersion") IS DISTINCT FROM ROW(OLD."merchantId",OLD."orderId",OLD."policyId",OLD."policySnapshot",OLD."submittedAt",OLD."workflowVersion") THEN
    RAISE EXCEPTION 'Case scope, submission and policy snapshot are immutable';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "ReturnCase_snapshot_immutable" BEFORE UPDATE ON "ReturnCase" FOR EACH ROW EXECUTE FUNCTION returnwise_protect_case_snapshot();

CREATE FUNCTION returnwise_protect_return_terms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."merchantId",NEW."caseId",NEW."evaluationId",NEW."resolution",NEW."amountMinor",NEW."currency",NEW."termsHash",NEW."explanation",NEW."requiresConsent",NEW."expiresAt") IS DISTINCT FROM ROW(OLD."merchantId",OLD."caseId",OLD."evaluationId",OLD."resolution",OLD."amountMinor",OLD."currency",OLD."termsHash",OLD."explanation",OLD."requiresConsent",OLD."expiresAt") THEN RAISE EXCEPTION 'Resolution terms are immutable'; END IF;
  IF NEW."status"='APPROVED' AND NEW."requiresConsent" AND (OLD."status" <> 'ACCEPTED' OR NEW."respondedAt" IS NULL) THEN RAISE EXCEPTION 'Exact customer acceptance is required'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "ReturnProposal_terms_immutable" BEFORE UPDATE ON "ReturnProposal" FOR EACH ROW EXECUTE FUNCTION returnwise_protect_return_terms();
