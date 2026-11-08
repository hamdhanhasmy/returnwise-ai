# Phase 1 implementation and verification

Date: 2026-11-08. Status: foundation implemented and local verification passed. This record contains observed results only. Phase 0 planning files are retained; progress and decisions receive append-only implementation notes. Formal `/review` sign-off remains a gate before financial integration.

## Implemented scope

- Next.js 16.4.5 App Router, React 19.3.1, strict TypeScript 6.0.3, Tailwind 4.3.5, locally owned shadcn/ui primitives and responsive merchant shell.
- Prisma 7.10.1 with PostgreSQL adapter. The Phase 1 schema contains the nine foundation models from the approved incremental design; later payment/quote/consent/AI models remain milestone work.
- One reviewed initial migration: composite tenant foreign keys, BigInt money/check constraints, token-target checks, active-case uniqueness and audit UPDATE/DELETE/TRUNCATE protection. Payments are disabled by a foundation DB constraint as well as the absence of provider code.
- Real project-local PostgreSQL 18 through a pinned development-only launcher, loopback-bound with random ignored credentials. Dedicated dev/test databases, persistent local data, no system-service/user changes and no destructive resets.
- Idempotent two-merchant seed, three A/B/C scenarios and a separate tenant B case. No payment IDs or provider outcomes.
- Hashed one-time login links, atomic consumption, hashed revocable sessions, origin validation, bounded form input and bounded process-local login throttling. Tenant data services derive scope from the session.
- `/dashboard`, `/cases`, case detail, `/portal`, `/analytics`, `/settings`, `/login`, public `/returns`, and a scoped-link introduction. Future capabilities are explicitly unavailable.
- `/api/health` checks actual DB connectivity and reports unavailable/missing configuration with 503; case API uses minimized DTOs with minor-unit strings.
- Unit/integration/desktop+mobile Playwright infrastructure, PostgreSQL CI workflow and local setup/runbook.

## Commands and observed results

| Command | Result |
| --- | --- |
| `npm.cmd view … version` | Resolved versions; initial sandbox request failed EACCES, retry with approved network access succeeded |
| `npm.cmd install --save-exact …` and dev dependency install | Installed pinned dependencies; no global packages changed |
| `npm.cmd audit --json` (initial) | Eight moderate findings tracing to a development-only minimatch dependency |
| Scoped minimatch override + `npm.cmd install --save-dev --save-exact prettier @types/node@24` | Install reported zero vulnerabilities; no framework downgrade or forced audit fix |
| `npm.cmd run db:validate` | Passed |
| `npm.cmd run db:generate` | Passed with Prisma 7.10.1 |
| `node node_modules/prisma/build/index.js migrate diff --from-empty --to-schema prisma/schema.prisma --script --output prisma/migrations/202611080001_foundation/migration.sql` | Generated initial SQL; added explicit reviewed safety constraints before applying |
| `npm.cmd run db:local` | First sandbox attempt hit blocked user-profile lookup; approved retry then exposed missing ESM package setting; fixed `type: module`; final run started PostgreSQL on loopback |
| `npm.cmd run db:migrate` | Applied initial migration to development DB |
| `npm.cmd run db:migrate:test` | Sandbox TypeScript CLI hit user-profile restriction; approved retry applied migration to separate test DB |
| `npm.cmd run db:seed` | Passed; two merchants/four synthetic cases, zero payments |
| `npm.cmd run test:integration` | Seven tests passed against real PostgreSQL |
| `npm.cmd run typecheck` (initial) | Found invalid inline Playwright globalSetup; changed to supported setup module; subsequent run passed |
| `npm.cmd run lint` (initial) | One anonymous-default-export warning; named the PostCSS config; subsequent run passed with zero warnings |
| `npm.cmd test` (final) | **20 passed** across five files, including health-failure redaction and throttling |
| `npm.cmd run build` (final) | **Passed**; authenticated pages dynamic, public introduction static; no provider calls |
| `npm.cmd run test:e2e:install` | Sandbox user-cache write denied; approved retry downloaded Chromium, then redundant headless-shell extraction hit ENOSPC. Stopped retry and selected supported `channel: chromium` / `--no-shell`; final install passed |
| `npm.cmd run test:e2e` (first) | Four passed/four failed: `no-referrer` made real browser form Origin null; changed header to `same-origin`, keeping strict CSRF enforcement. Initial Windows sandbox teardown hung; stopped owned runner/server and reran with approved process access |
| `npm.cmd run test:e2e` (second) | Seven passed/one failed: mobile alert locator also matched Next's route announcer; narrowed locator to the actual login error |
| `npm.cmd run test:e2e` (final) | **8 passed in 21.1 seconds**, desktop Chromium and mobile viewport emulation; real production server + PostgreSQL test DB |
| `node node_modules/prisma/build/index.js migrate status` | Database schema up to date |
| Inline Node document/source checks | 94 source files examined, 32 local Markdown links checked, no missing links/trailing whitespace/newline issues at check time |
| `git check-ignore .env .local/postgres/PG_VERSION artifacts/dashboard-chromium.png` | Confirmed local credentials, DB data and screenshots are ignored |
| `git -c core.safecrlf=false diff --check` (final) | Passed using repository newline rules. An earlier command-local `core.autocrlf=false` check misclassified CRLF endings as whitespace; no repository-wide newline normalization was performed |

