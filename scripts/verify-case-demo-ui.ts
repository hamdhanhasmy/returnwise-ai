import { chromium, expect } from "@playwright/test";
import { scriptDatabase } from "./database";
import { demoIds } from "../prisma/fixtures";
import { issueLoginToken } from "../src/server/services/auth";
import { ReturnService } from "../src/server/services/returns";
import { assessmentSchema } from "../src/lib/ai/contracts";
import { mkdir } from "node:fs/promises";
import { z } from "zod";

// Explicit local UI smoke: existing completed records only, no provider requests.
const paymentId = z
  .uuid()
  .parse(process.argv.find((a) => a.startsWith("--payment="))?.slice(10));
const db = scriptDatabase(),
  base = "http://127.0.0.1:3000";
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  const payment = await db.payment.findFirstOrThrow({
    where: {
      id: paymentId,
      merchantId: demoIds.merchant,
      status: "REFUNDED",
      order: { product: { sku: "PHASE5-BOWL-USD5" } },
    },
  });
  const c = await db.returnCase.findFirstOrThrow({
    where: {
      orderId: payment.orderId,
      merchantId: demoIds.merchant,
      status: "CLOSED",
    },
    include: {
      analyses: { where: { status: "SUCCEEDED" } },
      refundApproval: {
        include: { operation: { include: { providerRefund: true } } },
      },
    },
  });
  if (
    c.refundApproval?.operation?.providerRefund?.providerStatus !==
      "COMPLETED" ||
    !c.analyses[0]
  )
    throw Error("Incomplete provider proof");
  const assessment = assessmentSchema.parse(c.analyses[0].result);
  const user = await db.user.findFirstOrThrow({
    where: { id: demoIds.admin, role: "ADMIN", disabledAt: null },
    include: { merchant: true },
  });
  const principal = {
    userId: user.id,
    merchantId: user.merchantId,
    email: user.email,
    role: user.role,
    merchantName: user.merchant.name,
  };
  // Replacement private tracking access is not logged or written to artifacts.
  const access = await new ReturnService(db).issueAccess(principal, c.orderId);
  browser = await chromium.launch({ channel: "chromium" });
  await mkdir("artifacts", { recursive: true });
  for (const [name, viewport] of [
    { name: "desktop", viewport: { width: 1280, height: 900 } },
    { name: "mobile", viewport: { width: 390, height: 844 } },
  ].map((x) => [x.name, x.viewport] as const)) {
    const customer = await browser.newContext({ viewport });
    const shopper = await customer.newPage();
    await shopper.goto(`${base}/returns#token=${access.token}`);
    await shopper.getByRole("button", { name: "Open my return" }).click();
    await expect(
      shopper.getByText("Verified PayPal status: COMPLETED"),
    ).toBeVisible();
    await expect(shopper.locator("body")).toContainText("$5.00");
    if (
      !(await shopper
        .locator("body")
        .evaluate((b) => b.scrollWidth <= b.clientWidth))
    )
      throw Error("Customer overflow");
    await shopper.screenshot({
      path: `artifacts/phase5-completed-customer-${name}.png`,
      fullPage: true,
    });
    const merchant = await browser.newContext({ viewport });
    const page = await merchant.newPage();
    await merchant.route("**/api/payments**", (r) => r.abort());
    await merchant.route("**/api/returns/cases/*/refund", (r) => r.abort());
    const login = await issueLoginToken(db, user.merchantId, user.email);
    await page.goto(`${base}/login#token=${login}`);
    await expect(page.getByLabel("One-time access token")).toHaveValue(
      /^[a-f0-9]{64}$/,
    );
    await page.getByRole("button", { name: "Open your workspace" }).click();
    await page.waitForURL("**/dashboard");
    await page.goto(`${base}/cases/${c.id}`);
    await expect(
      page.getByText("Verified provider status: COMPLETED"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Open evidence workspace" }).click();
    await expect(
      page.getByText(assessment.caseSummary, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Analyze current evidence" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Record human evidence review" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Review final PayPal refund" }),
    ).toHaveCount(0);
    if (
      !(await page
        .locator("body")
        .evaluate((b) => b.scrollWidth <= b.clientWidth))
    )
      throw Error("Merchant overflow");
    await page.screenshot({
      path: `artifacts/phase5-completed-merchant-${name}.png`,
      fullPage: true,
    });
    await page.request.post(`${base}/api/auth/logout`, {
      headers: { origin: base },
    });
    await customer.close();
    await merchant.close();
  }
  console.log(
    JSON.stringify({
      caseId: c.id,
      completedCustomerAndMerchantUI: ["desktop", "mobile"],
      genuineStoredAssessmentDisplayed: true,
      providerRequestsSent: 0,
    }),
  );
} catch {
  console.error(
    "Completed demo UI verification failed. No provider operation was sent by this script.",
  );
  process.exitCode = 1;
} finally {
  await browser?.close();
  await db.$disconnect();
}
