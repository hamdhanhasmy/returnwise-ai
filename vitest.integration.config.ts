import "dotenv/config";
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { requireSeparateTestDatabase } from "./src/lib/validation/env";

// Applies to direct Vitest, IDE runners, npm and CI, before test collection.
requireSeparateTestDatabase(process.env);
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    env: { EVIDENCE_STORAGE: "database", SUPABASE_SECRET_KEY: "" },
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    hookTimeout: 20000,
  },
});
