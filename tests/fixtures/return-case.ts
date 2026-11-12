import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { ReturnService } from "../../src/server/services/returns";
import { conservativePolicy } from "../../src/lib/returns/contracts";
export async function syntheticCase(db: PrismaClient) {
  const merchant = await db.merchant.create({
      data: {
        name: "SYNTHETIC evidence test",
        sandboxAccountAlias: "NO PROVIDER PAYMENTS",
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
      merchantId: merchant.id,
      userId: user.id,
      role: user.role,
      email: user.email,
      merchantName: merchant.name,
    },
    returns = new ReturnService(db);
  await returns.savePolicy(p, {
    ...conservativePolicy,
    allowReturnless: true,
    shippingMinor: "1800",
    handlingMinor: "700",
    recoveryMethod: "PRODUCT_ESTIMATE",
  });
  const product = await db.product.create({
    data: {
      merchantId: merchant.id,
      name: "Synthetic evidence bowl",
      sku: randomUUID(),
      category: "Home",
      currency: "USD",
      saleAmountMinor: 8000n,
      recoveryValueMinor: 1200n,
    },
  });
  const order = await db.order.create({
    data: {
      merchantId: merchant.id,
      productId: product.id,
      publicOrderNumber: randomUUID(),
      productSnapshot: { name: product.name, category: "Home" },
      customerRef: "PRIVATE-CUSTOMER",
      currency: "USD",
      totalMinor: 8000n,
      origin: "SIMULATED",
      timingProvenance: "SIMULATED",
      purchasedAt: new Date(Date.now() - 86400000),
    },
  });
  const link = await returns.issueAccess(p, order.id),
    submitted = await returns.submit(link.token, {
      productId: product.id,
      reason: "DAMAGED",
      condition: "DAMAGED",
      description:
        "The synthetic bowl arrived broken into two separated pieces.",
    });
  return {
    p,
    returns,
    order,
    product,
    caseId: submitted.caseId,
    token: submitted.token,
  };
}
