import { runLocal } from "./run-local";
runLocal("vitest/vitest.mjs", [
  "run",
  "--config",
  "vitest.integration.config.ts",
]);
