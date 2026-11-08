# ReturnWise AI

A sandbox-only merchant workspace for careful return resolution. Phase 1 provides a working Next.js foundation with PostgreSQL-backed synthetic cases, one-time merchant login, tenant-scoped access, and a responsive shell. **PayPal operations, refund approval, customer claim submission, AI calls, and AG Studio analytics are not implemented yet.**

## Requirements

- Node.js **24.x** and npm (validated locally with Node 24.16.0 / npm 11.13.0).
- PostgreSQL 18, or the included project-local PostgreSQL launcher on supported desktop platforms. Docker is optional. The launcher never creates a system user or installs a service; Linux root-only environments should use their own PostgreSQL service.
- Browser tests require Playwright Chromium and its OS prerequisites.
- No PayPal, OpenAI, SMTP or external auth credentials are required for Phase 1.

## Quick local setup (Windows PowerShell)

From the repository root:

```powershell
npm.cmd ci
npm.cmd run db:generate
npm.cmd run db:local
```

Keep that terminal open. The launcher creates an ignored `.env` **only when absent**, with random local credentials, starts actual PostgreSQL on **127.0.0.1:55432**, and creates separate `returnwise_dev` and `returnwise_test` databases. Data is retained under ignored `.local/postgres`. Ctrl+C stops the server and preserves its data. It does not overwrite existing environment files or reset databases. A first startup may take several seconds. Credentials are not printed.

In a second terminal:

```powershell
npm.cmd run db:validate
npm.cmd run db:migrate
npm.cmd run db:migrate:test
npm.cmd run db:seed
npm.cmd run dev
```

Open **http://127.0.0.1:3000**. Use this exact origin; `localhost` is a different origin for CSRF and cookie purposes. In a third terminal, issue a private sign-in link:

```powershell
npm.cmd run auth:link -- --email=admin@oakandloom.example --merchant=11111111-1111-4111-8111-111111111111
```

Open the locally printed link, then choose **Open your workspace**. It expires in 15 minutes and can be used once. The credential is in a URL fragment so it does not enter HTTP access logs; the page clears the fragment immediately. The CLI intentionally displays this credential to the local operator: do not run it in shared logs, paste it into chat, or commit its output. Sessions expire after eight hours; sign-out revokes them in PostgreSQL.

The seed is idempotent and preserves existing rows. Oak & Loom has three synthetic scenarios; Northstar Goods has one isolated case. No PayPal order/capture/refund IDs or provider successes are seeded. A staff account exists at `staff@oakandloom.example`; use the same merchant ID. Tenant B uses `admin@northstar.example` and merchant `22222222-2222-4222-8222-222222222222`.

On macOS/Linux, use `npm` instead of `npm.cmd`. The local launcher is a convenience; a conventional PostgreSQL installation or container is equally supported.

## Use an existing PostgreSQL instance

Copy `.env.example` to ignored `.env` without overwriting any existing file. Provision two **dedicated** databases and substitute credentials locally:

```dotenv
DATABASE_URL=postgresql://returnwise:REPLACE_ME@127.0.0.1:5432/returnwise_dev
TEST_DATABASE_URL=postgresql://returnwise:REPLACE_ME@127.0.0.1:5432/returnwise_test
APP_BASE_URL=http://127.0.0.1:3000
PAYPAL_ENV=sandbox
```

Apply the migrations and seed using the commands above; skip `db:local`. Test tooling requires a different database name ending in `_test`, rejects shared runtime/test identity, and does not reset/drop data. Migrations are additive initial schema creation; no destructive reset command is needed. If using a least-privilege runtime DB role, `DATABASE_MIGRATION_URL` can hold a separate migration-owner connection. Runtime should not own tables or have migration/DDL rights when hosted.

The example contains placeholders only. The application validates PostgreSQL URLs, application origin and sandbox-only mode, reporting field names without values. Missing database configuration leaves `/login` and `/returns` usable; authenticated database views require setup and `/api/health` reports HTTP 503. Do not set provider secrets for this phase; adding them does not enable provider calls.

## Commands and checks

```powershell
npm.cmd run db:validate
npm.cmd run db:generate
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run test:integration
npm.cmd run build
npm.cmd run test:e2e:install
npm.cmd run test:e2e
```

Integration and browser tests need the migrated `TEST_DATABASE_URL` database. They add synthetic fixtures and expiring auth records without deleting existing rows. Use only a dedicated test database. Unit tests run without PostgreSQL. Playwright tests start the **production build** on port 3100 using the test database, with a strict test origin, and exercise desktop/mobile navigation, login/logout, tenant isolation and health. Port 3100 must be free. Tests use Chromium's new headless mode; the install script skips the redundant headless-shell download. `test:e2e:install -- --with-deps` installs Linux browser system prerequisites when appropriate. Test reports, traces and screenshots are ignored; screenshots land in `artifacts/`.

### Test database isolation (PowerShell)

Configure both URLs privately in ignored `.env`, or use the file already created by `db:local`. Keep `DATABASE_URL` pointed at development; **do not repoint it at the test database**. `TEST_DATABASE_URL` is mandatory for database tests and must use a different database name ending in `_test`. A schema, different username, port, or hostname alias does not provide isolation. Database names must start with a lowercase letter and contain only lowercase ASCII letters, digits and underscores (maximum 63 bytes). Test tooling accepts only the optional `sslmode` URL query parameter; connection-routing overrides and fragments are rejected.

