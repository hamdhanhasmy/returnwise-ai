# Phase 2.5 — genuine Sandbox verification

Date: 2026-11-09. This record separates genuine external operations from automated provider mocks. Phase 3 has not started.

## Genuine evidence

The operator privately corrected the Sandbox Business Account ID and removed the placeholder webhook ID. OAuth authenticated successfully. The existing merchant configuration command enabled only Oak & Loom, bound its Sandbox account, and created the fictional $1.00 verification product. Existing tenant authorization, policy and exact buyer-consent checks remained enabled.

The user approved checkout through PayPal's official buyer flow. Authenticated PayPal order/capture retrieval independently confirmed the actual capture. After the user accepted the exact partial-refund terms and explicitly confirmed the merchant dialog, independent refund retrieval confirmed completion:

| Record | Sanitized reference | Provider outcome |
| --- | --- | --- |
| Order | …32104S | COMPLETED |
| Capture | …46643E | $1.00 USD; REFUNDED after both refunds |
| First refund | …894818 | $0.40 USD; COMPLETED |
| Second refund | …873331 | $0.60 USD; COMPLETED |
| Genuine webhook event | …173007 | PAYMENT.CAPTURE.REFUNDED; signature verified and PROCESSED |
| Persisted balance | Integer minor units | completed 100, reserved 0, remaining 0 |

The database payment is `58fbdd3a-9613-46ba-a445-aef08f57c9df`, scoped to Oak & Loom. Full provider references remain in the authorized transaction UI/database. The smoke script validates provider amount, currency, payee/order/capture relationships and stored refund status; no provider success is inferred from a button click. No extra financial operation was created to retry uncertainty.

Initially the operator reported submission while the database contained only an unaccepted refund review. A read-only check showed no refund operation and no provider refund. The user then completed acceptance and confirmation; only the subsequently verified operation is counted. This was an incomplete UI workflow, not an executed refund failure.

## Status

| Capability | Status / evidence |
| --- | --- |
| OAuth authentication | Sandbox verified |
| Orders v2 create | Sandbox verified |
| Buyer approval | Sandbox verified by subsequent approved capture and audit history |
| Capture | Sandbox verified, $1.00 USD |
| Partial refund | Sandbox verified: $0.40 and $0.60 COMPLETED, cumulatively fully refunded |
| Webhook delivery | Sandbox verified through public HTTPS tunnel, including delayed redelivery |
| Webhook signature verification | Sandbox verified through PayPal postback SUCCESS before event persistence |
| Database persistence | Verified against independent provider retrieval |
| Merchant authorization | Verified authenticated flow; automated negative/tenant tests passed |
| APIMatic plugin | Used for targeted review and regression coverage; see sponsor evidence |

## Commands actually run

| Command | Result |
| --- | --- |
| `npm.cmd run paypal:verify -- --oauth` | Genuine Sandbox OAuth passed; no token printed |
| `npm.cmd run paypal:configure -- --merchant=11111111-1111-4111-8111-111111111111 --verification-product` | Scoped merchant/product configured; no provider request |
| `npm.cmd run paypal:verify -- --merchant=11111111-1111-4111-8111-111111111111 --payment=58fbdd3a-9613-46ba-a445-aef08f57c9df` | Genuine order/capture/both refund GETs passed; final 100/0/0 ledger balance |
| `npm.cmd run typecheck` | Passed after listener/test additions |
| `npm.cmd run lint` | Passed, zero warnings |
| `npm.cmd test` | 77 passed: 59 preserved foundation/isolation, 16 provider/money, two tunnel-boundary tests |
| `npm.cmd run test:integration` | 37 passed against verified isolated PostgreSQL with mocked PayPal |
| `npx.cmd vitest run --config vitest.integration.config.ts` | 37 passed, exit 0 |
| `npm.cmd run db:validate` | Passed |
| `npx.cmd prisma migrate status` | Development has both migrations applied |
| `npm.cmd run db:migrate:test` | Both database identities verified; no pending test migrations |
| `npm.cmd run build` | Passed |
| `npm.cmd run test:e2e` | Final post-UTC-fix run: 14 passed in 43.1 seconds, exit 0 with normal teardown |
| Remote CI | Not run |

Restricted-process `tsx` commands failed before execution with `uv_os_get_passwd`/ENOMEM. Approved retries ran successfully. Initial network-restricted tunnel probes failed; approved HTTPS probes returned 404 for `/` and 405 for GET on the webhook, as intended. A later network interruption expired the first temporary tunnel; it was replaced. The replacement endpoint returned 401 for a synthetic forged certificate header; this proves rejection at the application boundary, not genuine signature verification. The first E2E assertions finished normally, but Windows teardown stalled; PowerShell Stop-Process failed and taskkill stopped only the verified test-owned PID, after which Playwright exited 0. The final approved E2E rerun exited normally. The user's app/database were preserved. Vite emitted an informational future config-loader warning; no test was skipped.

