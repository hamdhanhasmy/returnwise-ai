ALTER TYPE "CaseStatus" ADD VALUE 'REFUND_AUTHORIZED';
ALTER TYPE "CaseStatus" ADD VALUE 'REFUND_PROCESSING';
ALTER TYPE "CaseStatus" ADD VALUE 'REFUND_PENDING';
ALTER TYPE "CaseStatus" ADD VALUE 'REFUND_FAILED';
ALTER TABLE "ReturnCase" ADD COLUMN "returnReceivedAt" TIMESTAMPTZ(3), ADD COLUMN "returnReceivedBy" UUID, ADD COLUMN "returnReceiptNote" TEXT;
ALTER TABLE "RefundApproval" ADD COLUMN "caseId" UUID, ADD COLUMN "proposalId" UUID, ADD COLUMN "caseBinding" JSONB;
CREATE UNIQUE INDEX "ReturnProposal_merchantId_id_caseId_key" ON "ReturnProposal"("merchantId","id","caseId");
CREATE UNIQUE INDEX "RefundApproval_caseId_key" ON "RefundApproval"("caseId");
CREATE UNIQUE INDEX "RefundApproval_proposalId_key" ON "RefundApproval"("proposalId");
CREATE UNIQUE INDEX "RefundApproval_merchantId_caseId_key" ON "RefundApproval"("merchantId","caseId");
CREATE UNIQUE INDEX "RefundApproval_merchantId_proposalId_caseId_key" ON "RefundApproval"("merchantId","proposalId","caseId");
ALTER TABLE "RefundApproval" ADD CONSTRAINT "RefundApproval_merchantId_caseId_fkey" FOREIGN KEY ("merchantId","caseId") REFERENCES "ReturnCase"("merchantId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefundApproval" ADD CONSTRAINT "RefundApproval_merchantId_proposalId_caseId_fkey" FOREIGN KEY ("merchantId","proposalId","caseId") REFERENCES "ReturnProposal"("merchantId","id","caseId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefundApproval" ADD CONSTRAINT "RefundApproval_case_binding_complete" CHECK (("caseId" IS NULL AND "proposalId" IS NULL AND "caseBinding" IS NULL) OR ("caseId" IS NOT NULL AND "proposalId" IS NOT NULL AND "caseBinding" IS NOT NULL));
CREATE FUNCTION returnwise_protect_case_refund_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW."caseId",NEW."proposalId",NEW."caseBinding") IS DISTINCT FROM ROW(OLD."caseId",OLD."proposalId",OLD."caseBinding") THEN RAISE EXCEPTION 'Case refund binding is immutable'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "RefundApproval_case_binding_immutable" BEFORE UPDATE ON "RefundApproval" FOR EACH ROW EXECUTE FUNCTION returnwise_protect_case_refund_binding();
