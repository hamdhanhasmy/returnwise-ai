import { test, expect } from "@playwright/test";
import { testDatabase } from "../../scripts/test-database";
import { syntheticCase } from "../fixtures/return-case";
import { issueLoginToken } from "../../src/server/services/auth";
import { AnalyticsService } from "../../src/server/services/analytics";
import { AnalyticsAgentService } from "../../src/server/services/analytics-agent";
import { aiConfig } from "../../src/lib/ai/config";
import { randomUUID } from "node:crypto";
test("AG Studio renders, filters, customizes and opens tenant-scoped case details without provider calls", async ({
  page,
}) => {
  test.setTimeout(90000);
  const db = await testDatabase(),
    f = await syntheticCase(db);
  const financialBefore = await db.payment.count(),
    refundsBefore = await db.refundOperation.count(),
    aiBefore = await db.analysisAttempt.count();
  const providerRequests: string[] = [];
  page.on("request", (r) => {
    if (/\/api\/(payments|paypal|evidence)\b/.test(new URL(r.url()).pathname))
      providerRequests.push(r.method());
  });
  try {
    const login = await issueLoginToken(db, f.p.merchantId, f.p.email);
    await page.goto(`/login#token=${login}`);
    await expect(page.getByLabel("One-time access token")).toHaveValue(
      /^[a-f0-9]{64}$/,
    );
    await page.getByRole("button", { name: "Open your workspace" }).click();
    await page.waitForURL("**/dashboard");
    await page.goto("/analytics");
    await expect(
      page.getByRole("heading", { name: "Every return tells a bigger story." }),
    ).toBeVisible();
    await expect(page.getByTestId("modeled-avoidance")).toHaveText("$13.00");
    await expect(
      page.getByTestId("ag-studio-canvas").locator("canvas").first(),
    ).toBeVisible({ timeout: 30000 });
    await expect(
      page.getByRole("button", { name: "Save layout", exact: true }),
    ).toBeEnabled({ timeout: 15000 });
    if (test.info().project.name === "mobile") {
      await expect(
        page.getByRole("button", { name: "Customize on desktop" }),
      ).toBeDisabled();
    } else {
      await page.getByRole("button", { name: "Customize view" }).click();
      await expect(
        page.getByRole("button", { name: "Finish customizing" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Finish customizing" }).click();
    }
    await page
      .getByRole("button", { name: "Save layout", exact: true })
      .click();
    await expect(
      page.getByText(
        "Layout saved for this merchant in this browser session.",
        { exact: true },
      ),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Economics lab" }).click();
    await expect(
      page.getByTestId("ag-studio-canvas").locator("canvas").first(),
    ).toBeVisible();
    await page.screenshot({
      path: `artifacts/analytics-economics-${test.info().project.name}.png`,
      fullPage: true,
    });
    await page.getByLabel("Record source").selectOption("sandbox");
    await expect(
      page.getByText("No return records match these filters.", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(page.getByTestId("modeled-avoidance")).toHaveText("$0.00");
    await page.getByLabel("Record source").selectOption("synthetic");
    await expect(page.getByTestId("modeled-avoidance")).toHaveText("$13.00");
    await page.getByRole("tab", { name: "Case explorer" }).click();
    await expect(
      page.getByRole("columnheader", { name: "Product", exact: true }),
    ).toBeVisible({ timeout: 15000 });
    expect(
      await page
        .locator("body")
        .evaluate((b) => b.scrollWidth <= b.clientWidth),
    ).toBe(true);
    const invalid = await page.request.get(
      `/api/analytics?merchantId=${f.p.merchantId}`,
    );
    expect(invalid.status()).toBe(400);
    const response = await page.request.get("/api/analytics");
    expect(response.headers()["cache-control"]).toBe("no-store");
    const text = await response.text();
    expect(text).not.toContain(f.token);
    expect(text).not.toContain(f.p.email);
    const headers = { origin: "http://127.0.0.1:3100" };
    const question = {
      question: "Show common return reasons",
      consent: true,
      filter: { source: "all", period: "all", category: "" },
    };
    expect(
      (
        await page.request.post("/api/analytics/ask", {
          headers,
          data: question,
        })
      ).status(),
    ).toBe(503);
    expect(
      (
        await page.request.post("/api/analytics/ask", {
          headers,
          data: { ...question, consent: false },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await page.request.post("/api/analytics/ask", {
          headers: { ...headers, "X-ReturnWise-Workspace": "wrong" },
          data: question,
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await page.request.post("/api/analytics/ask", {
          headers: { origin: "https://wrong.example" },
          data: question,
        })
      ).status(),
    ).toBe(403);
    await page.screenshot({
      path: `artifacts/analytics-cases-${test.info().project.name}.png`,
      fullPage: true,
    });
    await page
      .getByRole("link", { name: new RegExp(f.caseId.slice(0, 8), "i") })
      .click();
    await expect(page).toHaveURL(new RegExp(`/cases/${f.caseId}$`));
    expect(providerRequests).toEqual([]);
    expect(await db.payment.count()).toBe(financialBefore);
    expect(await db.refundOperation.count()).toBe(refundsBefore);
    expect(await db.analysisAttempt.count()).toBe(aiBefore);
  } finally {
    await db.$disconnect();
  }
});
test("analytics data endpoint rejects unauthenticated and mutation requests", async ({
  request,
}) => {
  expect((await request.get("/api/analytics")).status()).toBe(401);
  expect(
    (
      await request.post("/api/analytics/ask", {
        data: { question: "Show reasons" },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post("/api/analytics", { data: { action: "refund" } })
    ).status(),
  ).toBe(405);
});

test("native AG Studio assistant cache and responsive availability", async ({
  page,
}) => {
  test.setTimeout(90000);
  const db = await testDatabase(),
    f = await syntheticCase(db);
  let calls = 0;
  try {
    const service = new AnalyticsAgentService(
      db,
      aiConfig({
        AI_ENABLED: "true",
        DEEPSEEK_API_KEY: "mock-studio-agent-only",
      }),
      {
        select: async () => {
          calls++;
          return {
            tool: "verified_refunds",
            usage: {
              promptTokens: 800,
              cachedTokens: 128,
              completionTokens: 12,
            },
            latencyMs: 1,
          };
        },
      },
      randomUUID(),
    );
    await page.route(
      (url) => url.pathname === "/api/analytics",
      async (route) => {
        const snapshot = await new AnalyticsService(db).snapshot(f.p);
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            ...snapshot,
            agent: { enabled: true, model: "deepseek-flash" },
          }),
        });
      },
    );
    await page.route("**/api/analytics/ask", async (route) => {
      const result = await service.ask(f.p, route.request().postDataJSON());
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(result),
      });
    });
    const login = await issueLoginToken(db, f.p.merchantId, f.p.email);
    await page.goto(`/login#token=${login}`);
    await expect(page.getByLabel("One-time access token")).toHaveValue(
      /^[a-f0-9]{64}$/,
    );
    await page.getByRole("button", { name: "Open your workspace" }).click();
    await page.waitForURL("**/dashboard");
    await page.goto("/analytics");
    await page
      .getByRole("button", { name: "Refresh data", exact: true })
      .click();
    if (test.info().project.name === "mobile") {
      await expect(
        page.getByRole("checkbox", {
          name: /Enable optional DeepSeek analytics assistant/,
        }),
      ).toBeDisabled();
      await expect(
        page.getByText(
          "Optional native chat and layout editing require a desktop-sized window. Mobile reports remain interactive.",
          { exact: false },
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Open AI assistant", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByTestId("ag-studio-canvas").locator("canvas").first(),
      ).toBeVisible({ timeout: 30000 });
      expect(calls).toBe(0);
      expect(
        await db.analyticsQuery.count({
          where: { merchantId: f.p.merchantId },
        }),
      ).toBe(0);
      await page.screenshot({
        path: "artifacts/analytics-agent-availability-mobile.png",
        fullPage: true,
      });
      return;
    }
    await expect(
      page.getByRole("checkbox", {
        name: /Enable optional DeepSeek analytics assistant/,
      }),
    ).toBeEnabled();
    expect(calls).toBe(0);
    await expect(
      page.getByRole("button", { name: "Open AI assistant", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("checkbox", {
        name: /Enable optional DeepSeek analytics assistant/,
      })
      .check();
    await page
      .getByRole("button", { name: "Open AI assistant", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Verified Sandbox refunds", exact: true })
      .click();
    await expect(
      page.getByText(/0 verified completed PayPal Sandbox refunds totaling/),
    ).toBeVisible({ timeout: 20000 });
    expect(calls).toBe(1);
    await page
      .getByPlaceholder("Ask the AI Assistant...")
      .fill("How many refunds were completed through PayPal Sandbox?");
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(
      page.getByText("Cached request; no new model call.", { exact: false }),
    ).toBeVisible();
    expect(calls).toBe(1);
    expect(
      await db.analyticsQuery.count({ where: { merchantId: f.p.merchantId } }),
    ).toBe(1);
    await page.screenshot({
      path: `artifacts/analytics-agent-mocked-${test.info().project.name}.png`,
      fullPage: true,
    });
  } finally {
    await db.$disconnect();
  }
});
