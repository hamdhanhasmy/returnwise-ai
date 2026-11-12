import { chromium, expect, type Page } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { scriptDatabase } from "./database";
import { demoIds } from "../prisma/fixtures";
import { issueLoginToken } from "../src/server/services/auth";
const db = scriptDatabase(),
  base = "http://127.0.0.1:3202",
  live = process.argv.includes("--live");
let server: ReturnType<typeof spawn> | undefined,
  browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let stage = "preflight";
let lastPage: Page | undefined;
try {
  if (await fetch(`${base}/api/health`).catch(() => null))
    throw Error("Occupied port");
  const before = {
    payments: await db.payment.count(),
    refundOperations: await db.refundOperation.count(),
    visionAttempts: await db.analysisAttempt.count(),
    queries: await db.analyticsQuery.count({
      where: { merchantId: demoIds.merchant },
    }),
  };
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3202",
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, APP_BASE_URL: base },
      windowsHide: true,
      stdio: "ignore",
    },
  );
  let ready = false;
  for (let i = 0; i < 90; i++) {
    if ((await fetch(`${base}/login`).catch(() => null))?.ok) {
      ready = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!ready) throw Error("Server unavailable");
  browser = await chromium.launch({ channel: "chromium" });
  await mkdir("artifacts", { recursive: true });
  let agentResult: unknown;
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    const name = viewport.width > 1000 ? "desktop" : "mobile",
      context = await browser.newContext({ viewport });
    const page = await context.newPage();
    lastPage = page;
    await context.route("**/api/payments**", (r) => r.abort());
    await context.route("**/api/returns/cases/*/refund", (r) => r.abort());
    await context.route("**/api/evidence/**", (r) => r.abort());
    const login = await issueLoginToken(
      db,
      demoIds.merchant,
      "admin@oakandloom.example",
    );
    await page.goto(`${base}/login#token=${login}`);
    await expect(page.getByLabel("One-time access token")).toHaveValue(
      /^[a-f0-9]{64}$/,
    );
    await page.getByRole("button", { name: "Open your workspace" }).click();
    await page.waitForURL("**/dashboard");
    stage = `${name} Studio dashboard`;
    await page.goto(`${base}/analytics`);
    await expect(
      page.getByTestId("ag-studio-canvas").locator("canvas").first(),
    ).toBeVisible({ timeout: 30000 });
    await page.screenshot({
      path: `artifacts/analytics-genuine-overview-${name}.png`,
      fullPage: true,
    });
    await page.getByRole("tab", { name: "Economics lab" }).click();
    await expect(
      page.getByTestId("ag-studio-canvas").locator("canvas").first(),
    ).toBeVisible();
    await page.screenshot({
      path: `artifacts/analytics-genuine-economics-${name}.png`,
      fullPage: true,
    });
    if (
      !(await page
        .locator("body")
        .evaluate((b) => b.scrollWidth <= b.clientWidth))
    )
      throw Error("Horizontal overflow");
    if (live && name === "desktop") {
      stage = "genuine consented AG Studio assistant";
      await page
        .getByRole("checkbox", {
          name: /Enable optional DeepSeek analytics assistant/,
        })
        .check();
      // The native Studio panel owns this conversation UI.
      const buttons = await page.getByRole("button").allTextContents();
      console.log(
        JSON.stringify({
          studioPanelControls: buttons.filter((b) => /assistant|chat/i.test(b)),
        }),
      );
      await page
        .getByRole("button", { name: "Open AI assistant", exact: true })
        .click();
      const response = page.waitForResponse(
        (r) => r.url().endsWith("/api/analytics/ask"),
        { timeout: 45000 },
      );
      await page
        .getByRole("button", { name: "Verified Sandbox refunds", exact: true })
        .click();
      const http = await response;
      agentResult = await http.json();
      if (
        !http.ok() ||
        (agentResult as { status: string }).status !== "SUCCEEDED"
      )
        throw Error("Agent failed");
      await expect(
        page.getByText(/verified completed PayPal Sandbox refunds totaling/),
      ).toBeVisible({ timeout: 15000 });
      await page.screenshot({
        path: "artifacts/analytics-genuine-agent-desktop.png",
        fullPage: true,
      });
    }
    await page.request.post(`${base}/api/auth/logout`, {
      headers: { origin: base },
    });
    await context.close();
  }
  const latest = await db.analyticsQuery.findFirst({
    where: { merchantId: demoIds.merchant },
    orderBy: { createdAt: "desc" },
    select: {
      status: true,
      model: true,
      toolName: true,
      promptTokens: true,
      cachedTokens: true,
      completionTokens: true,
      estimatedNano: true,
      latencyMs: true,
    },
  });
  const report = {
    nativeStudioVerified: ["desktop", "mobile"],
    liveRequested: live,
    agentResult,
    latest,
    noPaymentCreated: (await db.payment.count()) === before.payments,
    noRefundOperationCreated:
      (await db.refundOperation.count()) === before.refundOperations,
    noVisionRequest:
      (await db.analysisAttempt.count()) === before.visionAttempts,
    newAnalyticsRequests:
      (await db.analyticsQuery.count({
        where: { merchantId: demoIds.merchant },
      })) - before.queries,
  };
  await mkdir(".local/evaluation", { recursive: true });
  await writeFile(
    ".local/evaluation/analytics-report.json",
    JSON.stringify(
      report,
      (_, v) => (typeof v === "bigint" ? v.toString() : v),
      2,
    ),
  );
  console.log(
    JSON.stringify(report, (_, v) =>
      typeof v === "bigint" ? v.toString() : v,
    ),
  );
} catch {
  if (stage.includes("assistant")) {
    await lastPage
      ?.screenshot({
        path: "artifacts/analytics-agent-diagnostic.png",
        fullPage: true,
      })
      .catch(() => {});
    console.log(
      JSON.stringify({
        nativeTabs: await lastPage?.getByRole("tab").allTextContents(),
        assistantTextMatches: await lastPage
          ?.getByText("AI Assistant", { exact: true })
          .count(),
      }),
    );
  }
  console.error(
    `Analytics UI smoke stopped during ${stage}. Inspect persisted analytics request before retrying. No payment operation is available in this helper.`,
  );
  process.exitCode = 1;
} finally {
  await browser?.close();
  server?.kill();
  await db.$disconnect();
}
