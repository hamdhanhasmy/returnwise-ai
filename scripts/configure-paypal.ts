import "dotenv/config";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { scriptDatabase } from "./database";
import { paypalConfig } from "../src/lib/payments/config";
const merchant = z
  .uuid()
  .safeParse(process.argv.find((a) => a.startsWith("--merchant="))?.slice(11));
if (!merchant.success) {
  console.error(
    "Usage: npm run paypal:configure -- --merchant=<local-merchant-UUID>",
  );
  process.exit(1);
}
// Local operator explicitly binds a merchant; no PayPal requests, credentials or tokens are logged.
const config = paypalConfig(),
  db = scriptDatabase();
try {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Merchant" WHERE id=${merchant.data}::uuid FOR UPDATE`;
    const current = await tx.merchant.findUniqueOrThrow({
      where: { id: merchant.data },
    });
    if (
      current.paypalMerchantId &&
      current.paypalMerchantId !== config.merchantId
    )
      throw new Error("Rebinding requires manual review of existing payments");
    const alreadyBound = await tx.merchant.findFirst({
      where: {
        paypalMerchantId: config.merchantId,
        id: { not: current.id },
        paymentsEnabled: true,
      },
    });
    if (alreadyBound)
      throw new Error(
        "Sandbox account is already bound to a different merchant",
      );
    await tx.merchant.update({
      where: { id: current.id },
      data: {
        paypalMerchantId: config.merchantId,
        paymentsEnabled: true,
        sandboxAccountAlias: "Configured Sandbox business account",
      },
    });
    const latest = await tx.merchantPolicy.findFirst({
      where: { merchantId: current.id },
      orderBy: { version: "desc" },
    });
    if (process.argv.includes("--verification-product")) {
      const sku = "SANDBOX-VERIFY-001";
      const existing = await tx.product.findUnique({
        where: { merchantId_sku: { merchantId: current.id, sku } },
      });
      if (
        existing &&
        (existing.saleAmountMinor !== 100n || existing.currency !== "USD")
      )
        throw new Error(
          "Verification product price changed; manual review required",
        );
      await tx.product.upsert({
        where: { merchantId_sku: { merchantId: current.id, sku } },
        update: {},
        create: {
          merchantId: current.id,
          sku,
          name: "Sandbox verification item — fictional",
          category: "Home",
          currency: "USD",
          saleAmountMinor: 100n,
          recoveryValueMinor: 0n,
          estimateSource: "SIMULATED",
        },
      });
    }
    if (latest?.termsVersion !== "sandbox-demonstration-v1") {
      const products = await tx.product.findMany({
        where: { merchantId: current.id },
        select: { category: true },
      });
      await tx.merchantPolicy.create({
        data: {
          merchantId: current.id,
          version: (latest?.version ?? 0) + 1,
          effectiveAt: new Date(),
          returnWindowDays: 30,
          eligibleCategories: [...new Set(products.map((p) => p.category))],
          allowKeepWithoutReturn: true,
          allowPartialKeep: true,
          requireReturnReceipt: false,
          manualReviewThresholdMinor: 100000n,
          currency: "USD",
          termsVersion: "sandbox-demonstration-v1",
          rulesJson: {
            source: "SIMULATED",
            notice:
              "Fictional demonstration policy. Human eligibility attestation and exact buyer acceptance for partial refunds required.",
          },
        },
      });
    }
    await tx.auditLog.create({
      data: {
        merchantId: current.id,
        actorType: "SYSTEM",
        action: "SANDBOX_MERCHANT_CONFIGURED",
        correlationId: randomUUID(),
        redactedMetadataJson: {
          environment: "sandbox",
          policy: "sandbox-demonstration-v1",
        },
      },
    });
  });
  console.log(
    "Local merchant configured for Sandbox only. Credentials have NOT been verified against PayPal. Restart the app and complete buyer approval in Demo checkout.",
  );
} catch {
  console.error(
    "Configuration failed. Verify the local merchant, unique account binding, and migrations. No credentials were printed.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
