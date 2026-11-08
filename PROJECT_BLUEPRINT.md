# ReturnWise AI — Hackathon Product Blueprint

Version: 1.0 | Prepared for PayPal AI Hackathon, November 2026

## 0. Mission and constraint

Build an end-to-end, runnable, open-source **sandbox-only** merchant return-resolution application. A customer submits a problem with an order, an AI extracts evidence and summarizes the issue, a deterministic policy/cost engine compares authorized resolutions, the merchant approves one, and PayPal executes and verifies a full or partial refund against an original captured sandbox payment. AG Studio provides an interactive, AI-assisted analytics workspace. APIMatic's PayPal Context Plugin may guide API integration. The app must clearly distinguish **live PayPal sandbox events** from simulated business and shipping data.

**Deadline**: November 12, 2026, noon Pacific time (November 13, 01:30 Sri Lanka time). **Demo**: public YouTube video under three minutes. **Repository**: public, properly open-source-licensed and reproducible, with working hosted demo or full run instructions.

## 1. Non-negotiable correctness and safety requirements

1. The AI does not calculate refund amounts, override merchant policy, verify legal entitlements, approve refunds, or call the PayPal refund API.
2. All money amounts are represented as **integer minor currency units** (e.g., USD cents), with explicit currency codes. No JavaScript float arithmetic for monetary decisions.
3. A refund is possible only if a verified completed capture is linked to the order, the actor is authenticated and authorized for the merchant, customer eligibility/policy gates have passed, and the approved amount is <= remaining refundable capture amount.
4. At most one operational refund request per user-approved decision. Use a database uniqueness constraint, transaction/locking or optimistic concurrency, and the `PayPal-Request-Id` idempotency header. Preserve the *same* idempotency key on retries for the same approved refund operation.
5. Never declare success from clicking the button or receiving an incomplete/uncertain response. Persist `PENDING` / `PROCESSING`, reconcile by querying PayPal where needed, and mark `COMPLETED` only from a verified PayPal API result or signature-verified webhook plus reconciliation.
6. Verify webhook signatures before processing, deduplicate webhook event IDs, require expected merchant/capture IDs and amounts, tolerate delayed, duplicate and out-of-order events. Keep an append-only audit log without sensitive payment credentials.
7. No PayPal credentials or OpenAI API keys in client code, browser bundles, logs or git. Environment variables on server only; `.env.example` has placeholders.
8. Customer photos and descriptions are **untrusted inputs**. AI may describe visible damage and possible discrepancies, not certify identity, entitlement, fraud, authenticity, or hidden conditions. If uncertain, route to manual review.
9. Merchant policy and consumer-protection rights cannot be overridden by the cheaper outcome. For a partial refund keeping the item, record the customer's explicit informed acceptance. Do not equate cost savings with fairness or customer satisfaction.
10. Separate `SIMULATED` logistics/recovery figures from real PayPal `SANDBOX` transaction records. Don't claim real-world savings; label modeled outcomes and explain assumptions.
11. The project may run publicly only in **sandbox mode** during the hackathon. Provide no direct production live-money toggle in public demo.
12. No long-running external work, live credentials, automatic merchant refunds, or external access without the user's explicit approval.

## 2. What success looks like (MVP acceptance tests)

- A merchant signs in and sees a dashboard with seeded cases plus at least one genuine PayPal sandbox capture.
- A customer submits a new return request tied to an existing seeded order or an order made by the sandbox checkout.
- An AI response extracted from customer description/image is strictly schema-validated and displays evidence, limitations, and uncertainty; on failure there is a manual fallback.
- The server computes three allowed outcomes under the seller's refund policy. It rejects ineligible cases, invalid amounts, mismatch of currency, duplicate refunds, and expired/consumed tokens.
- The merchant sees the comparison, inputs/assumptions, policy checks, and an *approval-required* action.
- Merchant approving an eligible full or partial refund triggers PayPal Payments v2 refund for the verified capture; the UI shows actual PayPal refund ID/status.
- Duplicate button clicks, webhook retries and network errors never create duplicate logical refund requests.
- AG Studio dashboard uses actual persisted case/payment records and shows return savings as **estimated** with a synthetic baseline.
- The project passes type check, lint, automated unit/integration tests and a browser e2e happy path. Errors are visible and recoverable.
- Judges can run a usable demo or follow complete setup instructions; real secrets are not committed.

