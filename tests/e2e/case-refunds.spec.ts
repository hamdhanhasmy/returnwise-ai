import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../../scripts/test-database";
import { syntheticCase } from "../fixtures/return-case";
import { syntheticImage, mockAssessment } from "../fixtures/evidence";
import { EvidenceService } from "../../src/server/services/evidence";
import { CaseRefundService } from "../../src/server/services/case-refunds";
import { PaymentService } from "../../src/server/services/payments";
import { issueLoginToken } from "../../src/server/services/auth";
import { aiConfig } from "../../src/lib/ai/config";
import type {
  PayPalGateway,
  PayPalCapture,
  PayPalRefund,
} from "../../src/lib/payments/contracts";
test("mocked customer evidence to exact merchant confirmation and verified case refund", async ({
  page,
  browser,
}) => {
  const db = await testDatabase(),
    f = await syntheticCase(db),
    customer = await browser.newContext({ viewport: page.viewportSize()! }),
    shopper = await customer.newPage();
  try {
    const payee = `MOCK-${randomUUID()}`,
      orderId = `MOCK-${randomUUID()}`,
      captureId = `MOCK-${randomUUID()}`;
    await db.merchant.update({
      where: { id: f.p.merchantId },
      data: { paymentsEnabled: true, paypalMerchantId: payee },
    });
    await db.order.update({
      where: { id: f.order.id },
      data: { origin: "PAYPAL_SANDBOX", timingProvenance: "UTC_RECORDED" },
    });
    const payment = await db.payment.create({
      data: {
        merchantId: f.p.merchantId,
        orderId: f.order.id,
        checkoutKey: randomUUID(),
        expectedPayeeId: payee,
        expectedAmountMinor: 8000n,
        currency: "USD",
        paypalOrderId: orderId,
        paypalCaptureId: captureId,
        status: "CAPTURED",
        captureAmountMinor: 8000n,
        captureCompletedAt: new Date(),
        captureProviderStatus: "COMPLETED",
        orderProviderStatus: "COMPLETED",
        ledgerState: "RECONCILED",
      },
    });
    const capture: PayPalCapture = {
      id: captureId,
      status: "COMPLETED",
      amount: { currency_code: "USD", value: "80.00" },
      payee: { merchant_id: payee },
      supplementary_data: { related_ids: { order_id: orderId } },
    };
    let refund: PayPalRefund | undefined,
      calls = 0;
    const never = async () => {
      throw Error("Unexpected mocked provider operation");
    };
    const provider: PayPalGateway = {
      createOrder: never,
      captureOrder: never,
      verifyWebhook: async () => false,
      getCapture: async () => structuredClone(capture),
      getOrder: async () => ({
        id: orderId,
        intent: "CAPTURE",
        status: "COMPLETED",
        purchase_units: [
          {
            reference_id: f.order.id,
            custom_id: payment.id,
            amount: capture.amount,
            payee: { merchant_id: payee },
            payments: { captures: [capture] },
          },
        ],
      }),
      refundCapture: async (_id, payload) => {
        calls++;
        refund = {
          id: `MOCK-${randomUUID()}`,
          status: "COMPLETED",
          amount: { currency_code: "USD", value: "80.00" },
          invoice_id: String(payload.invoice_id),
          links: [
            {
              rel: "up",
              href: `https://api-m.sandbox.paypal.com/v2/payments/captures/${captureId}`,
              method: "GET",
            },
          ],
        };
        capture.status = "REFUNDED";
        return refund;
      },
      getRefund: async () => refund!,
    };
    const payments = new PaymentService(db, provider, payee),
      service = new CaseRefundService(payments);
    await shopper.goto(`http://127.0.0.1:3100/returns#token=${f.token}`);
    await shopper.getByRole("button", { name: "Open my return" }).click();
    await shopper
      .getByRole("button", { name: "Open evidence workspace" })
      .click();
    await shopper.getByLabel("Product photo", { exact: true }).setInputFiles({
      name: "synthetic.png",
      mimeType: "image/png",
      buffer: await syntheticImage(),
    });
    await shopper
      .getByRole("checkbox", { name: /authorize private storage/ })
      .check();
    await shopper.getByRole("button", { name: "Upload private image" }).click();
    await expect(
      shopper.getByRole("button", { name: "View image 1", exact: true }),
    ).toBeVisible();
    await shopper.getByRole("checkbox", { name: /consent to sending/ }).check();
    await shopper
      .getByRole("button", { name: "Save AI consent choice" })
      .click();
    await expect(
      shopper.getByText(/Current permission: Granted/),
    ).toBeVisible();
    await new EvidenceService(
      db,
      aiConfig({
        AI_ENABLED: "true",
        DEEPSEEK_API_KEY: "mock-browser-analysis",
      }),
      {
        analyze: async () => ({
          assessment: mockAssessment,
          latencyMs: 1,
          usage: { promptTokens: 100, cachedTokens: 0, completionTokens: 80 },
        }),
      },
      randomUUID(),
    ).analyze(f.p, f.caseId);
    const login = await issueLoginToken(db, f.p.merchantId, f.p.email);
    await page.goto(`/login#token=${login}`);
    await page.getByRole("button", { name: "Open your workspace" }).click();
    await page.waitForURL("**/dashboard");
    await page.goto(`/cases/${f.caseId}`);
    await page.getByRole("button", { name: "Open evidence workspace" }).click();
    await page
      .getByLabel("Human evidence review note")
      .fill(
        "Independently reviewed synthetic damage, limitations and customer entitlement.",
      );
    await page
      .getByRole("button", { name: "Record human evidence review" })
      .click();
    await expect(
      page.getByText("Review recorded for current evidence."),
    ).toBeVisible();
    // Read the updated case version after the independent evidence action.
    await page.reload();
    await page
      .getByRole("button", { name: "Evaluate policy and costs" })
      .click();
    await expect(page.getByLabel("Eligible resolution")).toBeVisible();
    await page
      .getByLabel("Review note / customer-visible offer terms")
      .fill("Full refund without return for this exact damaged item.");
    await page
      .getByRole("checkbox", { name: /I reviewed eligibility/ })
      .check();
    await page
      .getByLabel("Eligible resolution")
      .selectOption("FULL_REFUND_KEEP");
    await page
      .getByRole("button", { name: "Propose selected resolution" })
      .click();
    await expect(
      page.getByRole("button", { name: "Review merchant approval" }),
    ).toBeVisible();
    await page
      .getByLabel("Review note / customer-visible offer terms")
      .fill(
        "Reviewed the exact full refund proposal and customer entitlement.",
      );
    await page
      .getByRole("checkbox", { name: /I reviewed eligibility/ })
      .check();
    await page
      .getByRole("button", { name: "Review merchant approval" })
      .click();
    await page
      .getByRole("button", { name: "Record merchant approval" })
      .click();
    await expect(
      page.getByRole("button", { name: "Review final PayPal refund" }),
    ).toBeDisabled();
    const proposal = await db.returnProposal.findFirstOrThrow({
      where: { caseId: f.caseId, status: "APPROVED" },
    });
    const invalid = await page.request.post(
      `/api/returns/cases/${f.caseId}/refund`,
      {
        headers: { origin: "http://127.0.0.1:3100" },
        data: {
          action: "execute",
          version: 0,
          proposalId: proposal.id,
          termsHash: proposal.termsHash,
          confirmed: true,
          eligibilityConfirmed: true,
          amount: "999.00",
        },
      },
    );
    expect(invalid.status()).toBe(400);
    await page.route(
      `**/api/returns/cases/${f.caseId}/refund`,
      async (route) => {
        const body = route.request().postDataJSON();
        expect(body).not.toHaveProperty("amount");
        const result = await service.execute(f.p, f.caseId, body);
        await route.fulfill({
          body: JSON.stringify(result, (_, v) =>
            typeof v === "bigint" ? v.toString() : v,
          ),
          contentType: "application/json",
        });
      },
    );
    await page
      .getByRole("checkbox", { name: /I authorize this exact Sandbox refund/ })
      .check();
    await page
      .getByRole("button", { name: "Review final PayPal refund" })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Confirm exact PayPal case refund" }),
    ).toContainText("$80.00");
    expect(calls).toBe(0);
    await page
      .getByRole("button", { name: "Send authorized refund to PayPal" })
      .click();
    await expect(
      page.getByText("Verified provider status: COMPLETED"),
    ).toBeVisible();
    expect(calls).toBe(1);
    await page.getByRole("button", { name: "Open evidence workspace" }).click();
    await expect(
      page.getByRole("button", { name: "Analyze current evidence" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Record human evidence review" }),
    ).toHaveCount(0);
    await shopper.getByRole("button", { name: "Refresh case status" }).click();
    await expect(
      shopper.getByText("Verified PayPal status: COMPLETED"),
    ).toBeVisible();
    expect(
      await page
        .locator("body")
        .evaluate((b) => b.scrollWidth <= b.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: `artifacts/case-refund-${test.info().project.name}.png`,
      fullPage: true,
    });
    await shopper.screenshot({
      path: `artifacts/case-refund-customer-${test.info().project.name}.png`,
      fullPage: true,
    });
  } finally {
    await customer.close();
    await db.$disconnect();
  }
});
test("case refund endpoint rejects unauthenticated execution", async ({
  request,
}) => {
  expect(
    (
      await request.post(`/api/returns/cases/${randomUUID()}/refund`, {
        headers: { origin: "http://127.0.0.1:3100" },
        data: { action: "execute" },
      })
    ).status(),
  ).toBe(401);
});