Final `npm.cmd run typecheck` and `npm.cmd run lint` also exited 0. Desktop and mobile screenshots in ignored `artifacts/dashboard-chromium.png` and `artifacts/dashboard-mobile.png` were visually inspected; no body overflow was detected in browser assertions. Mobile navigation/table contents scroll within their containers. Browser tests covered health, login fragment removal, unauthorized API/page access, exact-origin rejection, tenant isolation, case DTO serialization, navigation, invalid login, sign-out and revoked-session access.

The header correction follows [MDN's documented Origin/referrer interaction](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy#effect_on_the_origin_header); Chromium new headless selection follows [Playwright browser guidance](https://playwright.dev/docs/browsers#chromium-new-headless-mode). Browser/Node color-environment warnings were informational. No application check remains failing. A local passing CI-equivalent sequence is not evidence of a remote GitHub Actions run. No PayPal/OpenAI call or external-account action has occurred.

## Files changed

Root: `.gitignore`, `.env.example`, `.npmrc`, `README.md`, `package.json`, `package-lock.json`, `tsconfig.json`, `next-env.d.ts`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `components.json`, `prisma.config.ts`, `vitest.config.ts`, `vitest.integration.config.ts`, `playwright.config.ts`.

Database: `prisma/schema.prisma`, `prisma/migrations/migration_lock.toml`, `prisma/migrations/202611080001_foundation/migration.sql`, `prisma/fixtures.ts`, `prisma/seed-data.ts`, `prisma/seed.ts`.

Scripts: `scripts/database.ts`, `scripts/local-postgres.ts`, `scripts/issue-login-link.ts`, `scripts/run-local.ts`, `scripts/migrate-test.ts`, `scripts/test-integration.ts`.

App Router: root layout/page/styles/error/not-found, merchant layout/loading, dashboard, case queue/detail, portal, analytics/insights/settings, login, returns introduction, scoped return introduction; auth login/logout, health and read-only case API handlers under `src/app/`.

Components: brand, page heading, cases/status table, feature introduction, login form, shell/navigation and shadcn-style Button/Card/Badge/Input under `src/components/`.

Services/utilities: `src/server/services/auth.ts`, `src/server/services/merchant.ts`, `src/lib/auth/{tokens,session,rate-limit}.ts`, `src/lib/db/client.ts`, `src/lib/money/index.ts`, `src/lib/validation/{env,http}.ts`, `src/lib/utils.ts`.

Checks/docs: five unit files, one PostgreSQL integration file, browser suite/setup under `tests/`; `.github/workflows/ci.yml`; append-only additions in `docs/progress.md` and `docs/decisions.md`; this verification record. Generated Prisma/Next output and local `.env`/database/browser artifacts are excluded. Existing AGENTS, blueprint, Phase 0 designs, phase prompts and MIT license were not rewritten. Nothing was staged, committed or deployed.

## Review scope and limitations

Manual foundation review covers session/token lifecycle, tenant relations/queries, CSRF, data serialization, disabled integrations, seed safety, audit protection and environment redaction. No first-class `/review` tool is exposed in this execution session; a formal review-mode pass remains a Phase 2 prepayment gate. The foundation is local-only; deployment is not authorized by this phase.

Review corrections: sanitize malformed-origin/local-URL errors, require HTTPS for non-loopback application origins, add bounded login work, remove a nonfunctional merchant-switch chevron, preserve same-origin form headers, and tighten the browser error assertion. Payment/AI paths were searched for external-call implementations; none exist. Health failure behavior and tenant constraints have negative tests.

Process-local login throttling protects one app process; public/multi-instance hosting needs shared or ingress limits. The operator issuing credentials has DB access; treat that CLI as privileged. Local development uses a DB-owner role for convenience, so a deliberately privileged operator could alter triggers; a hosted runtime must have restricted grants and a separate migration owner. Full approval/payment/audit-ledger invariants are not implemented until their relevant milestones.

## Exact Phase 2 entry prerequisites

1. Start dedicated PostgreSQL, apply development/test migrations, seed, and retain passing foundation checks. Complete the required formal `/review` of auth/tenant controls before payment operations.
2. Inspect/install APIMatic's context plugin and read its actual versioned guidance; record its generated changes/license and validate against current official API references.
3. Privately supply one sandbox REST app's `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, and matching `PAYPAL_MERCHANT_ID` at the integration step. `PAYPAL_ENV` stays `sandbox`. Have a sandbox personal buyer ready for the user's approval interaction. Never paste credentials into chat.
4. Obtain the contract's authorization before accessing external accounts. Enabling webhooks additionally requires an approved reachable HTTPS listener and the same app's `PAYPAL_WEBHOOK_ID`. No deployment or account change is preauthorized by Phase 1.
5. Implement reviewed additive payment/operation/refund migrations and human approval gates, request-key persistence, locks/reservations, status verification and reconciliation. Confirm endpoint-specific idempotency retention before enabling POST replay; unknown outcomes must remain blocked.
6. Record actual verified order/capture/refund IDs from a genuine sandbox flow. Foundation seeds, mocked providers and future credentials alone do not meet the Phase 2 gate.

No local implementation/runtime blocker remains. Model access, Studio licensing and advanced customer intake remain their own later milestones, not credentials needed for Phase 2.

Temporary service teardown: Playwright stopped its production test server, and the project-local PostgreSQL process was stopped after verification. A loopback socket probe confirmed port 55432 closed. Its ignored data directory and local credentials remain for the next `npm run db:local` startup.

## Follow-up: completed Phase 1 review and P2 isolation fix

The user subsequently invoked `/review`. It identified one P2: direct Vitest could bypass the integration wrapper's database selection and mutate development. This follow-up resolves that finding; the earlier note about the Phase 1 review still being outstanding is historical. Phase 2 financial changes still require their own review and authorization gates.

Root cause and implementation: [test database isolation](test-database-isolation.md). Configuration now validates before collection, and the test factory independently validates and probes actual server identity before creating Prisma or seeding. The npm wrapper no longer changes `DATABASE_URL`; the guarded migration runner verifies before spawning Prisma. No schema, migration, provider, auth or product behavior was changed.

### Commands and actual results for this fix

| Command/check | Actual result |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0 |
| `npm.cmd run lint` | Exit 0; zero warnings |
| `npm.cmd test` | Exit 0; **59 tests passed** in seven files, including 39 new regression cases |
| Direct Vitest negative subprocesses inside unit suite | Missing, malformed and equivalent test URLs each exited **1 as expected**, before collection and with **zero TCP connection attempts** |
| `npm.cmd run db:migrate:test` | Sandbox `tsx` user-profile lookup failed before execution; approved retry exited 0, verified `returnwise_test`, no pending migrations |
| `npm.cmd run test:integration` | Same sandbox wrapper restriction; approved retry exited 0, **7 tests passed** against the verified isolated DB |
| `npx.cmd vitest run --config vitest.integration.config.ts` | Exit 0; **7 tests passed** with no npm wrapper or manual environment rewriting |
| `npm.cmd run build` | Exit 0; production build passed |
| `npm.cmd run test:e2e` | First sandboxed run completed all eight assertions but stalled at server teardown. Stopped only its identified Next server on port 3100; runner then exited 0. Approved rerun **8 passed in 19.4s**, exited 0 with normal teardown |
| Development DB inspection | Read-only `current_database()` confirmed `returnwise_dev`; before/after counts and test-marker counts unchanged |

The Vite runner emitted an informational future-native-config warning about an extensionless config import; it did not fail. Browser color-environment warnings were informational. Remote GitHub Actions was not run. The checked-in CI uses the same guarded migration/integration entry points and unit regressions.

The database and development app were already running at the start of this follow-up and were not stopped. No secrets were printed, committed or requested. Read-only inspection found no `TEST_APPEND_ONLY` events, disabled integration users or epoch-expiry sessions in development. Normal demo fixtures and two auth records alone are not evidence of contamination; a prior partial run cannot be ruled out. No database cleanup/reset/deletion was performed.

### Files changed for the fix

- `src/lib/validation/env.ts`: strict test-target validation and canonical database-name comparison.
- `scripts/test-database.ts` (new): read-only identity verification and explicit test-only Prisma factory.
- `scripts/test-integration.ts`, `scripts/migrate-test.ts`: preserve runtime identity; verify before test migration launch.
- `vitest.integration.config.ts`, `tests/integration/foundation.test.ts`: entry-point and client-initialization guards.
- `tests/e2e/setup.ts`, `tests/e2e/foundation.spec.ts`: reuse verified factory before fixture/auth writes.
- `tests/unit/test-database.test.ts`, `tests/unit/integration-entrypoint.test.ts` (new): configuration, live-identity and direct-execution regressions.
- `.env.example`, `README.md`, `docs/test-database-isolation.md` (new), `docs/decisions.md`, `docs/progress.md`, this verification record: setup rules, rationale and evidence. Next's generated type-reference file may be refreshed by the build.

No remaining blocker for finalizing the local Phase 1 foundation was found. Database tests intentionally stop if either configured database is unavailable or cannot prove its expected identity. No destructive cleanup capability was added. Phase 2 has not started.