## 3. End-to-end product user flow

### Merchant
1. Sign in -> Cases queue sorted by status and risk.
2. Inspect customer claim + photo and order capture details.
3. Click `Analyze` -> AI extraction; verify evidence and selected policy.
4. View alternatives: `FULL_REFUND_KEEP`, `FULL_REFUND_RETURN`, `PARTIAL_REFUND_KEEP`, `MANUAL_REVIEW` (offer only options allowed by policy and law; can start MVP with fewer options).
5. Compare costs and assumptions; view recommendation and explicit uncertainty.
6. Select/adjust within policy; customer acceptance required for partial keep; click `Approve refund` with a confirmation.
7. Observe `PENDING` -> `PROCESSING` -> `COMPLETED` or actionable failure; view PayPal refund ID and audit history.
8. Open Insights -> analyze rates, modeled cost avoidance and refund outcomes in AG Studio.

### Customer
1. Use a secure per-order case link (opaque expiring token; no unrestricted order-ID lookup).
2. Describe problem, select reason, optionally upload photo; confirm order information.
3. Track case and choose/accept eligible merchant offer. A full-refund-without-return case may not require explicit replacement selection, but show the resolution clearly.

### Demo
1. `Case A`: low salvage-value damaged item: shipping + handling > salvage value; full refund without return is preferable under the merchant policy.
2. `Case B`: expensive resaleable item: return collection is economically sensible.
3. `Case C`: low-confidence or out-of-policy claim: manual review; no payment API call.
4. Capture an actual PayPal sandbox order for one case; execute a PayPal sandbox refund; show verified refund ID.

## 4. Recommended technology stack

- Next.js (App Router), TypeScript strict mode, React, Tailwind CSS, shadcn/ui.
- PostgreSQL + Prisma ORM (or Drizzle with migrations), Zod on all network inputs.
- Hosted on Render (if feasible) with PostgreSQL, HTTPS webhook URL; otherwise another supported host. Clearly note Render's prize requirements, if targeting that category.
- OpenAI API (server only) for structured analysis; use a model that supports images and Structured Outputs. Codex access through ChatGPT is **not the same as OpenAI API billing**.
- PayPal Orders v2 and Payments v2 REST APIs, PayPal JavaScript SDK for buyer approval; sandbox only.
- AG Studio React package `ag-studio-react` with its AI framework; follow official docs and use a server-side AI proxy. AG Studio is not the same as basic AG Grid.
- APIMatic PayPal Context Plugin for code guidance (`npx context-plugins install paypal` from project root). Verify generated version and licensing; don't assume plug-in output is automatically correct.
- Vitest for unit/integration tests, Playwright for browser test, GitHub Actions for CI.

Keep architecture a single deployable Next.js application with service modules rather than premature microservices. Use a hosted DB; use a secure, bounded image-upload mechanism (e.g. object storage + signed uploads, with size/type restrictions). For a 4-day MVP, demo claims without images must work.

## 5. Architecture and folder boundaries (suggested)

```
src/
  app/
    (auth)/login/
    (merchant)/dashboard/
    (merchant)/orders/
    (merchant)/cases/
    (merchant)/cases/[id]/
    (merchant)/insights/
    demo/
    r/[token]/
    api/paypal/orders/
    api/paypal/orders/[id]/capture/
    api/paypal/webhooks/
    api/return-cases/
    api/return-cases/[id]/analyze/
    api/return-cases/[id]/approve/
  components/
  lib/
    auth/
    db/
    money/
    policy/
    ai/
    payments/
    audit/
    analytics/
    validation/
  server/
    services/
  tests/
prisma/
  schema.prisma
  seed.ts
scripts/
docs/
  architecture.md
  evaluation.md
  demo-script.md
```

No domain/financial calculation inside React components. Route handlers authenticate and authorize; services own business logic; adapters own external API access.

## 6. Proposed data model (minimal)

