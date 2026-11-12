import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";
import { requireSeparateTestDatabase } from "./src/lib/validation/env";

const testUrl = requireSeparateTestDatabase(process.env);
const baseURL = "http://127.0.0.1:3100";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    channel: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  globalSetup: "./tests/e2e/setup.ts",
  webServer: {
    command:
      "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100",
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      DATABASE_URL: testUrl,
      APP_BASE_URL: baseURL,
      PAYPAL_ENV: "sandbox",
      PAYPAL_CLIENT_ID: "",
      PAYPAL_CLIENT_SECRET: "",
      PAYPAL_MERCHANT_ID: "",
      PAYPAL_WEBHOOK_ID: "",
      AI_ENABLED: "false",
      EVIDENCE_STORAGE: "database",
      SUPABASE_SECRET_KEY: "",
      PUBLIC_DEMO_ENABLED: "true",
      DEEPSEEK_API_KEY: "",
    },
  },
});
