import { spawn } from "node:child_process";
import { validateRenderEnvironment } from "../src/lib/deployment";
try {
  const { port, origin } = validateRenderEnvironment(process.env);
  process.env.APP_BASE_URL = origin;
  const child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "0.0.0.0",
      "--port",
      String(port),
    ],
    { stdio: "inherit", env: process.env },
  );
  process.on("SIGTERM", () => child.kill("SIGTERM"));
  process.on("SIGINT", () => child.kill("SIGINT"));
  child.on("error", () => {
    console.error("Hosted Next.js startup failed; credentials withheld.");
    process.exitCode = 1;
  });
  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
} catch (e) {
  console.error(
    e instanceof Error ? e.message : "Hosted configuration invalid",
  );
  process.exitCode = 1;
}
