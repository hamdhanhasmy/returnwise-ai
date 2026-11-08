import { z } from "zod";

const postgresUrl = z
  .string()
  .url()
  .refine(
    (value) => /^postgres(ql)?:\/\//.test(value),
    "Expected a PostgreSQL URL",
  );
const origin = z
  .string()
  .url()
  .refine((value) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return false;
    }
    return (
      ["http:", "https:"].includes(url.protocol) &&
      (url.protocol === "https:" ||
        ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    );
  }, "Expected an HTTP(S) origin without a path");

export const environmentSchema = z.object({
  DATABASE_URL: postgresUrl.optional(),
  TEST_DATABASE_URL: postgresUrl.optional(),
  DATABASE_MIGRATION_URL: postgresUrl.optional(),
  APP_BASE_URL: origin.default("http://127.0.0.1:3000"),
  PAYPAL_ENV: z.literal("sandbox").default("sandbox"),
});

export function parseEnvironment(input: Record<string, string | undefined>) {
  const result = environmentSchema.safeParse(input);
  if (!result.success) {
    // Report field names only: Zod issue values must never disclose credentials.
    throw new Error(
      `Invalid environment configuration: ${[...new Set(result.error.issues.map((issue) => issue.path[0]))].join(", ")}`,
    );
  }
  return result.data;
}

export function requireDatabaseUrl(
  input: Record<string, string | undefined> = process.env,
) {
  const env = parseEnvironment(input);
  if (!env.DATABASE_URL)
    throw new Error("DATABASE_URL is required. Follow README local setup.");
  return env.DATABASE_URL;
}

export function requireSeparateTestDatabase(
  input: Record<string, string | undefined>,
) {
  const env = parseEnvironment(input);
  if (!env.DATABASE_URL || !env.TEST_DATABASE_URL)
    throw new Error(
      "DATABASE_URL and TEST_DATABASE_URL are required for database tests; no fallback is allowed",
    );
  const runtime = testDatabaseName(env.DATABASE_URL);
  const test = testDatabaseName(env.TEST_DATABASE_URL);
  const migration = env.DATABASE_MIGRATION_URL
    ? testDatabaseName(env.DATABASE_MIGRATION_URL)
    : undefined;
  // Different names are required even across host aliases, ports, users or schemas.
  if (runtime === test || migration === test || !test.endsWith("_test")) {
    throw new Error(
      "Tests require a separate database whose name ends in _test",
    );
  }
  return env.TEST_DATABASE_URL;
}

/** Restricted, unambiguous URL syntax shared by pg and Prisma test tooling. */
export function testDatabaseName(value: string): string {
  try {
    const url = new URL(value);
    const name = decodeURIComponent(url.pathname.slice(1));
    // Explicit user/database prevent PGUSER/PGDATABASE defaults. Reject routing
    // overrides (host, port, dbname, options, service, schema, etc.) in queries.
    // 63 ASCII bytes avoids PostgreSQL identifier truncation and encoding aliases.
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname ||
      !url.username ||
      url.hash ||
      /[\s\\]/.test(value) ||
      !/^[a-z][a-z0-9_]{0,62}$/.test(name) ||
      (url.port && (Number(url.port) < 1 || Number(url.port) > 65535)) ||
      [...url.searchParams].some(
        ([key, setting]) =>
          key !== "sslmode" ||
          ![
            "disable",
            "prefer",
            "require",
            "verify-ca",
            "verify-full",
          ].includes(setting),
      ) ||
      url.searchParams.getAll("sslmode").length > 1
    )
      throw new Error();
    // Invalid percent escapes in credentials must fail before pg construction.
    decodeURIComponent(url.username);
    decodeURIComponent(url.password);
    return name;
  } catch {
    throw new Error(
      "Tests require a separate database with an explicit PostgreSQL host, user and database name; unsafe connection URL",
    );
  }
}
