import { scriptDatabase } from "./database";
import { demoIds } from "../prisma/fixtures";
import { ReturnService } from "../src/server/services/returns";
import { conservativePolicy } from "../src/lib/returns/contracts";
import { digest } from "../src/server/services/payment-rules";
const db = scriptDatabase();
try {
  const user = await db.user.findFirstOrThrow({
    where: {
      id: demoIds.admin,
      merchantId: demoIds.merchant,
      disabledAt: null,
      role: "ADMIN",
    },
    include: { merchant: true },
  });
  if (!user.merchant.paymentsEnabled) throw Error("merchant-disabled");
  const p = {
    userId: user.id,
    merchantId: user.merchantId,
    role: user.role,
    email: user.email,
    merchantName: user.merchant.name,
  };
  const rules = {
    ...conservativePolicy,
    allowReturnless: true,
    allowPartial: true,
    partialOfferMinor: "200",
    maxPartialMinor: "200",
    maxPartialBps: 5000,
    shippingMinor: "200",
    handlingMinor: "100",
    recoveryMethod: "PRODUCT_ESTIMATE" as const,
    highValueMinor: "25000",
  };
  const latest = await db.merchantPolicy.findFirst({
    where: { merchantId: p.merchantId, usage: "RETURNS" },
    orderBy: { version: "desc" },
  });
  const policy =
    latest && digest(latest.returnRules) === digest(rules)
      ? latest
      : await new ReturnService(db).savePolicy(p, rules);
  const existing = await db.product.findFirst({
    where: { merchantId: p.merchantId, sku: "PHASE5-BOWL-USD5" },
  });
  const product =
    existing ??
    (await db.product.create({
      data: {
        merchantId: p.merchantId,
        name: "Fictional ceramic bowl — Phase 5 Sandbox demo",
        sku: "PHASE5-BOWL-USD5",
        category: "Home",
        currency: "USD",
        saleAmountMinor: 500n,
        recoveryValueMinor: 25n,
      },
    }));
  if (product.saleAmountMinor !== 500n || product.recoveryValueMinor !== 25n)
    throw Error("demo-product-changed");
  console.log(
    JSON.stringify({
      productId: product.id,
      amount: "5.00",
      currency: "USD",
      policyVersion: policy.version,
      modeledReturnCost: "7.75",
      modeledReturnlessCost: "5.00",
      modeledAdvantage: "2.75",
      providerRequests: 0,
      image: "assets/demo/synthetic-broken-bowl.png",
    }),
  );
} catch {
  console.error(
    "Demo setup stopped. Check the enabled demo admin/merchant and existing product configuration; no provider request was made.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
