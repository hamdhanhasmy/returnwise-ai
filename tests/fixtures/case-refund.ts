import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { PaymentService } from "../../src/server/services/payments";
import { ReturnService } from "../../src/server/services/returns";
import { CaseRefundService } from "../../src/server/services/case-refunds";
import {
  conservativePolicy,
  type Resolution,
} from "../../src/lib/returns/contracts";
import { FakePayPal } from "./paypal";
export async function caseRefundFixture(db: PrismaClient) {
  const merchantId = randomUUID().replaceAll("-", "").toUpperCase();
  const merchant = await db.merchant.create({
      data: {
        name: "MOCK case refund merchant",
        sandboxAccountAlias: "AUTOMATED MOCK",
        paypalMerchantId: merchantId,
        paymentsEnabled: true,
      },
    }),
    user = await db.user.create({
      data: {
        merchantId: merchant.id,
        email: `${randomUUID()}@example.invalid`,
        role: "ADMIN",
      },
    });
  const p = {
      userId: user.id,
      merchantId: merchant.id,
      email: user.email,
      role: user.role,
      merchantName: merchant.name,
    },
    provider = new FakePayPal(merchantId),
    payments = new PaymentService(db, provider, merchantId),
    returns = new ReturnService(db),
    service = new CaseRefundService(payments);
  await returns.savePolicy(p, {
    ...conservativePolicy,
    allowReturnless: true,
    allowPartial: true,
    partialOfferMinor: "2000",
    maxPartialMinor: "2000",
    maxPartialBps: 5000,
    shippingMinor: "1800",
    handlingMinor: "700",
    recoveryMethod: "PRODUCT_ESTIMATE",
  });
  const product = await db.product.create({
    data: {
      merchantId: merchant.id,
      name: "MOCK low-value bowl",
      sku: randomUUID(),
      category: "Home",
      currency: "USD",
      saleAmountMinor: 8000n,
      recoveryValueMinor: 1200n,
    },
  });
  let payment = await payments.create(p, product.id, randomUUID());
  provider.approve(payment.paypalOrderId!);
  payment = await payments.capture(p, payment.id);
  const link = await returns.issueAccess(p, payment.orderId),
    submitted = await returns.submit(link.token, {
      productId: product.id,
      reason: "DAMAGED",
      condition: "DAMAGED",
      description:
        "The product arrived broken into two clearly separated pieces.",
    });
  async function current() {
    return db.returnCase.findUniqueOrThrow({ where: { id: submitted.caseId } });
  }
  async function propose(resolution: Resolution = "FULL_REFUND_KEEP") {
    const c = await current();
    await returns.command(p, c.id, {
      action: "propose",
      version: c.version,
      note: "Exact customer remedy, reviewed independently by the merchant.",
      rightsConfirmed: true,
      resolution,
    });
    return db.returnProposal.findFirstOrThrow({
      where: { caseId: c.id },
      orderBy: { createdAt: "desc" },
    });
  }
  async function approve() {
    const c = await current();
    await returns.command(p, c.id, {
      action: "approve",
      version: c.version,
      note: "Merchant reviewed the exact accepted terms and entitlement.",
      rightsConfirmed: true,
    });
  }
  async function request() {
    const c = await current(),
      proposal = await db.returnProposal.findFirstOrThrow({
        where: { caseId: c.id, status: "APPROVED" },
      });
    return {
      version: c.version,
      proposalId: proposal.id,
      termsHash: proposal.termsHash,
      confirmed: true,
      eligibilityConfirmed: true,
    };
  }
  return {
    db,
    p,
    provider,
    payments,
    returns,
    service,
    payment,
    product,
    caseId: submitted.caseId,
    token: submitted.token,
    current,
    propose,
    approve,
    request,
  };
}
