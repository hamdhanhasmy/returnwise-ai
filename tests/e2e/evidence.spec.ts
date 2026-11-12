import { test, expect } from "@playwright/test";
import { testDatabase } from "../../scripts/test-database";
import { syntheticCase } from "../fixtures/return-case";
import { syntheticImage, mockAssessment } from "../fixtures/evidence";
import { issueLoginToken } from "../../src/server/services/auth";
import { EvidenceService } from "../../src/server/services/evidence";
import { aiConfig } from "../../src/lib/ai/config";
import { randomUUID } from "node:crypto";
test("private customer upload and consent through mocked AI assessment and human review", async ({
  page,
  browser,
}) => {
  const db = await testDatabase(),
    f = await syntheticCase(db),
    customer = await browser.newContext({ viewport: page.viewportSize()! }),
    shopper = await customer.newPage();
  try {
    await shopper.goto(`http://127.0.0.1:3100/returns#token=${f.token}`);
    await shopper.getByRole("button", { name: "Open my return" }).click();
    await shopper
      .getByRole("button", { name: "Open evidence workspace" })
      .click();
    await shopper
      .getByLabel("Product photo", { exact: true })
      .setInputFiles({
        name: "synthetic.png",
        mimeType: "image/png",
        buffer: await syntheticImage(),
      });
    await shopper
      .getByRole("checkbox", { name: /authorize private storage/ })
      .check();
    await shopper.getByRole("button", { name: "Upload private image" }).click();
    await expect(
      shopper.getByRole("button", { name: "View image 1" }),
    ).toBeVisible();
    await shopper.getByRole("checkbox", { name: /consent to sending/ }).check();
    await shopper
      .getByRole("button", { name: "Save AI consent choice" })
      .click();
    await expect(
      shopper.getByText(/Current permission: Granted/),
    ).toBeVisible();
    await shopper.getByRole("button", { name: "View image 1" }).click();
    await expect(
      shopper.getByAltText("Customer-provided product evidence; unverified"),
    ).toBeVisible();
    expect(
      await shopper
        .locator("body")
        .evaluate((b) => b.scrollWidth <= b.clientWidth),
    ).toBe(true);
    await shopper.screenshot({
      path: `artifacts/evidence-customer-${test.info().project.name}.png`,
      fullPage: true,
    });
    const mock = new EvidenceService(
      db,
      aiConfig({ AI_ENABLED: "true", DEEPSEEK_API_KEY: "mock-e2e-key" }),
      {
        analyze: async () => ({
          assessment: mockAssessment,
          usage: { promptTokens: 200, cachedTokens: 0, completionTokens: 100 },
          model: "AUTOMATED-MOCK",
          latencyMs: 2,
        }),
      },
      `e2e-${randomUUID()}`,
    );
    await mock.analyze(f.p, f.caseId);
    const login = await issueLoginToken(db, f.p.merchantId, f.p.email);
    await page.goto(`/login#token=${login}`);
    await page.getByRole("button", { name: "Open your workspace" }).click();
    await expect(page).toHaveURL(/dashboard$/);
    await page.goto(`/cases/${f.caseId}`);
    await page.getByRole("button", { name: "Open evidence workspace" }).click();
    await expect(
      page.getByText("Two bowl pieces are visibly separated."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Analyze current evidence" }),
    ).toBeDisabled();
    await page
      .getByLabel("Human evidence review note")
      .fill(
        "Reviewed the synthetic image independently; this is a mocked AI browser test.",
      );
    await page
      .getByRole("button", { name: "Record human evidence review" })
      .click();
    await expect(
      page.getByText("Review recorded for current evidence."),
    ).toBeVisible();
    await page.getByRole("button", { name: "View image 1" }).click();
    await expect(
      page.getByAltText("Customer-provided product evidence; unverified"),
    ).toBeVisible();
    expect(
      await page
        .locator("body")
        .evaluate((b) => b.scrollWidth <= b.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: `artifacts/evidence-merchant-${test.info().project.name}.png`,
      fullPage: true,
    });
    expect(
      await db.payment.count({ where: { merchantId: f.p.merchantId } }),
    ).toBe(0);
    await shopper.getByRole("button", { name: "Remove image 1" }).click();
    await expect(shopper.getByText(/No current images/)).toBeVisible();
  } finally {
    await customer.close();
    await db.$disconnect();
  }
});
test("evidence endpoints reject unauthorized and cross-origin access", async ({
  request,
}) => {
  const origin = { origin: "http://127.0.0.1:3100" };
  expect(
    (
      await request.post("/api/evidence/customer", {
        headers: origin,
        data: { action: "view" },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await request.post("/api/evidence/customer", {
        headers: { origin: "https://evil.example" },
        data: { action: "view" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post(`/api/evidence/merchant/${randomUUID()}`, {
        headers: origin,
        data: { action: "analyze" },
      })
    ).status(),
  ).toBe(401);
});
