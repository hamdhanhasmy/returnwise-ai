import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
export function runLocal(
  entry: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
) {
  const result = spawnSync(
    process.execPath,
    [resolve("node_modules", entry), ...args],
    { env, stdio: "inherit", shell: false },
  );
  if (result.error || result.status !== 0)
    throw new Error("Command failed; inspect the output above");
}
