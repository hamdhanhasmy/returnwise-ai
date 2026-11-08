import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:net";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const execute = promisify(execFile);

describe("direct Vitest integration entry point", () => {
  it.each(["missing", "equivalent", "malformed"])(
    "rejects %s TEST_DATABASE_URL before any connection",
    async (kind) => {
      // A TCP tripwire makes accidental DB access observable, with no real DB involved.
      let connections = 0;
      const server = createServer((socket) => {
        connections++;
        socket.destroy();
      });
      await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("No tripwire port");
      const directory = await mkdtemp(join(tmpdir(), "returnwise-isolation-"));
      try {
        const envFile = join(directory, ".env");
        await writeFile(envFile, "");
        const runtime = `postgresql://fake:fake@127.0.0.1:${address.port}/development_test`;
        const env: NodeJS.ProcessEnv = {
          ...process.env,
          DOTENV_CONFIG_PATH: envFile,
          DOTENV_CONFIG_OVERRIDE: "false",
          DATABASE_URL: runtime,
          DATABASE_MIGRATION_URL: "",
          APP_BASE_URL: "http://127.0.0.1:3000",
          PAYPAL_ENV: "sandbox",
        };
        delete env.DATABASE_MIGRATION_URL;
        delete env.TEST_DATABASE_URL;
        if (kind === "equivalent")
          env.TEST_DATABASE_URL = runtime.replace(
            "development_test",
            "development%5ftest",
          );
        if (kind === "malformed")
          env.TEST_DATABASE_URL = "invalid-private-value";
        const result = await execute(
          process.execPath,
          [
            resolve("node_modules/vitest/vitest.mjs"),
            "run",
            "--config",
            "vitest.integration.config.ts",
          ],
          { cwd: process.cwd(), env, timeout: 20000, maxBuffer: 1024 * 1024 },
        )
          .then(({ stdout, stderr }) => ({ code: 0, output: stdout + stderr }))
          .catch(
            (error: {
              code: number | string;
              stdout?: string;
              stderr?: string;
            }) => ({
              code: error.code,
              output: (error.stdout ?? "") + (error.stderr ?? ""),
            }),
          );
        expect(result.code).toBe(1);
        expect(result.output).toMatch(/TEST_DATABASE_URL|separate database/);
        expect(result.output).not.toContain("invalid-private-value");
        expect(result.output).not.toContain("foundation.test.ts");
        expect(connections).toBe(0);
      } finally {
        await new Promise<void>((done) => server.close(() => done()));
        // Only this test's freshly created temp directory is removed; never database data.
        if (
          dirname(resolve(directory)) !== resolve(tmpdir()) ||
          !basename(directory).startsWith("returnwise-isolation-")
        )
          throw new Error("Unexpected test temporary directory");
        await rm(directory, { recursive: true, force: true });
      }
    },
    30000,
  );
});
