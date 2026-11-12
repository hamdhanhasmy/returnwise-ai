BEGIN;

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATING', 'AWAITING_APPROVAL', 'CAPTURE_PENDING', 'CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'CANCELLED', 'FAILED', 'NEEDS_RECONCILIATION');

-- CreateEnum
CREATE TYPE "LedgerState" AS ENUM ('UNVERIFIED', 'RECONCILED', 'FROZEN');

-- CreateEnum
CREATE TYPE "CheckoutKind" AS ENUM ('CREATE_ORDER', 'CAPTURE_ORDER');

-- CreateEnum
CREATE TYPE "OperationStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROVIDER_PENDING', 'NEEDS_RECONCILIATION', 'COMPLETED', 'FAILED_FINAL', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReservationState" AS ENUM ('HELD', 'SETTLED', 'RELEASED');

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "paymentId" UUID,
ADD COLUMN     "refundOperationId" UUID;

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "checkoutKey" UUID NOT NULL,
    "paypalOrderId" TEXT,
    "paypalCaptureId" TEXT,
    "expectedPayeeId" TEXT NOT NULL,
    "expectedAmountMinor" BIGINT NOT NULL,
    "captureAmountMinor" BIGINT,
    "currency" CHAR(3) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATING',
    "orderProviderStatus" TEXT,
    "captureProviderStatus" TEXT,
    "captureCompletedAt" TIMESTAMPTZ(3),
    "lastVerifiedAt" TIMESTAMPTZ(3),
    "ledgerState" "LedgerState" NOT NULL DEFAULT 'UNVERIFIED',
    "reconciliationReason" TEXT,
    "leaseOwner" UUID,
    "leaseUntil" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckoutOperation" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "kind" "CheckoutKind" NOT NULL,
    "requestId" UUID NOT NULL,
    "requestPayload" JSONB NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "status" "OperationStatus" NOT NULL DEFAULT 'PENDING',
    "firstSentAt" TIMESTAMPTZ(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CheckoutOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundApproval" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "policyId" UUID NOT NULL,
    "requestedByUserId" UUID NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "termsHash" CHAR(64) NOT NULL,
    "requiresConsent" BOOLEAN NOT NULL,
    "consentTokenHash" CHAR(64),
    "consentedAt" TIMESTAMPTZ(3),
    "eligibilityConfirmedAt" TIMESTAMPTZ(3),
    "approvedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundOperation" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "approvalId" UUID NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "requestId" UUID NOT NULL,
    "requestPayload" JSONB NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "status" "OperationStatus" NOT NULL DEFAULT 'PENDING',
    "reservation" "ReservationState" NOT NULL DEFAULT 'HELD',
    "candidateRefundId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "firstSentAt" TIMESTAMPTZ(3),
    "retryNotAfter" TIMESTAMPTZ(3),
    "lastErrorCode" TEXT,
    "lastVerifiedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RefundOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderRefund" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "operationId" UUID,
    "paypalRefundId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "providerStatus" TEXT NOT NULL,
    "providerUpdatedAt" TIMESTAMPTZ(3),
    "verifiedAt" TIMESTAMPTZ(3) NOT NULL,
    "totalRefundedMinor" BIGINT,
    "external" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProviderRefund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "merchantId" UUID,
    "paymentId" UUID,
    "eventType" TEXT NOT NULL,
    "resourceId" TEXT,
    "payloadHash" CHAR(64) NOT NULL,
    "redactedResourceJson" JSONB NOT NULL,
    "verifiedAt" TIMESTAMPTZ(3) NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),
    "leaseUntil" TIMESTAMPTZ(3),
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "lastErrorCode" TEXT,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_orderId_key" ON "Payment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_paypalOrderId_key" ON "Payment"("paypalOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_paypalCaptureId_key" ON "Payment"("paypalCaptureId");

