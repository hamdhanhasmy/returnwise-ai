import { scriptDatabase } from "../scripts/database";
import { seedDatabase } from "./seed-data";
import { demoIds } from "./fixtures";
import { ReturnService } from "../src/server/services/returns";
import { conservativePolicy } from "../src/lib/returns/contracts";
const db = scriptDatabase();
try {
  await seedDatabase(db);
  const user = await db.user.findUniqueOrThrow({
    where: { id: demoIds.admin },
  });
  const p = {
    merchantId: demoIds.merchant,
    userId: user.id,
    email: user.email,
    role: user.role,
    merchantName: "Oak & Loom",
  };
  const service = new ReturnService(db);
  if (
    !(await db.merchantPolicy.findFirst({
      where: { merchantId: p.merchantId, usage: "RETURNS" },
    }))
  )
    await service.savePolicy(p, {
      ...conservativePolicy,
      allowReturnless: true,
      allowPartial: true,
      partialOfferMinor: "2000",
      maxPartialMinor: "3000",
      maxPartialBps: 5000,
      shippingMinor: "1800",
      handlingMinor: "700",
      recoveryMethod: "PRODUCT_ESTIMATE",
      highValueMinor: "50000",
    });
  for (const item of [
    {
      key: "A",
      name: "Synthetic damaged bowl",
      amount: 8000n,
      recovery: 1200n,
      reason: "DAMAGED",
      condition: "DAMAGED",
    },
    {
      key: "B",
      name: "Synthetic recoverable lamp",
      amount: 24000n,
      recovery: 18000n,
      reason: "WRONG_ITEM",
      condition: "UNOPENED",
    },
    {
      key: "C",
      name: "Synthetic ambiguous textile",
      amount: 6000n,
      recovery: 1000n,
      reason: "OTHER",
      condition: "UNKNOWN",
    },
    {
      key: "INTAKE",
      name: "Synthetic customer intake item",
      amount: 8000n,
      recovery: 1200n,
      reason: "DAMAGED",
      condition: "DAMAGED",
    },
  ]) {
    const sku = `RETURN-DEMO-${item.key}`;
    const product = await db.product.upsert({
      where: { merchantId_sku: { merchantId: p.merchantId, sku } },
      update: {},
      create: {
        merchantId: p.merchantId,
        sku,
        name: item.name,
        category: "Home",
        currency: "USD",
        saleAmountMinor: item.amount,
        recoveryValueMinor: item.recovery,
      },
    });
    let order = await db.order.findFirst({
      where: {
        merchantId: p.merchantId,
        publicOrderNumber: `RW-DEMO-${item.key}`,
      },
    });
    if (!order)
      order = await db.order.create({
        data: {
          merchantId: p.merchantId,
          productId: product.id,
          publicOrderNumber: `RW-DEMO-${item.key}`,
          customerRef: "SYNTHETIC",
          productSnapshot: { name: product.name, category: product.category },
          currency: "USD",
          totalMinor: item.amount,
          origin: "SIMULATED",
          timingProvenance: "SIMULATED",
          purchasedAt: new Date(Date.now() - 86400000),
        },
      });
    if (
      item.key !== "INTAKE" &&
      !(await db.returnCase.findFirst({
        where: { merchantId: p.merchantId, orderId: order.id },
      }))
    ) {
      const access = await service.issueAccess(p, order.id);
      await service.submit(access.token, {
        productId: product.id,
        reason: item.reason,
        condition: item.condition,
        description: `Synthetic scenario ${item.key}: ${item.name}. Fictional issue and configured estimates for demonstration only.`,
      });
      await service.revokeAccess(p, order.id);
    }
  }
  console.log(
    "Synthetic return scenarios ready. Existing rows/policies preserved; no PayPal operations or payment records created.",
  );
} catch {
  console.error(
    "Return seed failed. Check migrations and local configuration. No reset was performed.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
