import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { scriptDatabase } from "./database";
import { demoIds } from "../prisma/fixtures";
import { issueLoginToken } from "../src/server/services/auth";
import { assessmentSchema } from "../src/lib/ai/contracts";
// Explicit genuine-data UI smoke, separate from mocked E2E. No analysis/refund API is invoked.
const db = scriptDatabase(),
  base = "http://127.0.0.1:3201";
let server: ReturnType<typeof spawn> | undefined,
  browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  const existing = await fetch(`${base}/api/health`).catch(() => null);
  if (existing)
    throw new Error("Port already occupied; refuse to reuse an unknown server");
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3201",
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, APP_BASE_URL: base },
      windowsHide: true,
      stdio: "ignore",
    },
  );
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if ((await fetch(`${base}/login`).catch(() => null))?.ok) {
      ready = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!ready) throw Error("Server not ready");
  const analysis = await db.evidenceAnalysis.findFirstOrThrow({
      where: {
        merchantId: demoIds.merchant,
        status: "SUCCEEDED",
        returnCase: { order: { publicOrderNumber: "AI-EVAL-V1-broken-1" } },
      },
      orderBy: { createdAt: "desc" },
    }),
    assessment = assessmentSchema.parse(analysis.result);
  const token = await issueLoginToken(
    db,
    demoIds.merchant,
    "admin@oakandloom.example",
  );
  browser = await chromium.launch({ channel: "chromium" });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  await page.goto(`${base}/login#token=${token}`);
  await page.getByRole("button", { name: "Open your workspace" }).click();
  await page.waitForURL("**/dashboard");
  await page.goto(`${base}/cases/${analysis.caseId}`);
  await page.getByRole("button", { name: "Open evidence workspace" }).click();
  await page
    .getByText(assessment.visibleObservations[0]!, { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "View image 1", exact: true }).click();
  await page
    .getByAltText("Customer-provided product evidence; unverified")
    .waitFor();
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: "artifacts/deepseek-genuine-merchant.png",
    fullPage: true,
  });
  console.log(
    JSON.stringify({
      genuineStoredAssessmentDisplayed: true,
      caseId: analysis.caseId,
      status: analysis.status,
      model: analysis.model,
      screenshot: "artifacts/deepseek-genuine-merchant.png",
      providerRequestsSent: 0,
    }),
  );
} catch {
  console.error(
    "Genuine assessment UI smoke failed; no provider request was made by this script.",
  );
  process.exitCode = 1;
} finally {
  await browser?.close();
  server?.kill();
  await db.$disconnect();
}
