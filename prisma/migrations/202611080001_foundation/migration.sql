-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "TokenPurpose" AS ENUM ('MERCHANT_LOGIN', 'CUSTOMER_INTAKE', 'CUSTOMER_TRACK');

-- CreateEnum
CREATE TYPE "EstimateSource" AS ENUM ('SIMULATED', 'MERCHANT_ESTIMATE');

-- CreateEnum
CREATE TYPE "OrderOrigin" AS ENUM ('SIMULATED', 'PAYPAL_SANDBOX');

-- CreateEnum
CREATE TYPE "ClaimReason" AS ENUM ('DAMAGED', 'NOT_AS_DESCRIBED', 'WRONG_ITEM', 'OTHER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('MANUAL_REVIEW', 'PENDING', 'AWAITING_CUSTOMER', 'AWAITING_RETURN', 'APPROVED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'CUSTOMER', 'SYSTEM');

-- CreateTable
CREATE TABLE "Merchant" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sandboxAccountAlias" TEXT NOT NULL,
    "paypalMerchantId" TEXT,
    "paymentsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "disabledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessToken" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "purpose" "TokenPurpose" NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "userId" UUID,
    "orderId" UUID,
    "caseId" UUID,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantPolicy" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "effectiveAt" TIMESTAMPTZ(3) NOT NULL,
    "retiredAt" TIMESTAMPTZ(3),
    "returnWindowDays" INTEGER NOT NULL,
    "eligibleCategories" TEXT[],
    "allowKeepWithoutReturn" BOOLEAN NOT NULL,
    "allowPartialKeep" BOOLEAN NOT NULL,
    "requireReturnReceipt" BOOLEAN NOT NULL,
    "manualReviewThresholdMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "rulesJson" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "saleAmountMinor" BIGINT NOT NULL,
    "recoveryValueMinor" BIGINT NOT NULL,
    "estimateSource" "EstimateSource" NOT NULL DEFAULT 'SIMULATED',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "publicOrderNumber" TEXT NOT NULL,
    "productId" UUID NOT NULL,
    "productSnapshot" JSONB NOT NULL,
    "customerRef" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "totalMinor" BIGINT NOT NULL,
    "origin" "OrderOrigin" NOT NULL DEFAULT 'SIMULATED',
    "purchasedAt" TIMESTAMPTZ(3),
    "deliveredAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnCase" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "policyId" UUID NOT NULL,
    "reason" "ClaimReason" NOT NULL,
    "description" TEXT NOT NULL,
    "customerClaim" JSONB NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'MANUAL_REVIEW',
    "evidenceRevision" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ReturnCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorUserId" UUID,
    "caseId" UUID,
    "action" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "redactedMetadataJson" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_paypalMerchantId_key" ON "Merchant"("paypalMerchantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_merchantId_id_key" ON "User"("merchantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "User_merchantId_email_key" ON "User"("merchantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_merchantId_id_key" ON "Session"("merchantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AccessToken_tokenHash_key" ON "AccessToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AccessToken_expiresAt_idx" ON "AccessToken"("expiresAt");

-- CreateIndex
CREATE INDEX "AccessToken_merchantId_orderId_idx" ON "AccessToken"("merchantId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessToken_merchantId_id_key" ON "AccessToken"("merchantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantPolicy_merchantId_id_key" ON "MerchantPolicy"("merchantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantPolicy_merchantId_version_key" ON "MerchantPolicy"("merchantId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Product_merchantId_id_key" ON "Product"("merchantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Product_merchantId_sku_key" ON "Product"("merchantId", "sku");

-- CreateIndex
CREATE INDEX "Order_merchantId_createdAt_idx" ON "Order"("merchantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_merchantId_id_key" ON "Order"("merchantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Order_merchantId_publicOrderNumber_key" ON "Order"("merchantId", "publicOrderNumber");

-- CreateIndex
CREATE INDEX "ReturnCase_merchantId_status_createdAt_idx" ON "ReturnCase"("merchantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ReturnCase_merchantId_orderId_idx" ON "ReturnCase"("merchantId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnCase_merchantId_id_key" ON "ReturnCase"("merchantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnCase_merchantId_id_orderId_key" ON "ReturnCase"("merchantId", "id", "orderId");

-- CreateIndex
CREATE INDEX "AuditLog_merchantId_caseId_createdAt_idx" ON "AuditLog"("merchantId", "caseId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_merchantId_createdAt_idx" ON "AuditLog"("merchantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_merchantId_id_key" ON "AuditLog"("merchantId", "id");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_merchantId_userId_fkey" FOREIGN KEY ("merchantId", "userId") REFERENCES "User"("merchantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessToken" ADD CONSTRAINT "AccessToken_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessToken" ADD CONSTRAINT "AccessToken_merchantId_userId_fkey" FOREIGN KEY ("merchantId", "userId") REFERENCES "User"("merchantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessToken" ADD CONSTRAINT "AccessToken_merchantId_orderId_fkey" FOREIGN KEY ("merchantId", "orderId") REFERENCES "Order"("merchantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessToken" ADD CONSTRAINT "AccessToken_merchantId_caseId_orderId_fkey" FOREIGN KEY ("merchantId", "caseId", "orderId") REFERENCES "ReturnCase"("merchantId", "id", "orderId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantPolicy" ADD CONSTRAINT "MerchantPolicy_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_merchantId_productId_fkey" FOREIGN KEY ("merchantId", "productId") REFERENCES "Product"("merchantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnCase" ADD CONSTRAINT "ReturnCase_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnCase" ADD CONSTRAINT "ReturnCase_merchantId_orderId_fkey" FOREIGN KEY ("merchantId", "orderId") REFERENCES "Order"("merchantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnCase" ADD CONSTRAINT "ReturnCase_merchantId_policyId_fkey" FOREIGN KEY ("merchantId", "policyId") REFERENCES "MerchantPolicy"("merchantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_merchantId_actorUserId_fkey" FOREIGN KEY ("merchantId", "actorUserId") REFERENCES "User"("merchantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_merchantId_caseId_fkey" FOREIGN KEY ("merchantId", "caseId") REFERENCES "ReturnCase"("merchantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Foundation safety constraints not representable in the Prisma schema.
ALTER TABLE "Merchant" ADD CONSTRAINT "Merchant_payments_disabled_phase1" CHECK ("paymentsEnabled" = false);
ALTER TABLE "Product" ADD CONSTRAINT "Product_money_check" CHECK (currency = 'USD' AND "saleAmountMinor" > 0 AND "saleAmountMinor" <= 100000 AND "recoveryValueMinor" >= 0 AND "recoveryValueMinor" <= 100000);
ALTER TABLE "Order" ADD CONSTRAINT "Order_money_check" CHECK (currency = 'USD' AND "totalMinor" > 0 AND "totalMinor" <= 100000);
ALTER TABLE "MerchantPolicy" ADD CONSTRAINT "Policy_values_check" CHECK (currency = 'USD' AND version > 0 AND "returnWindowDays" >= 0 AND "manualReviewThresholdMinor" >= 0);
ALTER TABLE "AccessToken" ADD CONSTRAINT "AccessToken_targets_check" CHECK (
  (purpose = 'MERCHANT_LOGIN' AND "userId" IS NOT NULL AND "orderId" IS NULL AND "caseId" IS NULL) OR
  (purpose = 'CUSTOMER_INTAKE' AND "userId" IS NULL AND "orderId" IS NOT NULL AND "caseId" IS NULL) OR
  (purpose = 'CUSTOMER_TRACK' AND "userId" IS NULL AND "orderId" IS NOT NULL AND "caseId" IS NOT NULL)
);
ALTER TABLE "AccessToken" ADD CONSTRAINT "AccessToken_expiry_check" CHECK ("expiresAt" > "createdAt");
ALTER TABLE "ReturnCase" ADD CONSTRAINT "ReturnCase_description_check" CHECK (length(description) BETWEEN 1 AND 5000 AND version >= 0 AND "evidenceRevision" >= 0);
CREATE UNIQUE INDEX "ReturnCase_one_active_per_order" ON "ReturnCase" ("merchantId", "orderId") WHERE status NOT IN ('COMPLETED', 'FAILED');

CREATE FUNCTION returnwise_protect_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only';
END;
$$;
CREATE TRIGGER "AuditLog_no_update_delete" BEFORE UPDATE OR DELETE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION returnwise_protect_audit();
-- TRUNCATE does not fire row DELETE triggers.
CREATE TRIGGER "AuditLog_no_truncate" BEFORE TRUNCATE ON "AuditLog" FOR EACH STATEMENT EXECUTE FUNCTION returnwise_protect_audit();