- `Merchant` (id, name, sandboxAccountAlias, createdAt)
- `User` (id, merchantId?, email, passwordHash or OAuth provider, role: ADMIN/STAFF, createdAt)
- `MerchantPolicy` (id, merchantId, version, returnWindowDays, categories, allowKeepWithoutReturn, allowPartialKeep, manualReviewThreshold, effectiveAt)
- `Product` (id, merchantId, name, sku, category, currency, saleAmountMinor, recoveryValueMinor)
- `Order` (id, merchantId, publicOrderNumber, customerRef, currency, totalMinor, createdAt)
- `Payment` (id, orderId, paypalOrderId, paypalCaptureId [unique], captureAmountMinor, currency, captureStatus, lastVerifiedAt)
- `ReturnCase` (id, merchantId, orderId, reason, description, customerClaim, status, createdAt, resolutionApprovedAt, policyVersion)
- `Evidence` (id, caseId, kind, storageKey, contentHash, uploadedAt; no raw data in model prompts unless needed)
- `ReturnAnalysis` (id, caseId, modelName, schemaVersion, evidenceSummaryJson, conditionClassification, confidenceOrUncertainty, requiresManualReview, createdAt)
- `ReturnQuote` (id, caseId, option, refundMinor, shippingMinor, handlingMinor, expectedRecoveryMinor, processingMinor, modeledTotalCostMinor, currency, approvedPolicyRule, assumptionsJson, expiresAt)
- `ResolutionDecision` (id, caseId, approvedByUserId, chosenQuoteId, acceptedByCustomerAt?, status, approvedAt, policyVersion)
- `RefundOperation` (id, decisionId UNIQUE, paymentId, amountMinor, currency, idempotencyKey UNIQUE, paypalRefundId UNIQUE NULLABLE, status, attemptCount, lastErrorCode, createdAt, updatedAt)
- `WebhookEvent` (id [PayPal event id] UNIQUE, eventType, verifiedAt, processedAt, processingStatus)
- `AuditLog` (id, merchantId, actorType, actorId?, caseId?, action, redactedMetadataJson, createdAt)

Use actual relations/indexes and migrations; avoid storing customer bank or card numbers. A demo-only magic link may be sufficient, but it must be scoped, unpredictable and expiring.

## 7. Financial model and fairness rules

Only compare outcomes that are **permitted by policy and actually acceptable to the customer**.

Model expected seller costs with integer minor units:

- `FULL_REFUND_KEEP`: fullRefund + any permitted disposal/processing cost.
- `FULL_REFUND_RETURN`: fullRefund + reverseShipping + inspectionHandling - expectedRecoverableValue.
- `PARTIAL_REFUND_KEEP`: customer-agreed partialRefund + associated cost; only permitted when customer has accepted an offer and law/policy allow it.
- `REPLACEMENT`: separate future version; needs fulfillment, replacement stock and shipping inputs.

For two equivalent full-refund options: `modeledSavingsOfKeepVsReturn = reverseShipping + inspectionHandling - expectedRecoverableValue - keepSpecificCosts`. If negative, return may be economically preferable. The calculated savings are estimates unless measured outcomes exist. Do not compare a partial refund to a full refund on cost alone; service quality, entitlements and accepted resolution are gating conditions.

Recommendation flow:
1. Independently validate entitlement, policy, time window and fraud/security signals; failing/uncertain cases -> review.
2. AI extracts *observations* and untrusted facts; outputs strict typed schema; describe uncertainty.
3. Price estimates come from stored merchant data, not the model.
4. Engine computes feasible choices and costs.
5. Select lowest modeled merchant cost only among equally allowed and customer-accepted choices, with manual approval. Clearly display alternative outcomes and the source of each estimate.
6. Payment service enforces refund <= verified remaining refundable balance, matching capture currency, unique approval, and known merchant.

### Example demo case
USD $80 purchase; return shipping $18; inspection $7; recoverable value $12; no special keep cost. Both options provide a full $80 refund. Return option modeled cost = $80+$18+$7-$12 = $93; keep option = $80. Modeled difference = $13. This is **not** a claim that $13 was actually saved.

## 8. AI extraction schema (conceptual)

AI returns ONLY structured, schema-validated attributes. Zod schema equivalent:

```
{
  caseSummary: string,
  claimedIssue: 'DAMAGED'|'NOT_AS_DESCRIBED'|'WRONG_ITEM'|'OTHER'|'UNKNOWN',
  visibleObservations: string[],
  evidenceLimitations: string[],
  possiblePolicyQuestions: string[],
  uncertainty: 'LOW'|'MEDIUM'|'HIGH',
  requiresHumanReview: boolean
}
```

