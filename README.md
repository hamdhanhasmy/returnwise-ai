# ReturnWise AI

**Public judge demo:** [ReturnWise AI on Render](https://returnwise-ai-t6sv.onrender.com/demo). HTTPS, desktop/mobile exploration, secure merchant sign-in and persistence across an actual Render restart were verified on 12 November 2026. Free services can take time to wake. Follow the [strictly $0 Render/Supabase runbook](docs/phase-7a-deployment.md) for settings and limitations. `/demo` is a read-only published snapshot, separate from merchant accounts and the hosted ledger; it makes no AI or PayPal calls. Keep local `.env` and hosted operator `.env.render` separate; never run tests or development fixture seeds against the hosted database. AG Studio public permission remains unresolved, so the public view uses an explicitly labeled ordinary-table fallback. Hosted customer upload, new AI inference and webhook delivery have not been verified; genuine private Supabase storage and restart persistence have.

A sandbox-only merchant workspace for careful return resolution. Phase 2.5 verified a genuine $1.00 capture, $0.40 + $0.60 refunds and authenticated webhooks. Phase 3 adds private customer intake, versioned policies and integer economics; Phase 4 adds consent-based private images and budget-controlled DeepSeek observations. Phase 5 verified a new $5.00 Sandbox capture → synthetic customer evidence → genuine DeepSeek assessment → human review/approval → $5.00 completed refund → closed case. Phase 6 adds native AG Studio analytics with interactive reports and a bounded, read-only DeepSeek analytics runner. AI cannot approve or price remedies; a separate final merchant confirmation executes the exact approved refund. Automated mocks and synthetic scenarios are separate from genuine provider operations.

Open **Analytics** at `/analytics` after signing in. Explore Return overview, Economics lab and Case explorer, filter source/category/time, customize Studio widgets and save the layout for your merchant in this browser session. Verified Sandbox refund totals and configured/modelled economics have distinct labels. Charts cover up to 500 recent cases; the case list paginates all matching records. Historical untrusted dates are excluded from trends. Mobile reports support charts, filters, grids and case navigation; layout editing and the optional native assistant require a desktop-sized window. See [Phase 6 architecture, metrics, privacy and verification](docs/phase-6-analytics.md).

The optional native Studio assistant requires an administrator, configured `AI_ENABLED=true`/`DEEPSEEK_API_KEY` and the explicit on-page question-processing consent. Choose **Open AI assistant** to open Studio's edit-mode assistant panel. Each standalone question uses at most one bounded tool-selection request under the existing shared cap; exact aggregate answers come from the server. Questions are not stored in plaintext and no photographs/customer records are sent. Do not enter personal data. CI disables provider credentials. Local AG Studio evaluation works without a licence; hosted use requires an appropriate trial/commercial Studio licence including AI entitlement. Configure `NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY` privately and rebuild; this vendor browser entitlement is intentionally public, while DeepSeek/PayPal API secrets remain server-side. The project MIT licence does not relicense commercial dependencies.

Follow the [Phase 5 demo walkthrough](docs/phase-5-demo.md) and [orchestration/security report](docs/phase-5-orchestration.md). `npm.cmd run demo:setup` prepares a fictional $5 product and versioned demonstration policy without making provider requests. It never purchases or refunds automatically. The historical $1 capture is fully refunded and must not be reused.

Start with local setup below, then follow the [PayPal Sandbox runbook](docs/paypal-sandbox.md) or [Phase 3 return-management guide](docs/return-management.md). See [genuine Sandbox evidence](docs/phase-2.5-verification.md) and [Phase 3 verification](docs/phase-3-verification.md).

For optional image analysis, follow the [DeepSeek setup, privacy and verification guide](docs/phase-4-deepseek.md) and [measured synthetic evaluation](docs/deepseek-evaluation.md). Privately configure `DEEPSEEK_API_KEY`, `AI_ENABLED=true` and `AI_SPENDING_CAP_USD=0.25` in `.env`, apply migrations, then restart the app. No OpenAI key is needed. Existing cases show **Open evidence workspace**; customers upload and consent separately, and an authenticated merchant explicitly requests analysis. Human review remains mandatory.

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

The example contains placeholders only. The application validates PostgreSQL URLs, application origin and sandbox-only mode, reporting field names without values. Missing database configuration leaves `/login` and `/returns` usable; authenticated database views require setup and `/api/health` reports HTTP 503. Keep provider credentials unset to explore the foundation safely. To enable genuine Sandbox operations, privately configure the server credentials and explicitly bind a merchant using the [Sandbox runbook](docs/paypal-sandbox.md).

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

`GET /api/health` performs a bounded database connectivity check: HTTP 200 with `database: connected`, or HTTP 503 with `unconfigured`/`unavailable`. It never returns connection strings. AI reports `disabled`; payments report `disabled` without valid local configuration, or `sandbox-configured-not-probed` when credentials are syntactically configured. Health does not authenticate with PayPal or claim payment success.

CI is defined in `.github/workflows/ci.yml`: isolated PostgreSQL, generation/migrations/seed, lint, typecheck, unit/integration tests, build, and Playwright. Local verification results are in [docs/phase-1-verification.md](docs/phase-1-verification.md); a checked-in workflow is not a claim that remote CI has run.

## Structure and routes

```text
src/app/                  App Router pages, layouts and thin HTTP handlers
  (merchant)/             Authenticated merchant shell and pages
  api/auth/               Login consumption and session revocation
  api/cases/[id]/         Tenant-scoped case projection
  api/health/             Database health check
  login/                  One-time-link sign-in
  returns/                Private customer intake, case status and offer responses
  api/returns/            Scoped customer access, policy versions and case actions
src/components/           Shell, navigation, case table and local shadcn/ui components
src/lib/                  Auth primitives, server-only DB, money and Zod boundaries
src/server/services/      Database-backed auth and merchant query services
prisma/                   Foundation schema, reviewed SQL migration and synthetic seed
scripts/                  Local PostgreSQL, migrations, login issuance and test wrappers
tests/                    Unit, real PostgreSQL integration, and Playwright suites
docs/                     Preserved Phase 0 designs plus implementation evidence
```

Merchant routes: `/dashboard`, `/cases`, `/cases/[id]`, `/portal`, `/analytics`, `/settings`, `/checkout`, `/transactions`, `/transactions/[id]`; `/insights` redirects to the implemented AG Studio analytics page. All merchant pages require a verified DB session. Customer order details require an expiring private capability; there is no public order lookup or HTTP login-link issuer. The old `/r/[token]` route is only a redirect; issue fragment-based links through Customer portal.

The schema reuses Merchant, User, Session, AccessToken, MerchantPolicy, Product, Order, ReturnCase and AuditLog. Composite tenant foreign keys, integer money checks, purpose-bound tokens and append-only audit triggers protect the foundation. Phase 2 adds Payment, CheckoutOperation, RefundApproval, RefundOperation, ProviderRefund and WebhookEvent. Phase 3 adds ReturnEvaluation and ReturnProposal, versioned return policies and immutable case snapshots. No financial execution is implied by a seeded case or a merchant-approved return resolution.

Auth uses random 256-bit credentials hashed at rest, atomic single-use consumption, exact-origin mutation checks, bounded request bodies, HttpOnly/SameSite cookies (Secure on HTTPS), and session revocation. Login has a bounded process-local rate limiter; public/multi-instance hosting needs shared/ingress limits and a reviewed credential delivery process. Payment execution rechecks active administrator scope, persisted ownership, policy, exact consent/approval and refundable capacity. See [architecture decisions](docs/decisions.md).

## Phase 2 external verification prerequisites

1. Apply migrations; keep separate development/test databases and pass local checks.
2. Privately configure one Sandbox REST app, its business merchant ID, and a separate personal buyer. Bind the local merchant with `npm.cmd run paypal:configure -- --merchant=11111111-1111-4111-8111-111111111111`. Never send secrets in chat.
3. Complete genuine checkout approval, capture, full refund and sequential partial refunds using the [runbook](docs/paypal-sandbox.md). Record verified provider IDs/statuses.
4. Register an HTTPS webhook on the same Sandbox app, set its ID locally, and verify actual event delivery. Simulator postback verification is intentionally unsupported.
5. Phase 2.5 used installed APIMatic PayPal guidance for a targeted persistence/retry review and a regression test. The existing REST adapter remains in place. See [sponsor evidence](docs/sponsor-integrations.md).
6. Review high-risk changes before public use. Phase 2.5 verified the genuine Sandbox lifecycle; its historical timestamp caveat remains documented.

See [milestone plan](docs/implementation-plan.md), [data model](docs/data-model.md), [risk register](docs/risks.md), and [progress](docs/progress.md). The existing MIT [LICENSE](LICENSE) applies. Vendored UI follows shadcn/ui's MIT components; dependencies retain their own licenses. The local PostgreSQL launcher is MIT and its bundled binaries have separate upstream licenses; it is a development-only dependency.

### Genuine Sandbox smoke check (PowerShell)

After privately configuring `.env`, use these explicit operator commands. They are separate from automated mock tests:

```powershell
npm.cmd run paypal:verify -- --oauth
npm.cmd run paypal:configure -- --merchant=11111111-1111-4111-8111-111111111111 --verification-product
# Complete buyer approval and merchant-confirmed refund in the browser first.
# Replace PAYMENT_UUID with the internal UUID from /transactions/<UUID>:
npm.cmd run paypal:verify -- --merchant=11111111-1111-4111-8111-111111111111 --payment=PAYMENT_UUID
```

The optional product is fictional and costs $1.00 USD. `paypal:verify` authenticates and retrieves provider records without creating/capturing/refunding or writing database data; it prints only sanitized provider references. Read its statuses: OAuth success alone does not prove a capture or refund. [Phase 2.5 evidence](docs/phase-2.5-verification.md) records the genuine $1.00 capture, completed $0.40 + $0.60 refunds, verified webhook and duplicate delivery, separate from mock tests. Follow the [webhook runbook](docs/paypal-sandbox.md) for the endpoint-only HTTPS tunnel. Database connections explicitly use UTC; older records' timestamp caveat is documented in the evidence report and no historical data was rewritten.
