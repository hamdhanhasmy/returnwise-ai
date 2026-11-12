# ReturnWise AI

**Explainable return decisions. Human approval. Verified PayPal refunds.**

[Try the public demo](https://returnwise-ai-t6sv.onrender.com) · [Judge setup](docs/judge-setup.md) · [Demo walkthrough](docs/phase-5-demo.md) · [Sponsor evidence](docs/sponsor-evidence.md) · [Release checks](docs/phase-7-release.md)

A damaged product can cost more to return and inspect than a merchant can recover from it. ReturnWise brings private customer evidence, merchant policy, explicit financial assumptions and verified payment state into one careful return-resolution workflow. AI supplies observations and uncertainty; deterministic rules calculate eligible options; a human authorizes the exact remedy.

## Try it as a judge

Open **https://returnwise-ai-t6sv.onrender.com** and choose **Try demo**. No sign-in or credentials are needed. Explore fictional return cases, filter source/category/time, compare configured economics, and inspect the published genuine DeepSeek assessment and sanitized completed PayPal Sandbox history.

**The hosted judge demo is read-only.** It uses reviewed published snapshots, separate from the hosted payment ledger. It does not submit new returns, upload customer evidence, call paid AI or issue refunds. The full application is reproducible locally with [complete setup and provider prerequisites](docs/judge-setup.md). A fresh seed never fabricates successful provider records. Free cold starts may take time.

| Capability | Public judge demo | Full local application |
| --- | --- | --- |
| Case exploration and financial comparison | Sanitized fictional/published snapshots | Authenticated persisted cases and versioned policies |
| DeepSeek evidence observations | Previously stored genuine synthetic-image result | Private upload, consent and budgeted analysis with configured credentials |
| PayPal history | Published completed Sandbox references | Official buyer approval, verified capture, exact authorized refund and reconciliation |
| AG Studio | Labeled ordinary-table fallback pending hackathon key/domain activation | Actual Studio 3.1.0 charts, grids, layouts and native read-only agent |
| Customer submission / merchant actions | Unavailable | Scoped expiring links, human review, exact acceptance/approval and audit trail |

## See the product

![Public homepage with Try demo entry](docs/images/public-home.png)
*Public HTTPS homepage: judges enter without an administrator link.*

![Actual local AG Studio charts and grids](docs/images/ag-studio-local.png)
*Actual local AG Studio 3.1.0; verified Sandbox amounts and modeled economics are separate. This is not the public table fallback.*

[Stored assessment and verified-case screenshot](docs/images/public-case.png) · [Genuine cached native Studio assistant](docs/images/ag-studio-agent-local.png). Screenshot provenance and privacy review: [image index](docs/images/README.md).

## How it works

1. Customer access is order-scoped and expiring. Evidence images are validated, normalized and stored privately, with separate consent before DeepSeek processing.
2. DeepSeek Flash vision returns strict Zod-validated observations, uncertainty and missing information. It cannot set a price, interpret entitlement conclusively, approve a case or call PayPal.
3. The deterministic engine evaluates immutable policy/input snapshots with integer currency minor units. For equivalent full remedies: **physical-return cost = refund + shipping + handling/disposal − estimated recovery**. Missing or unreliable inputs route to manual review; partial offers require exact customer agreement.
4. A merchant reviews the evidence and exact terms. Final financial authorization is separate from approving a resolution; physical returns require receipt where applicable.
5. Existing PayPal Orders v2/Payments v2 services reserve the exact refund, use persistent request IDs, verify provider status and reconcile uncertainty. A case closes only after verified completion and a reconciled ledger.

The original three synthetic scenarios yield two comparable full remedies and one manual review: **$178 physical-return baseline versus $165 selected cost = $13 modeled cost avoidance**. This is not measured merchant revenue or savings. The separate $5 demo case contributes a further configured $2.75 comparison; the all-source $15.75 dashboard must not be presented as the original three-scenario result.

## Architecture

~~~mermaid
flowchart LR
  Customer[Scoped customer portal] --> App[Next.js server services]
  Merchant[Authenticated merchant] --> App
  App --> DB[(Prisma / PostgreSQL)]
  App --> Storage[Private evidence storage]
  App --> AI[DeepSeek observations only]
  AI --> Review[Deterministic policy and economics / human review]
  Review --> App
  App --> PayPal[PayPal Sandbox capture / refund / reconciliation]
  DB --> Projection[Tenant-scoped read-only analytics]
  Projection --> Studio[AG Studio reports and bounded native agent]
~~~

Single Next.js App Router application; strict TypeScript, React, Tailwind/shadcn, PostgreSQL, Prisma, Zod, Vitest and Playwright. Detailed [architecture](docs/architecture.md), [financial orchestration](docs/phase-5-orchestration.md), [return management](docs/return-management.md).

## Genuine verification and sponsor integrations

- **PayPal Sandbox:** independently verified $1 capture → $0.40 + $0.60 refunds, authenticated genuine webhooks; separate **$5 capture → genuine DeepSeek assessment → human review/approval → $5 completed refund → closed case**. Both captures are fully refunded. Do not reuse them. [Phase 2.5](docs/phase-2.5-verification.md), [Phase 5](docs/phase-5-orchestration.md).
- **DeepSeek:** consent-based private image observations, durable deduplication/cache, shared spending reservations, bounded requests and persistent usage/cost. Twenty synthetic evaluation requests cost an estimated $0.006344082, with 20 cached repeats; this does not establish real-photo accuracy. [Evidence/AI guide](docs/phase-4-deepseek.md), [evaluation](docs/deepseek-evaluation.md).
- **AG Studio 3.1.0:** native charts/grids/filtering/editable reports plus Agent Framework custom DeepSeek runner. One genuine analytics tool selection used 589 input / 17 output tokens, estimated $0.0001971; exact $6.00 Sandbox refund aggregate was server-computed and a repeat was cached. The [sponsor hackathon post](https://www.ag-grid.com/blog/build-a-payments-dashboard-without-building-a-dashboard/#whats-next-the-paypal-ai-hackathon) offers judging-period key support. Public activation remains pending; the genuine local implementation is preserved. [Sponsor evidence/inquiry](docs/sponsor-evidence.md), [Phase 6](docs/phase-6-analytics.md).
- **APIMatic:** installed PayPal Context Plugin 0.4.1 informed durable-intent/retry/error review and a concrete outbound-call persistence regression. Existing REST adapter retained; no generated SDK claim. [Provenance](docs/sponsor-integrations.md).
- **Render / Supabase:** Free HTTPS Node service and Free PostgreSQL, restricted DB role, private JPEG-only Supabase bucket, durable storage quota and actual restart-persistence verification. No paid hosting/disks/upgrades. [Deployment settings](docs/phase-7a-deployment.md).

## Security, privacy and limits

Tenant-scoped queries, hashed expiring capabilities, exact-origin mutations, Secure/HttpOnly production sessions, append-only audit history, integer money, exact offer versions, durable financial reservations and verified webhooks protect the workflow. Evidence is private; browser code receives no privileged storage/provider credentials. DeepSeek spend is reserved server-side, including concurrent work, and cached results avoid repeated charges. Manual review remains available when AI/data/policy is insufficient.

Sandbox-only prototype: no real funds, paying customers, measured business savings or legal certification. Historical pre-fix timestamps remain conservatively flagged. Shared ingress limits, retention operations, real-photo evaluation and independent security review remain production work. Hosted customer upload/new AI/webhook delivery are not claimed verified. Current Render DB expires **12 December 2026**, before judging finishes; follow the **[strictly $0 continuity plan](docs/database-continuity.md)** before expiry. No Neon migration or paid renewal has happened.

## Submission and reproducibility

- [Copy-ready Devpost description](docs/devpost-submission.md)
- [2:50 video script, recording order and YouTube description](docs/demo-video-script.md)
- [Submission checklist and remaining manual actions](docs/submission-checklist.md)
- [Final release commands, test results and security checks](docs/phase-7-release.md)
- [Environment-variable template](.env.example): keep actual credentials in ignored local/operator files; do not publish them as judge access.

Public source: https://github.com/hamdhanhasmy/returnwise-ai. **MIT [LICENSE](LICENSE)** covers project code; dependencies, commercial AG Studio entitlement and bundled PostgreSQL retain their own terms. **YouTube: [REQUIRED PUBLIC VIDEO URL — add before submission].** The project has not been submitted to Devpost by this repository.

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
