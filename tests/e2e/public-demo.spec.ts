import { test, expect } from "@playwright/test";
test("public table fallback is honest and does not load AG Studio", async ({
  page,
}) => {
  await page.goto("/demo?view=table");
  await expect(page.getByTestId("studio-license-fallback")).toBeVisible();
  await expect(
    page.getByText("This fallback is an ordinary table, not AG Studio.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByTestId("ag-studio-canvas")).toHaveCount(0);
  await expect(page.getByLabel("Record source")).toBeEnabled();
  await page.screenshot({
    path: `artifacts/public-demo-fallback-${test.info().project.name}.png`,
    fullPage: true,
  });
});
test("public judges explore sanitized cases and reports without authentication or provider calls", async ({
  page,
}) => {
  test.setTimeout(90000);
  const forbidden: string[] = [];
  page.on("request", (r) => {
    if (
      /\/api\/(payments|paypal|evidence|returns|analytics\/ask)\b/.test(
        new URL(r.url()).pathname,
      )
    )
      forbidden.push(r.url());
  });
  await page.goto("/demo");
  await expect(
    page.getByText("Public read-only demo · Sandbox only.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByTestId("modeled-avoidance")).toHaveText("$15.75");
  await expect(
    page.getByRole("checkbox", {
      name: /Enable optional DeepSeek analytics assistant/,
    }),
  ).toBeDisabled();
  await page.getByLabel("Record source").selectOption("synthetic");
  await expect(page.getByTestId("modeled-avoidance")).toHaveText("$13.00");
  await page.getByLabel("Record source").selectOption("sandbox");
  await expect(page.getByTestId("modeled-avoidance")).toHaveText("$2.75");
  await page.getByRole("link", { name: /VERIFIED-5USD/ }).click();
  await expect(
    page.getByRole("heading", {
      name: "Previously stored genuine DeepSeek assessment",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: /Generated synthetic broken-bowl/ }),
  ).toBeVisible();
  await expect(
    page.getByText("Refund …238907 · $5.00 · COMPLETED", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /refund|approve|analyze|upload/i }),
  ).toHaveCount(0);
  const data = await page.request.get("/api/demo/analytics");
  expect(data.status()).toBe(200);
  expect((await data.json()).agent.enabled).toBe(false);
  expect(
    (
      await page.request.post("/api/demo/analytics", {
        data: { action: "refund" },
      })
    ).status(),
  ).toBe(405);
  expect(
    (await page.request.get("/api/demo/analytics?merchantId=other")).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post("/api/payments", {
        headers: { origin: "http://127.0.0.1:3100" },
        data: {},
      })
    ).status(),
  ).toBe(401);
  expect((await page.request.get("/api/analytics")).status()).toBe(401);
  await page.screenshot({
    path: `artifacts/public-demo-case-${test.info().project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.locator("body").evaluate((b) => b.scrollWidth <= b.clientWidth),
  ).toBe(true);
  expect(forbidden).toEqual([]);
});