Unit regression subprocesses directly invoke Vitest with missing, malformed and equivalent test URLs and assert zero TCP connections. The new payment integration test reads committed capture intent and refund reservation from inside the fake provider call, proving durability before outbound I/O. An additional integration regression compares the stored timestamp epoch to a known UTC instant. Existing duplicates/concurrency, timeout/unknown outcomes, pending reconciliation, authorization/currency/over-refund and out-of-order webhook coverage all reran using mocks. These fault scenarios were not deliberately induced against PayPal, except the genuine duplicate webhook delivery described below.

## Genuine webhook and duplicate delivery

The subscription was registered on the same Sandbox REST app. The first quick tunnel expired during a network interruption; the operator updated the existing subscription to the replacement listener. Read-only `GET /v1/notifications/webhooks/{id}` confirmed the registered URL and refund event subscription. The first explicitly date-filtered event listing returned HTTP 400; retrying the documented default filtering found the actual second-refund event, matched to the persisted refund ID. No raw event payload or credential was logged or committed.

PayPal accepted `POST /v1/notifications/webhooks-events/{event_id}/resend` with HTTP 202. This re-delivers an existing transaction-generated event; it does not simulate a webhook or create another refund. The application subsequently persisted event …173007 with a verified signature, correct payment/merchant match, PROCESSED status, no error, and one PAYPAL_WEBHOOK_RECONCILED audit record. The implementation only writes that record after PayPal postback returns SUCCESS.

A further redelivery was observed at the endpoint-only relay with HTTP 200 after the app restart. Database counts remained one webhook event, one reconciliation audit entry, and two provider refunds totaling 100 cents. Genuine duplicate handling and delayed delivery recovery are therefore verified. Out-of-order delivery remains automated mock evidence, not a claimed additional genuine event. No simulator event was used.

## Discovered timestamp bug and fix

Read-only inspection showed PostgreSQL sessions defaulted to Asia/Colombo, while installed `@prisma/adapter-pg` 7.10.1 serializes UTC wall time without an offset and normalizes returned timestamptz offsets to UTC. Prisma round trips concealed an actual stored-instant offset of 5.5 hours. This affected timestamp evidence and could affect deadlines when different database clients/session zones were mixed.

Both `scripts/database.ts` and `src/lib/db/client.ts` now set PostgreSQL connection options to `-c timezone=UTC`. The operator restarted the app to replace the cached pool. `tests/integration/foundation.test.ts` checks the actual database session zone and `extract(epoch from createdAt)` for a known instant, rather than trusting a Date round trip. The complete suites reran after the fix. No dependency replacement or schema migration was required.

Existing timestamps were **not rewritten**. Historical records created under the old session setting need explicit review before using their absolute timestamps for evidence or migrating data; blanket correction would be unsafe where native PostgreSQL and Prisma writes are mixed. Monetary amounts, provider identifiers and independently retrieved payment/refund statuses remain verified. No data was deleted or reset.

## Changes in this milestone

- `src/lib/payments/config.ts`, `paypal-client.ts`: credential-only OAuth diagnostic and safe authentication result, reusing the existing client.
- `scripts/verify-paypal.ts`, `package.json`: explicit read-only genuine smoke command, sanitized references and ledger comparison.
- `scripts/configure-paypal.ts`: optional $1.00 fictional verification product within the existing merchant-binding transaction.
- `scripts/webhook-listener.ts`, `scripts/start-webhook-listener.ts`: bounded, endpoint-only local tunnel relay.
- `tests/unit/paypal.test.ts`, `tests/unit/webhook-listener.test.ts`, `tests/integration/payments.test.ts`: safe OAuth diagnostic, relay boundary and durable financial intent regressions.
- `scripts/database.ts`, `src/lib/db/client.ts`, `tests/integration/foundation.test.ts`: UTC session configuration and actual persisted-epoch regression.
- `.env.example`, README, PayPal runbook, sponsor evidence, progress, decisions, historical evidence link and this report.

No Prisma schema change, migration, library replacement, database reset, production PayPal switch or Phase 3 implementation was added in Phase 2.5. Prior Phase 2 working-tree changes remain intact.

## Remaining gates

The genuine payment/refund and webhook verification gates have passed. No Sandbox credential, buyer approval or webhook-subscription blocker remains for this verified flow. The temporary listener depends on this machine, app, relay and tunnel staying online; restart changes its URL and requires updating the subscription. A stable hosted listener remains a deployment decision, not a claimed completed deployment.

Historical timestamp review remains outstanding; no permission to rewrite those records was requested or assumed. The cumulative full refund used two partial calls; a separate empty-body full-refund call is mock-tested, not separately live-tested. Production readiness, real funds, pending/failed external outcomes, real out-of-order delivery and remote CI are not claimed. Phase 2's genuine Sandbox lifecycle can be finalized with these documented limits and the repository's payment-review requirement; Phase 3 has not started and should follow review of the timestamp caveat and changes.
