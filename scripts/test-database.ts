import "dotenv/config";
import pg from "pg";
import { scriptDatabase } from "./database";
import {
  requireSeparateTestDatabase,
  testDatabaseName,
} from "../src/lib/validation/env";

// Configuration is validated before constructing even the read-only probe client.
// A pooler alias must report the requested DB name, not a different backend DB.
async function verifyIdentity(url: string, label: string) {
  const expected = testDatabaseName(url);
  const client = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: 3000,
    query_timeout: 5000,
    options: "-c default_transaction_read_only=on",
  });
  try {
    await client.connect();
    const result = await client.query<{ database: string; read_only: string }>(
      "SELECT current_database() AS database, current_setting('transaction_read_only') AS read_only",
    );
    if (
      result.rows.length !== 1 ||
      result.rows[0]?.database !== expected ||
      result.rows[0]?.read_only !== "on"
    )
      throw new Error();
  } catch {
    // Driver errors may contain usernames, hostnames or credentials. Do not forward them.
    throw new Error(
      `Database isolation verification failed for ${label}; no test writes or migrations were started`,
    );
  } finally {
    await client.end().catch(() => {});
  }
}

export async function verifyTestDatabase(
  input: Record<string, string | undefined> = process.env,
) {
  const url = requireSeparateTestDatabase(input);
  // Snapshot both URLs before awaiting. Never repoint the parent DATABASE_URL.
  const runtimeUrl = input.DATABASE_URL!;
  await verifyIdentity(runtimeUrl, "DATABASE_URL");
  await verifyIdentity(url, "TEST_DATABASE_URL");
  return url;
}

/** Sole database factory for test fixtures; there is no runtime-URL default. */
export async function testDatabase(
  input: Record<string, string | undefined> = process.env,
) {
  const url = await verifyTestDatabase(input);
  return scriptDatabase(url);
}
