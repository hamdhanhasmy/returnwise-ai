# Phase 2 implementation and evidence

Historical Phase 2 implementation report, 2026-11-09. At that checkpoint genuine Sandbox verification was pending. **See [Phase 2.5 verification](phase-2.5-verification.md) for subsequent genuine capture/refund evidence and current gates.** No Phase 3 work was performed.

## Initial inspection

Read AGENTS, blueprint, phase prompts, architecture/data model/provider/sponsor notes, Prisma schema/migration, auth/tenant services, routes, test setup and the Phase 1 database-isolation fix. The implementation retains Next.js/Prisma/PostgreSQL and the verified test factory.

Credential presence check (values not printed): `PAYPAL_ENV=sandbox`; client ID, secret, merchant ID and webhook ID are missing/placeholders. No authenticated PayPal request has run. No genuine create, approval, capture, refund or webhook delivery is verified.

APIMatic: no PayPal/APIMatic plugin files found under the repository or inspected Codex skills/plugin locations; available tools expose no PayPal/APIMatic connector. Official PayPal documentation is the fallback authorized by the user. No installed-plugin contribution or sponsor compliance is claimed.

## Official references checked for implementation

- [OAuth client credentials](https://developer.paypal.com/api/rest/authentication/).
- [Create order](https://developer.paypal.com/api/orders/v2/orders-create), [capture order](https://developer.paypal.com/api/orders/v2/orders-capture), [order retrieval](https://developer.paypal.com/api/orders/v2/orders-get).
- [Capture retrieval](https://developer.paypal.com/api/payments/v2/captures-get), [refund creation](https://developer.paypal.com/api/payments/v2/captures-refund), [refund retrieval](https://developer.paypal.com/api/payments/v2/refunds-get).
- [Current JavaScript SDK v6 setup](https://developer.paypal.com/sdk/js/set-up) and [checkout quick start](https://developer.paypal.com/checkout/integrate). v6 sandbox script, client-ID authentication, eligibility check, one-time payment session and `{orderId}` promise contract; do not copy v5 Buttons methods.
- [Request idempotency](https://developer.paypal.com/api/rest/requests/): the refund example documents retention up to 45 days. Application design limits explicit same-payload/same-key refund retries to 24 hours. Create/capture ambiguous POSTs are not automatically replayed.
- [Webhook integration](https://developer.paypal.com/api/rest/webhooks/rest/) and [postback verification](https://developer.paypal.com/api/webhooks/v1/verify-webhook-signature-post). Simulator messages do not support postback verification and cannot establish genuine webhook evidence.

## Milestone log

1. Added fixed-sandbox provider client, schemas and money serialization. GET reconciliation may retry once; financial POSTs never retry automatically. Minimal POST receipts are followed by authoritative GET validation; capture receipts can omit the full order fields.
2. Added Payment, CheckoutOperation, RefundApproval, RefundOperation, ProviderRefund, WebhookEvent and audit links. Reviewed generated migration is additive, preserves prior data, adds immutable request/approval protections, and replaces the Phase 1 all-disabled guard with a merchant-binding check. Existing merchants remain disabled.
3. Prisma validation initially caught missing composite uniqueness; fixed. Validation/generation passed. `db:migrate:test` hit the known sandbox `tsx` profile restriction; approved retry applied `202611080002_payments` to verified `returnwise_test`. After payment tests passed, `npm.cmd run db:migrate` applied the same additive migration to development. Existing data was preserved; no reset/delete/truncate was run.
4. Completed tenant-scoped payment/refund services, exact policy and buyer-consent checks, short locking/reservation transactions, crash recovery and explicit same-key refund retry. Added verified webhook processing, bounded authenticated JSON routes, merchant-binding CLI, SDK v6 checkout, searchable transactions, verified provider detail, refund review/dialog and audit timeline.
5. Added provider HTTP mocks, isolated PostgreSQL payment tests, and desktop/mobile browser coverage. No production runtime mock flag or fake payment success path exists. Browser tests deliberately unset all PayPal credentials and use explicit request interception only for the separately labeled refund UI test.

## Actual verification results

| Command / check | Observed result |
| --- | --- |
| `npm.cmd run db:generate` | Passed; Prisma client regenerated |
| `npm.cmd run db:validate` | Passed, including final schema validation |
| `npm.cmd run db:migrate:test` | Passed after approved process-access retry; isolation verified before migration |
| `npm.cmd run db:migrate` | Passed; additive payment migration applied to development |
| `npm.cmd run typecheck` | Passed after final code changes |
| `npm.cmd run lint` | Passed, zero warnings |
| `npm.cmd test` | **74 passed**; includes all 59 Phase 1/isolation tests and 15 provider/money tests |
| `npm.cmd run test:integration` | **35 passed**: seven preserved foundation tests plus 28 payment cases on real isolated PostgreSQL with mocked PayPal |
| `npx.cmd vitest run --config vitest.integration.config.ts` | **35 passed**, exit 0, final direct execution; same isolation safeguards |
| `npm.cmd run build` | Passed; all payment/consent/webhook routes compiled |
| `npm.cmd run test:e2e` | **14 passed in 40.7 seconds**, exit 0, final production build; desktop and mobile Chromium |
| Screenshot inspection | Desktop refund detail and mobile unconfigured checkout inspected; no horizontal page overflow |
| `git diff --check` | Passed for tracked changes; only line-ending conversion notices |
| Remote CI | Not run; existing workflow continues to execute the expanded suites |

Failures encountered and fixed: initial fixture account-ID reuse violated the intended unique merchant binding; each payment test now creates its own account ID. JSON request hashing was canonicalized for jsonb key ordering. Human decimal inputs such as `20` now normalize to `20.00` using string operations; invalid/over-limit amounts remain rejected. A full-refund timeout followed by an early unassociated webhook now preserves the reservation for same-key recovery instead of prematurely freezing it. Browser testing found desktop sign-out below the viewport after adding navigation links; the fixed sidebar now scrolls. The first E2E run had 13 passes/one failure and restricted teardown stalled; only its verified port-3100 server was terminated, then the final rerun exited normally with all 14 passing. Initial local DB probes also failed safely while PostgreSQL was stopped; the existing server was restarted with data preserved before testing resumed. No failed or skipped run is represented as passing.

## Regression coverage

Provider mocks cover fixed Sandbox endpoints, OAuth caching, request-ID forwarding, no automatic financial POST replay, abort timeout, read-only retry, malformed success/currency errors, safe error text, signature-verification payload and invalid references. Deterministic tests cover canonical hashing, exact minor-unit serialization and human decimal normalization without floating point.

Database tests cover create/reuse, missing buyer approval, verified capture and duplicate capture, missing/staff authorization, cross-tenant references, wrong order amount and capture payee, failed captures, full/partial/sequential refunds, exact consent and confirmation, zero/negative/excess/precision input, concurrent refunds, duplicate confirmations, processed capture timeout, ambiguous refund restart recovery, pending reconciliation, failed/cancelled release, wrong refund amount, closed retry window, invalid signatures, duplicate/out-of-order events, pending refund webhooks, full-refund timeout plus early webhook, and immutable approval/request/money constraints. These are **mock-provider tests**, not genuine buyer approval or PayPal financial evidence.

E2E retains login/session/tenant/health/navigation coverage and adds unauthenticated/cross-origin payment rejection, unconfigured checkout, tenant-scoped transaction search/not-found, and exact refund review/confirmation with honest pending messaging. The refund UI test intercepts the HTTP response; service persistence and financial concurrency are tested separately against PostgreSQL.

## Changed files and schema

- Provider/config/contracts: `src/lib/payments/{config,contracts,paypal-client}.ts`.
- Services: `src/server/services/{payments,payment-rules,webhooks}.ts`; server-only assembly/error/body/auth helpers in `src/server/{paypal,payment-http}.ts`.
- HTTP: `src/app/api/payments/route.ts`, `src/app/api/payments/[id]/route.ts`, `src/app/api/paypal/webhook/route.ts`, `src/app/api/refund-consent/route.ts`; truthful configuration reporting in `api/health`.
- UI: new checkout, transactions/detail and refund-consent pages; `src/components/payments/*`; navigation/sidebar, dashboard, settings/login labels and synthetic-order counts updated.
- Schema: `prisma/schema.prisma`, `prisma/migrations/202611080002_payments/migration.sql`. New Payment, CheckoutOperation, RefundApproval, RefundOperation, ProviderRefund and WebhookEvent models; related enums, audit links, unique provider/request/approval IDs, composite tenant FKs, money checks and immutable financial terms. Prior migration preserved.
- Tooling/tests: `scripts/configure-paypal.ts`, `package.json`, `playwright.config.ts`, `tests/fixtures/paypal.ts`, `tests/unit/paypal.test.ts`, `tests/integration/payments.test.ts`, `tests/e2e/payments.spec.ts`, expanded `tests/e2e/foundation.spec.ts`. No dependency replacement or new SDK package.
- Documentation: `.env.example`, README, this file, `docs/paypal-sandbox.md`, progress, decisions, sponsor evidence and test-isolation addendum. Phase 0 plans remain intact.

## Actual endpoints integrated

All server requests use `https://api-m.sandbox.paypal.com`:

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/v1/oauth2/token` | OAuth client credentials |
| POST | `/v2/checkout/orders` | Create persisted-price order |
| GET | `/v2/checkout/orders/{id}` | Verify order / reconcile capture |
| POST | `/v2/checkout/orders/{id}/capture` | Capture approved order |
| GET | `/v2/payments/captures/{id}` | Verify amount, merchant and order relationship |
| POST | `/v2/payments/captures/{id}/refund` | Full or exact partial refund |
| GET | `/v2/payments/refunds/{id}` | Verify refund and reconcile status |
| POST | `/v1/notifications/verify-webhook-signature` | Genuine app webhook verification |

Buyer SDK: `https://www.sandbox.paypal.com/web-sdk/v6/core`, official v6 instance/eligibility/one-time payment session and immediate `{orderId}` promise contract. SDK initialization/approval is implemented but **not exercised with a real configured buyer** in this environment.

## Review and remaining acceptance gates

Implementation self-review checked: active admin and tenant lookups; exact-origin/bounded inputs; persisted price/payee/order/capture identity; no browser-supplied capture or amount override; integer amounts; policy window/category/threshold/receipt rules; immutable exact approval/consent; held capacity and serial financial operations; external I/O outside DB transactions; stable keys across retries; unknown-result preservation; signature-before-event-persistence; event deduplication/current-provider truth; redacted audit; server-only secrets. Regression tests substantiate these checks. This is not independent `/review` sign-off.

Final read-only development inspection: **2 merchants, 0 payments, 0 refund operations, 0 enabled merchants**. No Phase 2 payment fixture contamination is present. No existing data was deleted or reset. The local PostgreSQL server remains running for continued setup; Playwright's owned server exited after verification.

| Genuine evidence gate | Status |
| --- | --- |
| Sandbox order creation / buyer approval | **Not run** — client ID, secret and matching merchant ID absent |
| Sandbox capture | **Not run** — requires configured account and buyer approval |
| Sandbox full/partial refund | **Not run** — requires a genuine verified capture |
| Genuine webhook signature and delivery | **Not run** — registered app webhook ID and HTTPS listener absent |
| APIMatic guidance used | **None** — no installed plugin/tool found; official docs used |
| Phase 3 readiness | **Not yet** — real lifecycle evidence and payment review gate remain |

Exact private configuration, merchant binding, buyer workflow, webhook subscription list, recovery limits and Windows commands: [PayPal Sandbox runbook](paypal-sandbox.md). No secrets should be sent in chat. No production switch, deployment, AI or AG Studio integration was introduced. A dedicated Sandbox account/no out-of-band refunds and operator-driven reconciliation remain explicit prototype limitations.