-- CreateIndex
CREATE INDEX "Payment_merchantId_status_createdAt_idx" ON "Payment"("merchantId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_merchantId_id_key" ON "Payment"("merchantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_merchantId_checkoutKey_key" ON "Payment"("merchantId", "checkoutKey");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_merchantId_orderId_key" ON "Payment"("merchantId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutOperation_requestId_key" ON "CheckoutOperation"("requestId");

-- CreateIndex
CREATE INDEX "CheckoutOperation_status_updatedAt_idx" ON "CheckoutOperation"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutOperation_merchantId_id_key" ON "CheckoutOperation"("merchantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutOperation_paymentId_kind_key" ON "CheckoutOperation"("paymentId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "RefundApproval_consentTokenHash_key" ON "RefundApproval"("consentTokenHash");

-- CreateIndex
CREATE INDEX "RefundApproval_merchantId_paymentId_createdAt_idx" ON "RefundApproval"("merchantId", "paymentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefundApproval_merchantId_id_paymentId_key" ON "RefundApproval"("merchantId", "id", "paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "RefundOperation_approvalId_key" ON "RefundOperation"("approvalId");

-- CreateIndex
CREATE UNIQUE INDEX "RefundOperation_requestId_key" ON "RefundOperation"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "RefundOperation_candidateRefundId_key" ON "RefundOperation"("candidateRefundId");

-- CreateIndex
CREATE INDEX "RefundOperation_merchantId_paymentId_reservation_idx" ON "RefundOperation"("merchantId", "paymentId", "reservation");

-- CreateIndex
CREATE INDEX "RefundOperation_status_updatedAt_idx" ON "RefundOperation"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefundOperation_merchantId_id_key" ON "RefundOperation"("merchantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "RefundOperation_merchantId_id_paymentId_key" ON "RefundOperation"("merchantId", "id", "paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "RefundOperation_merchantId_approvalId_paymentId_key" ON "RefundOperation"("merchantId", "approvalId", "paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderRefund_operationId_key" ON "ProviderRefund"("operationId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderRefund_paypalRefundId_key" ON "ProviderRefund"("paypalRefundId");

-- CreateIndex
CREATE INDEX "ProviderRefund_merchantId_paymentId_idx" ON "ProviderRefund"("merchantId", "paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderRefund_merchantId_id_key" ON "ProviderRefund"("merchantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderRefund_merchantId_operationId_paymentId_key" ON "ProviderRefund"("merchantId", "operationId", "paymentId");

-- CreateIndex
CREATE INDEX "WebhookEvent_status_receivedAt_idx" ON "WebhookEvent"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "AuditLog_merchantId_paymentId_createdAt_idx" ON "AuditLog"("merchantId", "paymentId", "createdAt");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_merchantId_paymentId_fkey" FOREIGN KEY ("merchantId", "paymentId") REFERENCES "Payment"("merchantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_merchantId_refundOperationId_fkey" FOREIGN KEY ("merchantId", "refundOperationId") REFERENCES "RefundOperation"("merchantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_merchantId_orderId_fkey" FOREIGN KEY ("merchantId", "orderId") REFERENCES "Order"("merchantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutOperation" ADD CONSTRAINT "CheckoutOperation_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutOperation" ADD CONSTRAINT "CheckoutOperation_merchantId_paymentId_fkey" FOREIGN KEY ("merchantId", "paymentId") REFERENCES "Payment"("merchantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundApproval" ADD CONSTRAINT "RefundApproval_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundApproval" ADD CONSTRAINT "RefundApproval_merchantId_paymentId_fkey" FOREIGN KEY ("merchantId", "paymentId") REFERENCES "Payment"("merchantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundApproval" ADD CONSTRAINT "RefundApproval_merchantId_policyId_fkey" FOREIGN KEY ("merchantId", "policyId") REFERENCES "MerchantPolicy"("merchantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundApproval" ADD CONSTRAINT "RefundApproval_merchantId_requestedByUserId_fkey" FOREIGN KEY ("merchantId", "requestedByUserId") REFERENCES "User"("merchantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundOperation" ADD CONSTRAINT "RefundOperation_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundOperation" ADD CONSTRAINT "RefundOperation_merchantId_paymentId_fkey" FOREIGN KEY ("merchantId", "paymentId") REFERENCES "Payment"("merchantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundOperation" ADD CONSTRAINT "RefundOperation_merchantId_approvalId_paymentId_fkey" FOREIGN KEY ("merchantId", "approvalId", "paymentId") REFERENCES "RefundApproval"("merchantId", "id", "paymentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderRefund" ADD CONSTRAINT "ProviderRefund_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderRefund" ADD CONSTRAINT "ProviderRefund_merchantId_paymentId_fkey" FOREIGN KEY ("merchantId", "paymentId") REFERENCES "Payment"("merchantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderRefund" ADD CONSTRAINT "ProviderRefund_merchantId_operationId_paymentId_fkey" FOREIGN KEY ("merchantId", "operationId", "paymentId") REFERENCES "RefundOperation"("merchantId", "id", "paymentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_merchantId_paymentId_fkey" FOREIGN KEY ("merchantId", "paymentId") REFERENCES "Payment"("merchantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Phase 2 replaces the temporary all-disabled guard; existing merchants stay disabled.
ALTER TABLE "Merchant" DROP CONSTRAINT "Merchant_payments_disabled_phase1";
ALTER TABLE "Merchant" ADD CONSTRAINT "Merchant_payment_binding" CHECK (NOT "paymentsEnabled" OR "paypalMerchantId" IS NOT NULL);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_money" CHECK (currency = 'USD' AND "expectedAmountMinor" BETWEEN 1 AND 100000 AND ("captureAmountMinor" IS NULL OR "captureAmountMinor" = "expectedAmountMinor") AND version >= 0);
ALTER TABLE "RefundApproval" ADD CONSTRAINT "RefundApproval_terms" CHECK (currency = 'USD' AND "amountMinor" BETWEEN 1 AND 100000 AND length(reason) BETWEEN 3 AND 255 AND "expiresAt" > "createdAt" AND (NOT "requiresConsent" OR "consentTokenHash" IS NOT NULL) AND ("approvedAt" IS NULL OR ("eligibilityConfirmedAt" IS NOT NULL AND (NOT "requiresConsent" OR "consentedAt" IS NOT NULL))));
ALTER TABLE "RefundOperation" ADD CONSTRAINT "RefundOperation_money" CHECK (currency = 'USD' AND "amountMinor" BETWEEN 1 AND 100000 AND "attemptCount" >= 0);
ALTER TABLE "ProviderRefund" ADD CONSTRAINT "ProviderRefund_money" CHECK (currency = 'USD' AND "amountMinor" BETWEEN 1 AND 100000 AND ("totalRefundedMinor" IS NULL OR "totalRefundedMinor" BETWEEN 1 AND 100000));
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_target" CHECK ("paymentId" IS NULL OR "merchantId" IS NOT NULL);

CREATE FUNCTION returnwise_immutable_payment_terms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."merchantId", NEW."orderId", NEW."checkoutKey", NEW."expectedPayeeId", NEW."expectedAmountMinor", NEW.currency)
     IS DISTINCT FROM ROW(OLD."merchantId", OLD."orderId", OLD."checkoutKey", OLD."expectedPayeeId", OLD."expectedAmountMinor", OLD.currency)
     OR (OLD."paypalOrderId" IS NOT NULL AND NEW."paypalOrderId" IS DISTINCT FROM OLD."paypalOrderId")
     OR (OLD."paypalCaptureId" IS NOT NULL AND NEW."paypalCaptureId" IS DISTINCT FROM OLD."paypalCaptureId") THEN
    RAISE EXCEPTION 'Payment identity and amounts are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Payment_immutable_terms" BEFORE UPDATE ON "Payment" FOR EACH ROW EXECUTE FUNCTION returnwise_immutable_payment_terms();

CREATE FUNCTION returnwise_immutable_approval() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['consentedAt','eligibilityConfirmedAt','approvedAt'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['consentedAt','eligibilityConfirmedAt','approvedAt'])
     OR (OLD."consentedAt" IS NOT NULL AND NEW."consentedAt" IS DISTINCT FROM OLD."consentedAt")
     OR (OLD."approvedAt" IS NOT NULL AND NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt") THEN
    RAISE EXCEPTION 'Refund approval terms and recorded consent are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "RefundApproval_immutable_terms" BEFORE UPDATE ON "RefundApproval" FOR EACH ROW EXECUTE FUNCTION returnwise_immutable_approval();

CREATE FUNCTION returnwise_immutable_operation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."merchantId", NEW."paymentId", NEW."requestId", NEW."requestHash", NEW."requestPayload")
     IS DISTINCT FROM ROW(OLD."merchantId", OLD."paymentId", OLD."requestId", OLD."requestHash", OLD."requestPayload") THEN
    RAISE EXCEPTION 'Operation identity and request are immutable';
  END IF;
  IF TG_TABLE_NAME = 'RefundOperation' AND
     (to_jsonb(NEW) -> 'approvalId' IS DISTINCT FROM to_jsonb(OLD) -> 'approvalId' OR
      to_jsonb(NEW) -> 'amountMinor' IS DISTINCT FROM to_jsonb(OLD) -> 'amountMinor' OR
      to_jsonb(NEW) -> 'currency' IS DISTINCT FROM to_jsonb(OLD) -> 'currency') THEN
    RAISE EXCEPTION 'Approved refund amount is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "CheckoutOperation_immutable_request" BEFORE UPDATE ON "CheckoutOperation" FOR EACH ROW EXECUTE FUNCTION returnwise_immutable_operation();
CREATE TRIGGER "RefundOperation_immutable_request" BEFORE UPDATE ON "RefundOperation" FOR EACH ROW EXECUTE FUNCTION returnwise_immutable_operation();

CREATE FUNCTION returnwise_immutable_refund() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."merchantId", NEW."paymentId", NEW."paypalRefundId", NEW."amountMinor", NEW.currency)
     IS DISTINCT FROM ROW(OLD."merchantId", OLD."paymentId", OLD."paypalRefundId", OLD."amountMinor", OLD.currency) THEN
    RAISE EXCEPTION 'Provider refund identity and amount are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ProviderRefund_immutable_terms" BEFORE UPDATE ON "ProviderRefund" FOR EACH ROW EXECUTE FUNCTION returnwise_immutable_refund();

COMMIT;
