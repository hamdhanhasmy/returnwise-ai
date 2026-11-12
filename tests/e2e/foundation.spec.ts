import { test, expect } from "@playwright/test";
import { testDatabase } from "../../scripts/test-database";
import { issueLoginToken } from "../../src/server/services/auth";
import { demoIds } from "../../prisma/fixtures";

async function signIn(page: import("@playwright/test").Page) {
  const db = await testDatabase();
  let token: string;
  try {
    token = await issueLoginToken(
      db,
      demoIds.merchant,
      "admin@oakandloom.example",
    );
  } finally {
    await db.$disconnect();
  }
  await page.goto(`/login#token=${token}`);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("One-time access token")).toHaveValue(token);
  await page.getByRole("button", { name: "Open your workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("health reports the actual database and disabled providers", async ({
  request,
}) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({
    status: "ok",
    database: "connected",
    payments: "disabled",
    ai: "disabled",
  });
});

test("merchant pages and APIs reject unauthenticated access", async ({
  page,
  request,
}) => {
  await page.goto("/cases");
  await expect(page).toHaveURL(/\/login$/);
  expect((await request.get(`/api/cases/${demoIds.cases[0]}`)).status()).toBe(
    401,
  );
  expect(
    (
      await request.post("/api/auth/login", {
        form: { token: "a".repeat(64) },
        headers: { origin: "https://evil.example" },
      })
    ).status(),
  ).toBe(403);
});

test("signed-in navigation, tenant isolation, portal and sign-out work", async ({
  page,
}) => {
  await signIn(page);
  await expect(
    page.getByRole("heading", { name: "A clearer path for every return." }),
  ).toBeVisible();
  expect(
    await page
      .locator("body")
      .evaluate((body) => body.scrollWidth <= body.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: `artifacts/dashboard-${test.info().project.name}.png`,
    fullPage: true,
  });
  await expect(
    page.getByText(
      "No payments have been captured or refunded by this application.",
    ),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Return cases" })
    .click();
  await page.getByRole("link", { name: "View case for RW-1042" }).click();
  await expect(
    page.getByRole("heading", { name: "Stoneware serving bowl" }),
  ).toBeVisible();
  const forbidden = await page.request.get(`/api/cases/${demoIds.otherCase}`);
  expect(forbidden.status()).toBe(404);
  const own = await page.request.get(`/api/cases/${demoIds.cases[0]}`);
  expect((await own.json()).totalMinor).toBe("8000");
  for (const [name, title] of [
    ["Analytics", "Every return tells a bigger story."],
    ["Settings", "Your workspace, at a glance."],
    ["Customer portal", "A calmer start to every return."],
  ]) {
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name, exact: true })
      .click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }
  await page
    .getByRole("button", { name: "Sign out" })
    .filter({ visible: true })
    .click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/returns");
  await expect(
    page.getByRole("heading", { name: "We’re making room for your story." }),
  ).toBeVisible();
});

test("invalid login shows a useful error and does not authenticate", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("One-time access token").fill("a".repeat(64));
  await page.getByRole("button", { name: "Open your workspace" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "This link is invalid" }),
  ).toContainText("invalid, expired, or already used");
});

test("payment endpoints require authentication and reject cross-origin mutations", async ({
  page,
  request,
}) => {
  for (const path of ["/api/payments", `/api/payments/${demoIds.merchant}`]) {
    expect(
      (
        await request.post(path, {
          data: { action: "capture" },
          headers: { origin: "http://127.0.0.1:3100" },
        })
      ).status(),
    ).toBe(401);
  }
  await signIn(page);
  expect(
    (
      await page.request.post("/api/payments", {
        data: {},
        headers: { origin: "https://evil.example" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post("/api/payments", {
        data: { productId: "bad", checkoutKey: "bad", amount: "0.01" },
        headers: { origin: "http://127.0.0.1:3100" },
      })
    ).status(),
  ).toBe(400);
});
test("unconfigured checkout is honest and transactions stay tenant scoped", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/checkout");
  await expect(
    page.getByRole("heading", { name: "Sandbox checkout is not enabled" }),
  ).toBeVisible();
  await expect(page.locator("paypal-button")).toHaveCount(0);
  expect(
    await page
      .locator("body")
      .evaluate((body) => body.scrollWidth <= body.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: `artifacts/checkout-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.goto("/transactions");
  await expect(
    page.getByText("No matching Sandbox transactions.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Search transactions").fill("unknown-provider-id");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByText("No matching Sandbox transactions.", { exact: false }),
  ).toBeVisible();
  await page.goto(`/transactions/${demoIds.otherMerchant}`);
  await expect(
    page.getByRole("heading", { name: /not found|couldn.t find/i }),
  ).toBeVisible();
});
