import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../../scripts/test-database";
import { issueLoginToken } from "../../src/server/services/auth";

test("mocked refund UI requires exact review and explicit confirmation; pending is not success", async ({
  page,
}) => {
  // A visibly named UI fixture on verified test PostgreSQL; never a PayPal operation.
  const db = await testDatabase();
  let token: string, paymentId: string;
  const approvalId = randomUUID();
  try {
    const merchant = await db.merchant.create({
      data: {
        name: "MOCK browser test merchant",
        sandboxAccountAlias: "AUTOMATED MOCK",
        paymentsEnabled: false,
      },
    });
    await db.user.create({
      data: {
        merchantId: merchant.id,
        email: "browser@example.invalid",
        role: "ADMIN",
      },
    });
    const product = await db.product.create({
      data: {
        merchantId: merchant.id,
        name: "MOCK browser test product",
        sku: randomUUID(),
        category: "Home",
        currency: "USD",
        saleAmountMinor: 8000n,
        recoveryValueMinor: 0n,
      },
    });
    const order = await db.order.create({
      data: {
        merchantId: merchant.id,
        productId: product.id,
        publicOrderNumber: `MOCK-${randomUUID()}`,
        productSnapshot: { category: "Home", name: product.name },
        customerRef: "MOCK",
        currency: "USD",
        totalMinor: 8000n,
        origin: "PAYPAL_SANDBOX",
        timingProvenance: "UTC_RECORDED",
        purchasedAt: new Date(),
      },
    });
    const payment = await db.payment.create({
      data: {
        merchantId: merchant.id,
        orderId: order.id,
        checkoutKey: randomUUID(),
        expectedPayeeId: "MOCK",
        expectedAmountMinor: 8000n,
        currency: "USD",
        paypalOrderId: `MOCK-${randomUUID()}`,
        paypalCaptureId: `MOCK-${randomUUID()}`,
        status: "CAPTURED",
        captureAmountMinor: 8000n,
        captureCompletedAt: new Date(),
        captureProviderStatus: "COMPLETED",
        orderProviderStatus: "COMPLETED",
        ledgerState: "RECONCILED",
        lastVerifiedAt: new Date(),
      },
    });
    paymentId = payment.id;
    token = await issueLoginToken(db, merchant.id, "browser@example.invalid");
  } finally {
    await db.$disconnect();
  }
  await page.goto(`/login#token=${token}`);
  await expect(page.getByLabel("One-time access token")).toHaveValue(token);
  await page.getByRole("button", { name: "Open your workspace" }).click();
  await expect(page).toHaveURL(/dashboard$/);
  let confirmations = 0;
  await page.route(`**/api/payments/${paymentId}`, async (route) => {
    const input = route.request().postDataJSON();
    if (input.action === "prepare-refund") {
      expect(input.amount).toBe("20.00");
      expect(input.reason).toBe("Agreed partial Sandbox resolution");
      await route.fulfill({
        json: {
          approvalId,
          amountMinor: "2000",
          reason: input.reason,
          requiresConsent: true,
          expiresAt: new Date(Date.now() + 1800000).toISOString(),
          consentToken: "a".repeat(64),
        },
      });
    } else {
      expect(input).toEqual({
        action: "approve-refund",
        approvalId,
        confirmed: true,
        eligibilityConfirmed: true,
      });
      confirmations++;
      await route.fulfill({
        json: {
          operationId: randomUUID(),
          status: "PROVIDER_PENDING",
          refundId: "MOCK-PENDING-REFUND",
        },
      });
    }
  });
  await page.goto(`/transactions/${paymentId}`);
  await expect(
    page.getByRole("heading", { name: "MOCK browser test product" }),
  ).toBeVisible();
  await page.getByLabel("Refund amount (USD)").fill("20.00");
  await page
    .getByLabel("Refund reason")
    .fill("Agreed partial Sandbox resolution");
  await page.getByRole("button", { name: "Review exact refund" }).click();
  await expect(
    page.getByRole("heading", { name: "Review $20.00 USD" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm refund…" }),
  ).toBeDisabled();
  await expect(page.getByLabel("Private buyer acceptance link")).toHaveValue(
    /refund-consent#token=/,
  );
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirm refund…" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(confirmations).toBe(0);
  await page.getByRole("button", { name: "Send refund to PayPal" }).click();
  await expect(page.getByRole("status")).toContainText("PROVIDER PENDING");
  expect(confirmations).toBe(1);
  expect(
    await page
      .locator("body")
      .evaluate((body) => body.scrollWidth <= body.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: `artifacts/refund-${test.info().project.name}.png`,
    fullPage: true,
  });
});