```powershell
# From D:\returnwise-ai, with PostgreSQL running and both URLs set in .env:
npm.cmd run db:migrate:test
npm.cmd run test:integration
# Direct execution enforces the same safeguards:
npx.cmd vitest run --config vitest.integration.config.ts
# Regression checks, including direct-execution rejection; no PostgreSQL required:
npm.cmd test -- tests/unit/test-database.test.ts tests/unit/integration-entrypoint.test.ts
```

The Vitest configuration rejects unsafe settings before collection. The test client factory rechecks them and uses read-only PostgreSQL probes to confirm **both** configured database names before constructing Prisma or inserting fixtures. Test migrations use the same verification before launching Prisma. Unavailable databases or a pooler mapping a URL to another database stop the workflow. Shell environment values take precedence over `.env`; clear stale values in that PowerShell session if needed. No test cleanup/reset/drop command is provided. See [test database isolation](docs/test-database-isolation.md) for setup, regression coverage and the development-data inspection.

For a production build locally:

```powershell
npm.cmd run build
npm.cmd run start
```

`GET /api/health` performs a bounded database connectivity check: HTTP 200 with `database: connected`, or HTTP 503 with `unconfigured`/`unavailable`. It never returns connection strings. Both provider capabilities report `disabled`.

CI is defined in `.github/workflows/ci.yml`: isolated PostgreSQL, generation/migrations/seed, lint, typecheck, unit/integration tests, build, and Playwright. Local verification results are in [docs/phase-1-verification.md](docs/phase-1-verification.md); a checked-in workflow is not a claim that remote CI has run.

## Structure and routes

```text
src/app/                  App Router pages, layouts and thin HTTP handlers
  (merchant)/             Authenticated merchant shell and pages
  api/auth/               Login consumption and session revocation
  api/cases/[id]/         Tenant-scoped case projection
  api/health/             Database health check
  login/                  One-time-link sign-in
  returns/, r/[token]/    Customer portal introduction (intake deferred)
src/components/           Shell, navigation, case table and local shadcn/ui components
src/lib/                  Auth primitives, server-only DB, money and Zod boundaries
src/server/services/      Database-backed auth and merchant query services
prisma/                   Foundation schema, reviewed SQL migration and synthetic seed
scripts/                  Local PostgreSQL, migrations, login issuance and test wrappers
tests/                    Unit, real PostgreSQL integration, and Playwright suites
docs/                     Preserved Phase 0 designs plus implementation evidence
```

Merchant routes: `/dashboard`, `/cases`, `/cases/[id]`, `/portal`, `/analytics`, `/settings`; `/insights` redirects to `/analytics`. The dashboard and cases read PostgreSQL records. Analytics/customer intake are explicitly labeled introductions with no fake working controls. All merchant pages require a verified DB session; the customer introduction is public and exposes no order data. There is no public order lookup or HTTP login-link issuer.

The schema implements the Phase 1 subset of the approved model: Merchant, User, Session, AccessToken, MerchantPolicy, Product, Order, ReturnCase and AuditLog. Composite tenant foreign keys, integer money checks, purpose-bound token targets, one active case per order and append-only audit triggers are in the migration. Payment, refund, quote, consent and AI tables arrive with their corresponding milestones, as allowed by the Phase 0 incremental plan. No financial execution is implied by having a seeded policy or case.

Auth uses random 256-bit credentials hashed at rest, atomic single-use consumption, exact-origin mutation checks, bounded request bodies, HttpOnly/SameSite cookies (Secure on HTTPS), and session revocation. Login has a bounded process-local rate limiter; public/multi-instance hosting needs shared/ingress limits and a reviewed credential delivery process. Human approval authorization and payment execution require a separate Phase 2 review. See [architecture decisions](docs/decisions.md).

## Phase 2 prerequisites

1. Keep PostgreSQL running; apply the committed migration and pass the foundation checks, including fresh auth/tenant security review (`/review`) before enabling financial actions.
2. Inspect/install APIMatic's PayPal context plugin and record exact version, generated guidance/files and licensing; cross-check it against current official PayPal docs.
3. At the actual integration step, privately configure one sandbox REST app's client ID/secret and matching business merchant ID; use a sandbox personal buyer for approval. Never provide secrets in chat. There is no production-money toggle.
4. Authorize external account access when needed. A webhook integration also needs an approved public HTTPS listener and the webhook ID for that same sandbox app; hosting/tunnel setup is a separate step.
5. Implement and test durable create/capture/refund records, merchant approval, immutable money/terms, persistent request IDs, balance reservations, verification and conservative reconciliation. Confirm endpoint-specific idempotency retention before enabling POST retries.
6. Complete and verify a genuine sandbox create/approve/capture/refund flow. Synthetic seed data and fixture tests cannot satisfy that gate.

See [milestone plan](docs/implementation-plan.md), [data model](docs/data-model.md), [risk register](docs/risks.md), and [progress](docs/progress.md). The existing MIT [LICENSE](LICENSE) applies. Vendored UI follows shadcn/ui's MIT components; dependencies retain their own licenses. The local PostgreSQL launcher is MIT and its bundled binaries have separate upstream licenses; it is a development-only dependency.
