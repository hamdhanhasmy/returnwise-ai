# Phase 3 — return-management implementation and evidence

Implemented and locally verified, 2026-11-10 (Asia/Colombo). No AI, AG Studio or case-to-PayPal refund execution is included.

## Mandatory preflight

Read AGENTS, blueprint, phase prompts, architecture/data-model/decision/test-isolation documents, Phase 2/2.5 reports, Prisma/migrations, auth, provider adapter, payment/refund reservation and policy gates, webhook processing, current routes and tests. Existing working-tree changes were preserved. Initial baseline: 77 unit tests and TypeScript checks passed.

Read-only development inventory: four SIMULATED orders (three purchase dates, two delivery dates), one PAYPAL_SANDBOX order (purchase date present; no delivery date), four legacy cases, one genuine payment, two refunds totaling 100 cents, and one webhook. The genuine capture/refund identifiers and amounts remain intact. Historical timestamps were not modified or deleted. The broad first payment timestamp query used an incorrect column name and failed read-only; subsequent review uses captureCompletedAt.

The prior timestamp fix requests UTC on both Prisma connection factories. The persisted-epoch integration test remains in the suite. Historical rows have mixed possible Prisma/native-SQL provenance, so successful Date round trips or a plausible date cannot certify them. Phase 3 adds explicit provenance defaulting existing orders to UNVERIFIED; it does not shift dates. Legacy cases lack trusted submission instants and immutable policy snapshots and therefore cannot receive an automatic eligible recommendation. New UTC-created checkouts and explicitly synthetic scenarios have separate provenance. New return windows use trusted purchase/submission instants with an inclusive elapsed-days boundary; unknown/future dates require manual review.

Payment review found preserved active-admin/tenant checks, persisted identity/amount verification, short locked reservations, durable request IDs, no automatic financial POST retries, exact partial consent, and verified/deduplicated webhook reconciliation. No blocking payment-money defect was identified in this focused review. This is not an independent reviewer sign-off. Shared MerchantPolicy gains a purpose discriminator so new return-management settings cannot silently change the existing standalone payment-policy lookup. The genuine $1 capture is fully refunded and is never treated as available capacity.

## Milestones

1. Additive policy/case/evaluation/proposal schema, deterministic integer engine, capability-scoped service and negative tests.
2. Customer portal, merchant policy settings, case list/detail/action UI and labeled synthetic scenarios.
3. End-to-end browser checks, complete regression suite, final evidence and Phase 4 prerequisites.

## Architecture and decision constraints

Return policy versions and case policy snapshots are immutable. Evaluations persist exact inputs, canonical hash, logic version, options, reasons and missing information. Resolution proposals bind amount, currency, evaluation, explanation and terms hash. A partial offer requires explicit acceptance of that exact unexpired proposal. Merchant approval rechecks the current ledger and customer agreement but never invokes payment operations.

Full-return cost = full refund + merchant-paid return shipping + handling + disposal - configured recovery. Full-keep cost = full refund + unavoidable keep processing. Customer-paid shipping is shown separately. Only full-refund remedies are ranked; an optional partial offer is never ranked against a full-refund entitlement. All money is integer minor units. Missing estimates, invalid amounts/currencies, unverified/fully refunded payments, reservations, prior partial refunds, policy restrictions and unreliable dates route to manual review. The engine cannot determine legal rights; merchant review is mandatory.

Customer access uses hashed expiring order/case capabilities and exact-origin bounded JSON requests. Intake is atomically consumed; tracking/offer responses are scoped to the resulting case. Issuing a replacement link revokes prior order capabilities. No public order-ID lookup, secrets, payment identifiers, internal financial estimates or customerRef are included in the customer projection. Current single-item orders provide one eligible item selector; multi-item baskets remain outside the existing payment architecture.

## Implementation and changed files

- `prisma/schema.prisma`, migrations `202611100001_returns` and `202611100002_return_policy_delete_guard`: additive workflow enums/fields, policy purpose/rules, timestamp provenance, ReturnEvaluation/ReturnProposal, tenant keys, money/consent constraints and immutability guards. Both migrations applied to development and isolated test databases; no destructive migration.
- `src/lib/returns/{contracts,engine,state,rate-limit}.ts`: validation, pure integer engine, state machine and bounded capability throttling.
- `src/server/services/returns.ts`, `src/server/return-http.ts`, `src/app/api/returns/**`: scoped capabilities, immutable evaluations, version-locked commands, exact agreement and audit. `merchant.ts` extends scoped queries and pagination; `payments.ts` separates policy purposes and requires trusted non-future timing for refund review.
- `src/components/returns/**`, customer `/returns`, merchant `/portal`, `/settings`, `/cases`, `/cases/[id]`, `cases-table.tsx`: responsive customer and merchant journey, cost breakdown, history and native approval confirmation.
- `prisma/seed-returns.ts`, `scripts/audit-return-timestamps.ts`, package script: additive synthetic scenarios and repeatable read-only audit.
- New unit/integration/browser return suites, plus payment timestamp regression and explicit trusted timing in the existing browser fixture. Existing tests retained.
- README, progress, decisions, this report and `docs/return-management.md`. Phase 0 and historical Phase 2 reports remain preserved. Existing working-tree changes from previous phases were not reverted or committed.

## Timestamp audit and preservation evidence

The read-only audit uses `SET TRANSACTION READ ONLY`, reports the actual session timezone (`UTC`) and only sanitized provider suffixes. It confirms five historical orders now explicitly `UNVERIFIED` (four synthetic, one Sandbox), four legacy cases without explicit submission instants, and four newly seeded synthetic orders / three new cases with submission instants. New-case integration tests compare stored PostgreSQL epoch with the JavaScript UTC instant; the existing connection-factory epoch regression also runs.