No `refundAmount`, `approved`, `finalDecision`, `paypalAction`, or free-form money fields in AI output. Use Structured Outputs and runtime validation; on API failure, schema invalidity or safety refusal show `Analysis unavailable — manual review`. Never allow uploaded text to override system instructions; don't give the model payment tools.

## 9. PayPal integration design

### Sandbox first
- Obtain sandbox business merchant and sandbox personal buyer from PayPal Developer Dashboard.
- Securely store `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_ENV=sandbox`.
- Server creates an order (`POST /v2/checkout/orders`) in USD; buyer approves it; server captures it (`POST /v2/checkout/orders/{order_id}/capture`). Store actual capture ID, currency, total, merchant and PayPal status.
- Validate ownership and eligible amount; server refunds (`POST /v2/payments/captures/{capture_id}/refund`). Full refund = empty payload; partial refund = `amount` object using matching original currency. Use `PayPal-Request-Id` with persistent idempotency key.
- Show `COMPLETED` only once verified from API or a signature-verified webhook and the correct capture/refund record.
- Subscribe to relevant `PAYMENT.CAPTURE.*` webhook events, verify signatures, store dedupe IDs and reconcile unexpected statuses.

### Refund state machine
`APPROVED -> PENDING -> PROCESSING -> COMPLETED` or `FAILED_RETRYABLE / FAILED_FINAL / NEEDS_RECONCILIATION`.

Avoid automatically retrying a refund with a *new* request ID after a timeout; investigate uncertain prior response to avoid duplication. Support partial refunds only to verified eligible balance. Track aggregate refunds across operations. API secrets never reach the client.

### Test checklist
- Successful capture/refund, full and partial amounts.
- No captured order -> no refund.
- Amount negative/zero/over-refund -> reject.
- Currency mismatch -> reject.
- Wrong merchant/unauthorized staff -> reject.
- Duplicate button press -> one operation and one key.
- Timeout/5xx -> pending reconciliation, not fake success.
- Duplicate, unverified, and out-of-order webhook -> safe.
- Already refunded capture -> safe failure.

Reference: https://developer.paypal.com/api/payments/v2/captures-refund and https://developer.paypal.com/api/rest/webhooks/.

## 10. AG Studio sponsor feature

Use `npm install ag-studio-react` and follow current React installation/AI quickstart. Build the merchant Insights page from actual persisted transaction and quote data:
- refund volume by issue type/status;
- return resolution mix;
- modeled avoidable handling cost by category;
- AI/manual review breakdown;
- payment failure/retry statuses;
- outlier cases with explanatory breakdowns.

Use the Studio Agent Framework with server-side LLM adapter/proxy. Example judge query: "Show the cases where returns cost more than the recoverable value, and break down the estimated savings by product category." Only expose aggregated/authorized data. A custom tool must be read-only for analytics and must not initiate refunds. Follow: https://www.ag-grid.com/studio/react/installation/ and https://www.ag-grid.com/studio/react/ai-quickstart/ .

## 11. APIMatic integration

Install from project root: `npx context-plugins install paypal`. Review its generated guidance/code and verify against PayPal official APIs, especially webhook verification, idempotency and error handling. Record in `docs/sponsor-integrations.md` exactly what the plug-in changed, with implementation pointers and actual tests. Don't represent an installed plug-in as substantial prize-worthy integration by itself.

## 12. Performance, correctness and security

- TypeScript strict and Zod at all request/server boundaries.
- Index `merchantId,status,createdAt`, `orderId`, `paypalCaptureId`, `caseId`, `idempotencyKey`, `webhookEventId`.
- Do not call AI in dashboard render path; analysis only on user request, cache by evidence hash and model/schema version. Enforce timeouts and rate limits.
- Paginate case lists server-side; only return needed DB fields and avoid N+1 relations.
- Loading/error/empty states; keyboard accessible interface, responsive 1280px demo screen.
- Logging with trace IDs, redaction, health endpoint; never log tokens, secrets, raw private user images.
- Merchant-scoped authorization on every DB query and server operation; secure CSRF/session handling; rate limit uploads/endpoints.
- Restrict uploads to valid image MIME types, safe file sizes, stored outside public executable paths; use signed URLs, avoid exposing content publicly.
- Make external requests from backend with bounded timeouts. Use explicit retry policy only for idempotent/verified operations.
- No guessed real-world return-loss metrics; create and label a synthetic evaluation dataset.

