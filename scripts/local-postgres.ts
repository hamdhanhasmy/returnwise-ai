import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { parse } from "dotenv";
import EmbeddedPostgres from "embedded-postgres";

// A dedicated local PostgreSQL server, not an in-memory approximation. No system user/service changes.
mkdirSync(".local", { recursive: true });
if (!existsSync(".env")) {
  const password = randomBytes(24).toString("hex");
  writeFileSync(
    ".env",
    `DATABASE_URL=postgresql://returnwise:${password}@127.0.0.1:55432/returnwise_dev\nTEST_DATABASE_URL=postgresql://returnwise:${password}@127.0.0.1:55432/returnwise_test\nAPP_BASE_URL=http://127.0.0.1:3000\nPAYPAL_ENV=sandbox\n`,
    { flag: "wx", mode: 0o600 },
  );
  console.log("Created ignored .env with random local-only credentials.");
}
const localEnv = parse(readFileSync(".env"));
let configured: URL;
try {
  configured = new URL(localEnv.DATABASE_URL ?? "postgresql://invalid");
} catch {
  throw new Error(
    "Invalid local database configuration. Existing .env was preserved.",
  );
}
if (
  configured.hostname !== "127.0.0.1" ||
  configured.port !== "55432" ||
  configured.username !== "returnwise" ||
  configured.pathname !== "/returnwise_dev" ||
  !configured.password
) {
  throw new Error(
    "db:local requires its dedicated local URL: returnwise at 127.0.0.1:55432/returnwise_dev. Existing .env was preserved; use your configured PostgreSQL instead.",
  );
}
const cluster = new EmbeddedPostgres({
  databaseDir: resolve(".local/postgres"),
  port: 55432,
  user: "returnwise",
  password: decodeURIComponent(configured.password),
  persistent: true,
  authMethod: "scram-sha-256",
  createPostgresUser: false,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: () => {},
});
try {
  if (!existsSync(".local/postgres/PG_VERSION")) await cluster.initialise();
  await cluster.start();
  const client = cluster.getPgClient("postgres", "127.0.0.1");
  await client.connect();
  try {
    for (const database of ["returnwise_dev", "returnwise_test"]) {
      const existing = await client.query(
        "SELECT 1 FROM pg_database WHERE datname = $1",
        [database],
      );
      if (!existing.rowCount)
        await client.query(`CREATE DATABASE "${database}"`);
    }
  } finally {
    await client.end();
  }
  console.log(
    "PostgreSQL ready on 127.0.0.1:55432 (development + test databases). Keep this terminal open; Ctrl+C stops it and preserves data.",
  );
  await new Promise<void>((done) => {
    process.once("SIGINT", done);
    process.once("SIGTERM", done);
  });
} catch {
  console.error(
    "Local PostgreSQL failed to start. Check port 55432 and native binary prerequisites. No data was deleted.",
  );
  process.exitCode = 1;
} finally {
  await cluster.stop().catch(() => {});
}