Capture `…46643E` remains `REFUNDED`, 100 cents; refunds `…894818` and `…873331` remain `COMPLETED`, 40 and 60 cents. One genuine webhook remains `PROCESSED`. No additional PayPal request was sent in Phase 3. Provider verification comes from Phase 2.5; this phase independently confirms local preservation, not a new external verification.

Potentially affected historical fields include order purchase/delivery dates, case created/updated dates, payment capture/creation dates, early provider timestamps and auth/audit instants written before the UTC correction. Mixed native database defaults and Prisma timestamps prevent assigning one universal correction. A read-only inventory alone cannot prove which individual old timestamp is correct. No old timestamp, ID or financial amount was updated. Historical orders cannot enter an automatic return-window decision; existing standalone refund review now rejects untrusted or future purchase timing too. Historical auth capabilities are bounded by their existing expiry; no lifetime extension was performed.

## Review fixes and verification notes

Focused self-review checked customer projection, recipient capability scope, tenant/role checks, stale versions, policy preservation, proposal immutability, absence of provider calls, and current-ledger checks. Fixed malformed partial policy values throwing during BigInt refinement; they now yield structured invalid-policy review. Approval now serializes with ledger writes and compares current timing/source as well as balances. Native dialog supplies keyboard/focus behavior. The follow-up SQL migration fixes legacy policy DELETE behavior without modifying rows. This is a focused engineering review, not an independent `/review` sign-off.

Initial database verification stopped safely while PostgreSQL was unavailable (50 tests did not run). Starting the existing local cluster resolved connectivity without resetting data. Restricted Windows `tsx` launches failed at `uv_os_get_passwd`; approved runs outside that process restriction succeeded. An audit query initially referenced a nonexistent refund `createdAt` and failed read-only; it was corrected to `providerUpdatedAt`. Earlier two integration fixture failures (missing required `verifiedAt`) were corrected; no production logic/test assertion was weakened. The first browser run completed all 20 tests but hung in teardown and was interrupted; a clean rerun is required before final completion.

## Final executed verification

| Command | Actual result |
|---|---|
| `npm.cmd run typecheck` | Passed |
| `npm.cmd run lint` | Passed, zero warnings |
| `npm.cmd test` | 109 passed, 11 files; includes direct-Vitest missing/malformed/equivalent-URL TCP-tripwire regressions |
| `npm.cmd run test:integration` | 54 passed, 3 files, verified isolated PostgreSQL |
| `npx.cmd vitest run --config vitest.integration.config.ts` | 54 passed, 3 files; direct execution preserves isolation |
| `npm.cmd run db:validate` | Prisma schema valid |
| `npm.cmd run db:migrate` | Both additive Phase 3 migrations applied; four migrations total |
| `npm.cmd run db:migrate:test` | Same migrations applied only after test-database identity verification |
| `npx.cmd prisma migrate status` | Development schema up to date |
| `npm.cmd run build` | Production build passed, all customer/merchant/API routes generated |
| `npm.cmd run test:e2e` | Final approved rerun: 20 passed, 1.3 minutes, exit 0; desktop Chromium and mobile emulation |
| `npm.cmd run returns:seed` | Passed twice; three cases/four synthetic orders remain, no reset or duplication |
| `npx.cmd tsx scripts/audit-return-timestamps.ts` | Read-only UTC/provenance/financial inventory passed; original payment/refunds/webhook preserved |
| `git diff --check` | Passed; Git reports existing LF/CRLF conversion notices |

Existing 77 unit / 37 integration / 14 browser tests are retained; added coverage brings totals to 109 / 54 / 20. No tests were removed or disabled. Integration PayPal responses are mocks; Phase 3 synthetic scenarios create no PayPal payments. Vite emits a non-failing future native-config-loader compatibility warning about extensionless imports. The interrupted first browser run is not counted as a clean command success; the final run exited successfully.

Browser verification exercises private link issuance, settings version creation, unauthenticated customer submission, preserved customer-safe projections, full-returnless proposal/approval, partial exact acceptance, missing acceptance protection, invalid capabilities, origin/auth rejection and no created payment/refund records. Existing merchant navigation, tenant isolation, checkout-disabled states and mocked refund UI regression also passed. Desktop case-detail and mobile portal screenshots were visually inspected: legible cost comparison, clear synthetic labeling, visible case status and no horizontal overflow. Private test links are masked in screenshots. Mobile evidence is Chromium device emulation, not physical-device testing.

The repeated read-only seed inventory confirms `RW-DEMO-A = EVALUATED / FULL_REFUND_KEEP`, `RW-DEMO-B = EVALUATED / FULL_REFUND_RETURN`, and `RW-DEMO-C = MANUAL_REVIEW / no recommendation`. The additional `RW-DEMO-INTAKE` order remains ready for customer submission.

## Completion and remaining gates

Phase 3's customer submission → immutable policy evaluation → reproducible economics → merchant review journey is implemented and passes local verification. No known failing regression remains. Historical timestamp uncertainty is contained by manual-review/provenance gates, not repaired. No fresh real PayPal operations were performed or needed for this phase; the Phase 2.5 verified records remain intact.

Phase 4 can be planned on this foundation, but has not started. Before AI implementation, define secure evidence storage/retention, an observation-only structured schema and safe manual fallback; independently review these high-risk workflow changes. Public/multi-instance operation still needs shared ingress rate limits, recipient verification, least-privilege runtime DB credentials and HTTPS. Later case-to-refund orchestration must separately revalidate current balances, customer agreement, entitlement, physical-return requirements and durable idempotency. See [return-management.md](return-management.md) for exact setup, scope limits and prerequisites.
