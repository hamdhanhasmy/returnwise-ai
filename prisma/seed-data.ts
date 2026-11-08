import type { PrismaClient } from "../src/generated/prisma/client";
import { demoIds } from "./fixtures";

export async function seedDatabase(db: PrismaClient) {
  // Upserts intentionally preserve existing rows: repeated setup never resets decisions/data.
  await db.$transaction(async (tx) => {
    for (const [id, name] of [
      [demoIds.merchant, "Oak & Loom"],
      [demoIds.otherMerchant, "Northstar Goods"],
    ]) {
      await tx.merchant.upsert({
        where: { id },
        update: {},
        create: {
          id,
          name: name!,
          sandboxAccountAlias: "Not connected",
          paymentsEnabled: false,
        },
      });
    }
    for (const user of [
      {
        id: demoIds.admin,
        merchantId: demoIds.merchant,
        email: "admin@oakandloom.example",
        role: "ADMIN" as const,
      },
      {
        id: demoIds.staff,
        merchantId: demoIds.merchant,
        email: "staff@oakandloom.example",
        role: "STAFF" as const,
      },
      {
        id: demoIds.otherAdmin,
        merchantId: demoIds.otherMerchant,
        email: "admin@northstar.example",
        role: "ADMIN" as const,
      },
    ])
      await tx.user.upsert({
        where: { id: user.id },
        update: {},
        create: user,
      });
    for (const [id, merchantId] of [
      [demoIds.policy, demoIds.merchant],
      [demoIds.otherPolicy, demoIds.otherMerchant],
    ]) {
      await tx.merchantPolicy.upsert({
        where: { id },
        update: {},
        create: {
          id: id!,
          merchantId: merchantId!,
          version: 1,
          effectiveAt: new Date("2026-11-01T00:00:00Z"),
          returnWindowDays: 30,
          eligibleCategories: ["Home", "Accessories"],
          allowKeepWithoutReturn: true,
          allowPartialKeep: false,
          requireReturnReceipt: true,
          manualReviewThresholdMinor: 25000n,
          currency: "USD",
          termsVersion: "illustrative-v1",
          rulesJson: {
            source: "SIMULATED",
            notice:
              "Illustrative policy; eligibility engine is not implemented",
          },
        },
      });
    }
    const examples = [
      {
        suffix: "21",
        caseId: demoIds.cases[0],
        name: "Stoneware serving bowl",
        sku: "HOME-021",
        category: "Home",
        amount: 8000n,
        recovery: 1200n,
        number: "RW-1042",
        reason: "DAMAGED" as const,
        status: "MANUAL_REVIEW" as const,
        description:
          "Synthetic scenario A: the customer reports a chipped rim on arrival. Illustrative shipping and inspection costs may exceed recovery value. No assessment or refund decision has been made.",
      },
      {
        suffix: "22",
        caseId: demoIds.cases[1],
        name: "Weekender carryall",
        sku: "BAG-014",
        category: "Accessories",
        amount: 24000n,
        recovery: 18000n,
        number: "RW-1041",
        reason: "NOT_AS_DESCRIBED" as const,
        status: "PENDING" as const,
        description:
          "Synthetic scenario B: the customer reports that the color differs from the listing. The item may retain resale value. No return has been collected or verified.",
      },
      {
        suffix: "23",
        caseId: demoIds.cases[2],
        name: "Linen cushion cover",
        sku: "HOME-038",
        category: "Home",
        amount: 4500n,
        recovery: 1500n,
        number: "RW-1040",
        reason: "OTHER" as const,
        status: "MANUAL_REVIEW" as const,
        description:
          "Synthetic scenario C: the description is incomplete and purchase timing is uncertain. A person must review the missing context; no entitlement or payment decision is implied.",
      },
    ];
    for (const [index, example] of examples.entries()) {
      const id = `11111111-1111-4111-8111-1111111111${example.suffix}`;
      const orderId = `11111111-1111-4111-8111-1111111111${index + 41}`;
      await tx.product.upsert({
        where: { id },
        update: {},
        create: {
          id,
          merchantId: demoIds.merchant,
          sku: example.sku,
          name: example.name,
          category: example.category,
          currency: "USD",
          saleAmountMinor: example.amount,
          recoveryValueMinor: example.recovery,
          estimateSource: "SIMULATED",
        },
      });
      await tx.order.upsert({
        where: { id: orderId },
        update: {},
        create: {
          id: orderId,
          merchantId: demoIds.merchant,
          productId: id,
          publicOrderNumber: example.number,
          productSnapshot: {
            name: example.name,
            sku: example.sku,
            category: example.category,
            quantity: 1,
            priceMinor: example.amount.toString(),
          },
          customerRef: `synthetic-customer-${index + 1}`,
          currency: "USD",
          totalMinor: example.amount,
          origin: "SIMULATED",
          purchasedAt: new Date("2026-11-03T10:00:00Z"),
          deliveredAt: index === 2 ? null : new Date("2026-11-05T12:00:00Z"),
        },
      });
      await tx.returnCase.upsert({
        where: { id: example.caseId },
        update: {},
        create: {
          id: example.caseId,
          merchantId: demoIds.merchant,
          orderId,
          policyId: demoIds.policy,
          reason: example.reason,
          description: example.description,
          customerClaim: {
            source: "SIMULATED",
            label: `Scenario ${String.fromCharCode(65 + index)}`,
          },
          status: example.status,
          createdAt: new Date(`2026-11-08T0${9 - index}:00:00Z`),
        },
      });
    }
    const otherProduct = "22222222-2222-4222-8222-222222222221";
    const otherOrder = "22222222-2222-4222-8222-222222222241";
    await tx.product.upsert({
      where: { id: otherProduct },
      update: {},
      create: {
        id: otherProduct,
        merchantId: demoIds.otherMerchant,
        sku: "NS-001",
        name: "Northstar field notebook",
        category: "Stationery",
        currency: "USD",
        saleAmountMinor: 2500n,
        recoveryValueMinor: 500n,
        estimateSource: "SIMULATED",
      },
    });
    await tx.order.upsert({
      where: { id: otherOrder },
      update: {},
      create: {
        id: otherOrder,
        merchantId: demoIds.otherMerchant,
        productId: otherProduct,
        publicOrderNumber: "NS-1001",
        productSnapshot: {
          name: "Northstar field notebook",
          quantity: 1,
          priceMinor: "2500",
        },
        customerRef: "synthetic-tenant-b",
        currency: "USD",
        totalMinor: 2500n,
        origin: "SIMULATED",
      },
    });
    await tx.returnCase.upsert({
      where: { id: demoIds.otherCase },
      update: {},
      create: {
        id: demoIds.otherCase,
        merchantId: demoIds.otherMerchant,
        orderId: otherOrder,
        policyId: demoIds.otherPolicy,
        reason: "WRONG_ITEM",
        description:
          "Synthetic tenant-isolation fixture. This case belongs only to Northstar Goods.",
        customerClaim: { source: "SIMULATED" },
        status: "MANUAL_REVIEW",
      },
    });
  });
}
