import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../../scripts/test-database";
import { issueLoginToken } from "../../src/server/services/auth";
import { ReturnService } from "../../src/server/services/returns";
import { conservativePolicy } from "../../src/lib/returns/contracts";

for (const partial of [false, true])
  test(`customer submission and ${partial ? "accepted partial" : "full returnless"} merchant resolution`, async ({
    page,
    browser,
  }) => {
    const db = await testDatabase();
    const merchant = await db.merchant.create({
      data: {
        name: "Synthetic browser returns",
        sandboxAccountAlias: "NO PROVIDER",
      },
    });
    const user = await db.user.create({
      data: {
        merchantId: merchant.id,
        email: `${randomUUID()}@example.invalid`,
        role: "ADMIN",
      },
    });
    const p = {
      merchantId: merchant.id,
      userId: user.id,
      email: user.email,
      role: user.role,
      merchantName: merchant.name,
    };
    let customer: Awaited<ReturnType<typeof browser.newContext>> | undefined;
    try {
      await new ReturnService(db).savePolicy(p, {
        ...conservativePolicy,
        allowReturnless: true,
        allowPartial: true,
        partialOfferMinor: "2000",
        maxPartialMinor: "3000",
        maxPartialBps: 5000,
        shippingMinor: "1800",
        handlingMinor: "700",
        recoveryMethod: "PRODUCT_ESTIMATE",
      });
      const product = await db.product.create({
        data: {
          merchantId: p.merchantId,
          name: "Synthetic return browser bowl",
          sku: randomUUID(),
          category: "Home",
          currency: "USD",
          saleAmountMinor: 8000n,
          recoveryValueMinor: 1200n,
        },
      });
      const order = await db.order.create({
        data: {
          merchantId: p.merchantId,
          productId: product.id,
          publicOrderNumber: randomUUID(),
          productSnapshot: { name: product.name, category: "Home" },
          customerRef: "SECRET CUSTOMER REF",
          currency: "USD",
          totalMinor: 8000n,
          origin: "SIMULATED",
          timingProvenance: "SIMULATED",
          purchasedAt: new Date(Date.now() - 86400000),
        },
      });
      const login = await issueLoginToken(db, p.merchantId, user.email);
      await page.goto(`/login#token=${login}`);
      await page.getByRole("button", { name: "Open your workspace" }).click();
      await expect(page).toHaveURL(/dashboard$/);
      await page.goto("/settings");
      await page.getByRole("button", { name: /Save.*policy/i }).click();
      await expect(page.getByRole("status")).toContainText("saved");
      await page.goto("/portal");
      await page.getByRole("button", { name: "Create private link" }).click();
      const link = await page.getByLabel("Private customer link").inputValue();
      expect(link).toContain("#token=");
      customer = await browser.newContext({ viewport: page.viewportSize()! });
      const shopper = await customer.newPage();
      await shopper.goto(link);
      await shopper.getByRole("button", { name: "Open my return" }).click();
      await expect(
        shopper.getByRole("heading", { name: product.name }),
      ).toBeVisible();
      await expect(shopper.locator("body")).not.toContainText(
        "SECRET CUSTOMER REF",
      );
      await shopper.getByLabel("Return reason").selectOption("DAMAGED");
      await shopper.getByLabel("Product condition").selectOption("DAMAGED");
      await shopper
        .getByLabel("Tell us what happened")
        .fill("The bowl arrived damaged with a clearly chipped rim.");
      await shopper
        .getByRole("button", { name: "Submit return request" })
        .click();
      await expect(shopper.getByRole("status")).toContainText(
        "Return request submitted",
      );
      expect(
        await shopper
          .locator("body")
          .evaluate((b) => b.scrollWidth <= b.clientWidth),
      ).toBe(true);
      await shopper.screenshot({
        mask: [shopper.getByLabel("Save your private case-access link")],
        path: `artifacts/return-portal-${test.info().project.name}-${partial}.png`,
        fullPage: true,
      });
      const c = await db.returnCase.findFirstOrThrow({
        where: { orderId: order.id },
      });
      expect(c.recommendation).toBe("FULL_REFUND_KEEP");
      await page.goto(`/cases/${c.id}`);
      await expect(page.getByText("$93.00", { exact: true })).toBeVisible();
      await expect(
        page.getByText("$80.00", { exact: true }).first(),
      ).toBeVisible();
      await page
        .getByLabel("Review note / customer-visible offer terms")
        .fill(
          "Reviewed entitlement: keep the item and receive the exact displayed refund. No return needed.",
        );
      await page.getByRole("checkbox").check();
      await page
        .getByLabel("Eligible resolution")
        .selectOption(partial ? "PARTIAL_REFUND_KEEP" : "FULL_REFUND_KEEP");
      await page
        .getByRole("button", { name: "Propose selected resolution" })
        .click();
      if (partial) {
        await expect(
          page.getByText("Current resolution · proposed"),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Review merchant approval" }),
        ).toHaveCount(0);
        await shopper
          .getByRole("button", { name: "Refresh case status" })
          .click();
        await expect(
          shopper.getByText("$20.00 USD", { exact: true }),
        ).toBeVisible();
        await shopper
          .getByRole("button", { name: "Accept exact offer" })
          .click();
        await expect(shopper.getByRole("status")).toContainText(
          "accepted the exact offer",
        );
        await page.reload();
      }
      await expect(
        page.getByRole("button", { name: "Review merchant approval" }),
      ).toBeVisible();
      await page
        .getByLabel("Review note / customer-visible offer terms")
        .fill("Final review confirms the selected remedy and customer rights.");
      await page.getByRole("checkbox").check();
      await page
        .getByRole("button", { name: "Review merchant approval" })
        .click();
      await page
        .getByRole("button", { name: "Record merchant approval" })
        .click();
      await expect(
        page.getByText("Current resolution · approved"),
      ).toBeVisible();
      expect(
        await db.refundOperation.count({ where: { merchantId: p.merchantId } }),
      ).toBe(0);
      expect(
        await db.payment.count({ where: { merchantId: p.merchantId } }),
      ).toBe(0);
      expect(
        await page
          .locator("body")
          .evaluate((b) => b.scrollWidth <= b.clientWidth),
      ).toBe(true);
      await page.screenshot({
        path: `artifacts/return-case-${test.info().project.name}-${partial}.png`,
        fullPage: true,
      });
    } finally {
      await customer?.close();
      await db.$disconnect();
    }
  });
test("return entry points reject missing authorization, invalid capability and cross-origin requests", async ({
  request,
  page,
}) => {
  const origin = { origin: "http://127.0.0.1:3100" };
  expect(
    (
      await request.post("/api/returns/access", {
        headers: origin,
        data: { action: "issue", orderId: randomUUID() },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post("/api/returns/customer", {
        headers: { origin: "https://evil.example" },
        data: { action: "view", token: "a".repeat(64) },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/returns/customer", {
        headers: origin,
        data: { action: "view", token: "a".repeat(64) },
      })
    ).status(),
  ).toBe(404);
  await page.goto("/returns#token=invalid");
  await page.getByRole("button", { name: "Open my return" }).click();
  await expect(page.getByRole("status")).toContainText("invalid or expired");
  await expect(page).toHaveURL(/\/returns$/);
});
