import { chromium, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { z } from "zod";
import { scriptDatabase } from "./database";
import { demoIds } from "../prisma/fixtures";
import { ReturnService } from "../src/server/services/returns";
import { issueLoginToken } from "../src/server/services/auth";
import { assessmentSchema } from "../src/lib/ai/contracts";

// Explicit synthetic-evidence smoke helper, never used by tests or CI.
// Stops before human review, policy proposals, approval or any payment action.
const paymentId = z
  .uuid()
  .parse(process.argv.find((a) => a.startsWith("--payment="))?.slice(10));
if (!process.argv.includes("--live-synthetic-analysis"))
  throw Error(
    "Explicit --live-synthetic-analysis required; this may spend the configured AI budget.",
  );
const db = scriptDatabase(),
  base = "http://127.0.0.1:3000";
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined,
  merchant: Page | undefined;
let stage = "preflight";
try {
  const payment = await db.payment.findFirstOrThrow({
    where: { id: paymentId, merchantId: demoIds.merchant },
    include: { order: { include: { product: true } } },
  });
  if (
    payment.order.product?.sku !== "PHASE5-BOWL-USD5" ||
    payment.captureAmountMinor !== 500n ||
    payment.currency !== "USD" ||
    payment.status !== "CAPTURED" ||
    payment.ledgerState !== "RECONCILED" ||
    !payment.paypalCaptureId ||
    !payment.captureCompletedAt
  )
    throw Error("Verified new $5 demonstration capture required");
  const user = await db.user.findFirstOrThrow({
    where: {
      id: demoIds.admin,
      merchantId: demoIds.merchant,
      disabledAt: null,
      role: "ADMIN",
    },
    include: { merchant: true },
  });
  const p = {
    userId: user.id,
    merchantId: user.merchantId,
    email: user.email,
    role: user.role,
    merchantName: user.merchant.name,
  };
  const previous = await db.returnCase.findFirst({
    where: { orderId: payment.orderId, merchantId: p.merchantId },
  });
  if (previous) {
    console.log(
      JSON.stringify({
        caseId: previous.id,
        status: previous.status,
        action:
          "Existing case preserved. Continue in its UI; no repeated submission or analysis.",
      }),
    );
  } else {
    if (!(await fetch(`${base}/api/health`)).ok)
      throw Error("App health unavailable");
    browser = await chromium.launch({ channel: "chromium" });
    const customerContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const shopper = await customerContext.newPage();
    // Defense in depth: this helper has no payment endpoint capability.
    await customerContext.route("**/api/payments**", (r) => r.abort());
    const access = await new ReturnService(db).issueAccess(p, payment.orderId);
    stage = "customer submission";
    await shopper.goto(`${base}/returns#token=${access.token}`);
    await shopper.getByRole("button", { name: "Open my return" }).click();
    await shopper.getByLabel("Return reason").selectOption("DAMAGED");
    await shopper.getByLabel("Product condition").selectOption("DAMAGED");
    await shopper
      .getByLabel("Tell us what happened")
      .fill(
        "Synthetic demonstration claim: the fictional ceramic bowl arrived broken into separated pieces with a chipped rim. The attached generated image illustrates the claim; it is not real customer evidence.",
      );
    await shopper
      .getByRole("button", { name: "Submit return request" })
      .click();
    await expect(shopper.getByRole("status")).toContainText(
      "Return request submitted",
      { timeout: 15000 },
    );
    const c = await db.returnCase.findFirstOrThrow({
      where: { orderId: payment.orderId, merchantId: p.merchantId },
    });
    console.log(
      JSON.stringify({ caseId: c.id, submittedThroughCustomerUI: true }),
    );
    stage = "private upload and explicit synthetic-data consent";
    await shopper
      .getByRole("button", { name: "Open evidence workspace" })
      .click();
    await shopper
      .getByLabel("Product photo", { exact: true })
      .setInputFiles("assets/demo/synthetic-broken-bowl.png");
    await shopper
      .getByRole("checkbox", { name: /authorize private storage/ })
      .check();
    await shopper.getByRole("button", { name: "Upload private image" }).click();
    await expect(
      shopper.getByRole("button", { name: "View image 1", exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await shopper.getByRole("checkbox", { name: /consent to sending/ }).check();
    await shopper
      .getByRole("button", { name: "Save AI consent choice" })
      .click();
    await expect(
      shopper.getByText(/Current permission: Granted/),
    ).toBeVisible();
    await mkdir("artifacts", { recursive: true });
    await shopper.screenshot({
      path: "artifacts/phase5-genuine-customer.png",
      fullPage: true,
      mask: [shopper.getByLabel("Save your private case-access link")],
    });
    const merchantContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    await merchantContext.route("**/api/payments**", (r) => r.abort());
    await merchantContext.route("**/api/returns/cases/*/refund", (r) =>
      r.abort(),
    );
    merchant = await merchantContext.newPage();
    const login = await issueLoginToken(db, p.merchantId, p.email);
    await merchant.goto(`${base}/login#token=${login}`);
    await expect(merchant.getByLabel("One-time access token")).toHaveValue(
      /^[a-f0-9]{64}$/,
    );
    await merchant.getByRole("button", { name: "Open your workspace" }).click();
    await merchant.waitForURL("**/dashboard");
    await merchant.goto(`${base}/cases/${c.id}`);
    await merchant
      .getByRole("button", { name: "Open evidence workspace" })
      .click();
    stage = "one explicit genuine DeepSeek analysis";
    await merchant
      .getByRole("button", { name: "Analyze current evidence" })
      .click();
    await expect
      .poll(
        async () =>
          (
            await db.evidenceAnalysis.findFirst({
              where: { caseId: c.id },
              orderBy: { createdAt: "desc" },
            })
          )?.status,
        { timeout: 90000, intervals: [1000, 2000] },
      )
      .toBe("SUCCEEDED");
    const analysis = await db.evidenceAnalysis.findFirstOrThrow({
      where: { caseId: c.id, status: "SUCCEEDED" },
      include: { attempts: true },
    });
    const assessment = assessmentSchema.parse(analysis.result);
    await expect(
      merchant.getByText(assessment.caseSummary, { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await merchant
      .getByRole("button", { name: "View image 1", exact: true })
      .click();
    await expect(
      merchant.getByAltText("Customer-provided product evidence; unverified"),
    ).toBeVisible();
    await merchant.screenshot({
      path: "artifacts/phase5-genuine-assessment.png",
      fullPage: true,
    });
    console.log(
      JSON.stringify(
        {
          caseId: c.id,
          genuineAnalysis: analysis.status,
          model: analysis.model,
          assessment,
          attempts: analysis.attempts.map((a) => ({
            status: a.status,
            promptTokens: a.promptTokens,
            cachedTokens: a.cachedTokens,
            completionTokens: a.completionTokens,
            estimatedNano: a.estimatedNano?.toString(),
            latencyMs: a.latencyMs,
          })),
          storedResultDisplayed: true,
          humanReviewRequired: true,
          paymentRequestsSent: 0,
        },
        null,
        2,
      ),
    );
  }
} catch {
  console.error(
    `Demo preparation stopped during ${stage}. Inspect persisted case/analysis before retrying; no payment operation was sent by this helper.`,
  );
  process.exitCode = 1;
} finally {
  await merchant?.request
    .post(`${base}/api/auth/logout`, { headers: { origin: base } })
    .catch(() => {});
  await browser?.close();
  await db.$disconnect();
}
