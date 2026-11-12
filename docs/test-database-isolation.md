# Phase 1 review fix: isolated database tests

Phase 2 extension: payment integration fixtures and browser payment fixtures use the same verified `testDatabase()` factory. Providers are injected mocks only in tests; browser server credentials are explicitly empty. Entry-point checks, read-only identity probes, guarded migrations and no-cleanup behavior are unchanged. See [Phase 2 verification](phase-2-verification.md) for current counts.

## Root cause

The original npm integration wrapper validated `TEST_DATABASE_URL`, then replaced `DATABASE_URL` only in its child process. `foundation.test.ts` constructed `scriptDatabase()` at module evaluation with the default runtime URL. Direct Vitest or IDE execution bypassed the wrapper, so fixtures and auth/audit records could be written into development.

## Safeguards

1. `vitest.integration.config.ts` loads `.env` through dotenv without overriding existing shell values and validates configuration before collection. Missing, empty, malformed or unsafe values stop direct Vitest, npm and CI execution.
2. `foundation.test.ts` constructs its client only inside initialization through `scripts/test-database.ts`. The helper independently validates settings, so selecting this suite through another configuration cannot bypass the guard.
3. Both `DATABASE_URL` (the development reference) and `TEST_DATABASE_URL` are required. The npm wrapper no longer rewrites development's URL. A configured `DATABASE_MIGRATION_URL` is also checked for name collisions with the test target.
4. URLs require an explicit PostgreSQL host, username and database name. Names are lowercase ASCII letters/digits/underscores, start with a letter and are at most 63 bytes. Percent-encoded names are decoded before comparison. The test name must end in `_test` and differ from development and migration-owner database names even across host aliases, ports or credentials. This deliberately rejects same-name databases on separate servers as well.
5. URL fragments, routing options (`host`, `port`, `dbname`, `database`, `options`, `schema`, etc.), unsupported/duplicate query parameters, invalid escapes and names subject to truncation are rejected. Only `sslmode=disable|prefer|require|verify-ca|verify-full` is allowed. Use an explicit connection URL rather than PostgreSQL environment defaults.
6. After configuration passes, bounded **read-only** pg connections check `current_database()` and read-only mode for development and test. Each must report its configured database name. Probe clients are closed on success/failure. This detects misleading pooler aliases and unreachable targets without writing data. Only after these checks does the helper construct Prisma with the explicit test URL. Errors are sanitized rather than forwarding driver messages or connection strings.
7. `db:migrate:test` performs the same checks before spawning the migration process and overrides both migration/runtime URLs only in that child. The normal development migration path is unchanged. E2E fixture and login-token creation use the same verified test factory; the Playwright configuration validates before its server starts.

Configuration validation necessarily precedes construction of the read-only probe clients; actual server identity is learned through those probes before Prisma construction or any fixture/migration work. Both databases must be reachable. These tests provide no destructive cleanup: no reset, truncate, drop or data deletion was added. Any future database cleanup must use the verified test factory and retain the same guard. Use a dedicated test role restricted to the test database for additional operational protection; the local launcher continues to use its existing development owner role.

## Windows / PowerShell setup

Use Node 24.x. From `D:\returnwise-ai`, start the existing local cluster in one terminal:

```powershell
npm.cmd run db:local
```

The launcher creates `.env` only if absent and preserves data. If it is already running, keep its terminal open. Do not start a second cluster or reset anything. With another PostgreSQL installation, skip the launcher and privately edit ignored `.env` using the fake placeholders in `.env.example`; provision separate `returnwise_dev` and `returnwise_test` databases. The launcher uses port 55432, while `.env.example` shows conventional port 5432.

In a second terminal:

```powershell
npm.cmd run db:generate
npm.cmd run db:migrate:test
npm.cmd run test:integration
npx.cmd vitest run --config vitest.integration.config.ts
```

Leave `DATABASE_URL` pointing to development and set `TEST_DATABASE_URL` explicitly in `.env`. Do not share URLs containing credentials. Environment variables inherited by PowerShell override `.env`; to remove stale overrides from this terminal only:

```powershell
Remove-Item Env:DATABASE_URL, Env:TEST_DATABASE_URL, Env:DATABASE_MIGRATION_URL -ErrorAction SilentlyContinue
```

Then rerun the command so dotenv reads `.env`. No provider secrets are needed. A proxy must preserve the database names reported by PostgreSQL; otherwise use a direct PostgreSQL endpoint. If either database is unavailable or configuration is rejected, stop and correct it; never substitute development for the test target.

## Regression coverage

- Missing/empty/malformed URLs reject before even probe-client construction; no development fallback.
- Equivalent database names across protocols, host aliases, ports, credentials and percent encoding reject.
- System databases, missing names/users, invalid encodings, oversized identifiers, fragments, routing overrides and unsupported/duplicate query settings reject.
- A test URL matching the migration-owner database rejects.
- Valid isolated configuration verifies both database identities using read-only probes, closes probes, and constructs Prisma only with the test URL.
- Backend-name mismatch, absent read-only protection and connection failure reject before Prisma; errors do not expose credentials.
- Subprocess regressions invoke the real Vitest integration entry point with missing, equivalent and malformed settings. An empty temporary dotenv file prevents local configuration from filling gaps. A loopback TCP tripwire confirms **zero connection attempts**, and Vitest exits 1 before suite collection. The test deletes only its own verified temporary directory, never database data.

Run these without PostgreSQL:

```powershell
npm.cmd test -- tests/unit/test-database.test.ts tests/unit/integration-entrypoint.test.ts
```

## Development-data inspection

A read-only inspection before verification found `returnwise_dev` with two merchants, three users, four products/orders/cases, two access tokens, two sessions and two audit records. Distinctive integration markers were absent: zero `TEST_APPEND_ONLY` audit actions, zero `disabled-%@example.invalid` users, zero sessions with epoch expiry. The normal seed intentionally creates the demo fixtures, and the auth records alone do not establish test contamination. No evidence of earlier integration-test writes was found; absence of markers cannot rule out an interrupted/partial prior run. No data was deleted or reset.

Verification results and the final comparison are recorded in [Phase 1 verification](phase-1-verification.md).
