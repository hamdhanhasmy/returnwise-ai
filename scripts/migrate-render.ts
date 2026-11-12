import { spawnSync } from "node:child_process";
import { renderOwnerUrl } from "./render-database";
try {
  const url = renderOwnerUrl().toString();
  const action = process.argv.includes("--deploy") ? "deploy" : "status";
  const result = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", action],
    {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: url, DATABASE_MIGRATION_URL: url },
    },
  );
  process.exitCode = result.status ?? 1;
} catch {
  console.error(
    "Hosted migration target invalid; only explicit additive deploy/status on the dedicated Render database are supported. No secret value printed.",
  );
  process.exitCode = 1;
}
