import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { RenderApi } from "./render-api";
import { checkedFreeService } from "./render-contract";
import { scriptDatabase } from "./database";
import { renderOwnerUrl } from "./render-database";
import { issueLoginToken } from "../src/server/services/auth";
import { SESSION_COOKIE } from "../src/lib/auth/tokens";
const db = scriptDatabase(renderOwnerUrl().toString());
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let stage = "deployment metadata";
try {
  const saved = JSON.parse(
    await readFile(".local/render-deployment.json", "utf8"),
  );
  const service = checkedFreeService(
    await new RenderApi().request(`/services/${saved.serviceId}`),
  );
  if (
    service.ownerId !== saved.ownerId ||
    service.serviceDetails.url !== saved.url
  )
    throw Error("Unexpected deployment target");
  const origin = service.serviceDetails.url;
  const before = {
    payments: await db.payment.count(),
    refunds: await db.refundOperation.count(),
    ai: await db.analysisAttempt.count(),
  };
  browser = await chromium.launch({ channel: "chromium" });
  await mkdir("artifacts", { recursive: true });
  const forbidden: string[] = [];
  for (const [name, viewport] of [
    ["desktop", { width: 1280, height: 900 }],
    ["mobile", { width: 390, height: 844 }],
  ] as const) {
    stage = `public ${name} views`;
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await page.route(
      /\/api\/(payments|paypal|evidence|analytics\/ask)\b/,
      async (route) => {
        forbidden.push("unexpected mutable/provider route");
        await route.abort();
      },
    );
    await page.goto(`${origin}/demo`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("modeled-avoidance")).toHaveText("$15.75");
    await expect(page.getByTestId("studio-license-fallback")).toBeVisible();
    await expect(page.getByTestId("ag-studio-canvas")).toHaveCount(0);
    await page.getByLabel("Record source").selectOption("synthetic");
    await expect(page.getByTestId("modeled-avoidance")).toHaveText("$13.00");
    if (
      !(await page
        .locator("body")
        .evaluate((b) => b.scrollWidth <= b.clientWidth))
    )
      throw Error("Public layout overflow");
    await page.screenshot({
      path: `artifacts/hosted-demo-${name}.png`,
      fullPage: true,
    });
    await page.goto(`${origin}/demo/cases/verified-sandbox-bowl`);
    await expect(
      page.getByRole("heading", {
        name: "Previously stored genuine DeepSeek assessment",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: /Generated synthetic broken-bowl/ }),
    ).toBeVisible();
    await page
      .getByRole("img", { name: /Generated synthetic broken-bowl/ })
      .evaluate(async (image) => {
        const img = image as HTMLImageElement;
        await img.decode();
        if (!img.naturalWidth)
          throw Error("Public synthetic image did not load");
      });
    await expect(
      page.getByText("Refund …238907 · $5.00 · COMPLETED", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `artifacts/hosted-case-${name}.png`,
      fullPage: true,
    });
    await context.close();
  }
  const user = await db.user.findFirstOrThrow({
    where: {
      email: process.env.HOSTED_ADMIN_EMAIL,
      role: "ADMIN",
      disabledAt: null,
    },
  });
  stage = "authorized merchant sign-in";
  const token = await issueLoginToken(db, user.merchantId, user.email);
  const context = await browser.newContext(),
    page = await context.newPage();
  try {
    await page.goto(`${origin}/login#token=${token}`);
    await expect(page.getByLabel("One-time access token")).toHaveValue(
      /^[a-f0-9]{64}$/,
    );
    await page.getByRole("button", { name: "Open your workspace" }).click();
    await page.waitForURL("**/dashboard");
    stage = "secure session flags";
    const cookie = (await context.cookies()).find(
      (c) => c.name === SESSION_COOKIE,
    );
    if (!cookie?.secure || !cookie.httpOnly || cookie.sameSite !== "Lax")
      throw Error("Incorrect hosted session flags");
    stage = "authorized analytics and origin rejection";
    if ((await page.request.get(`${origin}/api/analytics`)).status() !== 200)
      throw Error("Authorized analytics unavailable");
    if (
      (
        await page.request.post(`${origin}/api/analytics/ask`, {
          headers: { origin: "https://untrusted.example" },
          data: {},
        })
      ).status() !== 403
    )
      throw Error("Origin guard failed");
    await page.request.post(`${origin}/api/auth/logout`, {
      headers: { origin },
    });
    stage = "logout revocation";
    if ((await page.request.get(`${origin}/api/analytics`)).status() !== 401)
      throw Error("Logout did not revoke session");
  } finally {
    await page.request
      .post(`${origin}/api/auth/logout`, { headers: { origin } })
      .catch(() => undefined);
    await context.close();
  }
  const after = {
    payments: await db.payment.count(),
    refunds: await db.refundOperation.count(),
    ai: await db.analysisAttempt.count(),
  };
  if (forbidden.length || JSON.stringify(before) !== JSON.stringify(after))
    throw Error("Unexpected provider/financial change");
  const report = {
    url: origin,
    publicDesktopMobileVerified: true,
    filtersVerified: true,
    licensedStudioLoaded: false,
    ordinaryFallbackVerified: true,
    secureSession: true,
    httpOnly: true,
    sameSite: "Lax",
    merchantAuthorization: true,
    originRejection: true,
    logoutRevocation: true,
    noFinancialOrAiOperations: true,
    hostedCustomerUploadVerified: false,
  };
  await mkdir(".local/evaluation", { recursive: true });
  await writeFile(
    ".local/evaluation/hosted-ui.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} catch {
  console.error(
    `Hosted UI/auth verification failed at ${stage}; private credentials, cookies and tokens withheld. No successful verification is claimed for the failed check.`,
  );
  process.exitCode = 1;
} finally {
  await browser?.close();
  await db.$disconnect();
}