## 13. Evaluation dataset and tests

Build at least 20 synthetic scenarios across product categories, recovery values and policy windows with expected allowed resolutions. Include:
1. Low-value damaged product, return costs exceed salvage -> full-refund-keep if allowed.
2. High-value working product, salvage exceeds reverse logistics cost -> full-refund-return if allowed.
3. No proof of purchase -> manual review.
4. Out of policy window -> manual/policy denial; disclose applicable exception rights.
5. Wrong merchant order -> forbidden.
6. Photo shows no obvious damage -> uncertain, review.
7. Ambiguous claims -> manual review.
8. Product category excluded from keep option -> no full-refund-keep.
9. Partial refund not accepted by customer -> cannot execute.
10. Full refund already executed -> no second refund.
11. Multiple partial refunds aggregate exceeds capture -> reject.
12. Webhook replay -> no change or duplicated credit.
13. Payment timeout on refund -> reconciliation.
14. Capture currency USD vs requested EUR -> reject.
15. Customer instructions contain prompt injection -> ignored.
16. AI unavailable -> manual process still usable.
17. API malformed output -> fail closed.
18. Merchant staff from tenant B -> access denied.
19. Delayed webhook out of order -> state remains correct.
20. Financial formula property tests: no negative refund, no float drift.

Evaluate correctness for policy-rule compliance, payment invariants, decision explainability and classification confusion matrix on labeled synthetic inputs; report uncertainty honestly. No fabricated production results.

## 14. Team and timebox

4 people, 4 days. Track tasks independently and use one integration branch only after tests.

- Engineer 1: payments/transactions, webhooks, auth safety; first priority.
- Engineer 2: deterministic decision engine, policy, economics, evaluation cases.
- Engineer 3: customer/merchant UX and responsive design.
- Engineer 4: AI integration, AG Studio dashboard, CI/docs/demo and testing support.

If one person uses Codex for everything, maintain same separation as parallel sequential tasks; avoid merging large generated code changes blindly.

- Day 1: repo/DB/auth/seed, sandbox create/capture/refund vertical slice.
- Day 2: case intake, model schema, deterministic resolution quotes, merchant approval.
- Day 3: robust webhooks/reconciliation, AG Studio analytics, integration tests.
- Day 4: hardening, e2e tests, deploy, demo, README, open-source license and submission.

Priority: **working payment vertical slice > evidence analysis + policy correctness > analytics + sponsor > advanced polish**.

## 15. Devpost submission checklist

- [ ] Functional demo or reproducible steps; clearly documented seeded vs sandbox behavior.
- [ ] Public repository with valid `LICENSE`, `.env.example`, migrations, seed, test and run commands.
- [ ] Public YouTube demo under 3 minutes showing *real* functioning application and sandbox IDs.
- [ ] Clear PayPal API + AI use in written description; explain actual technical innovation.
- [ ] AG Studio (not merely AG Grid) integration proven; APIMatic use documented.
- [ ] Security: no real customer data, no secrets in repo/logs/screenshare.
- [ ] A known-good smoke test from fresh setup; links work without privileged team access.
- [ ] Honest limitations: policy is illustrative, shipping estimates synthetic, cannot infer definitive damage or fraud from images.

## 16. Documentation sources

- Hackathon: https://paypalaihackathon.devpost.com/rules
- Codex: https://github.com/openai/codex
- PayPal Orders: https://developer.paypal.com/whats-an-order/
- PayPal Refunds: https://developer.paypal.com/api/payments/v2/captures-refund
- PayPal Webhooks: https://developer.paypal.com/api/rest/webhooks/
- AG Studio: https://www.ag-grid.com/studio/react/installation/
- AG Studio AI: https://www.ag-grid.com/studio/react/ai-quickstart/
- APIMatic: https://context.apimatic.io/plugins/paypal/
- OpenAI Structured Outputs: https://developers.openai.com/api/docs/guides/structured-outputs
