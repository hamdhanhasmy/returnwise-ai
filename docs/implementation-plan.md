# Implementation milestones

Plan dated 2026-11-08. No application implementation is included in Phase 0. Each milestone starts with its file list, then implementation, focused verification, documented results and unresolved risks. Do not start the next milestone until its safety gate passes. The existing MIT license remains unchanged.

Deadline: November 12, 2026, 12:00 PST = November 13, 01:30 Asia/Colombo. The [official rules](https://paypalaihackathon.devpost.com/rules) confirm the deadline, sandbox-plus-AI requirement, public licensed source, functional demo or complete run instructions, and video under three minutes. Internal target: freeze November 12, 18:00 Colombo, leaving submission buffer. This schedule is a target, not a delivery claim.

## M0 — Planning and baseline (November 8)

Files: `docs/architecture.md`, `docs/implementation-plan.md`, `docs/data-model.md`, `docs/risks.md`, `docs/environment.md`, `docs/baseline.md`, `docs/provider-notes.md`, `docs/sponsor-integrations.md`, `docs/progress.md`, `docs/decisions.md`.

Deliver the requested designs, inspect tools, verify provider methods, record blockers. Gate: documents exist, internal links resolve, diff whitespace checks pass. Application checks are unavailable until a scaffold exists; never report them as passing.

## M1 — Runnable foundation and isolation (November 8)

Files: `package.json`, lockfile, TypeScript/ESLint/Next/Tailwind config, `src/app/layout.tsx`, merchant shell/login, `src/lib/{auth,db,validation,money}`, `prisma/schema.prisma`, `prisma.config.ts` if required by chosen version, initial migrations and seed, `tests/{unit,integration}`, CI, `.env.example`, README, progress/decisions.

Pin compatible Next/React/Prisma/Zod/Vitest/Playwright releases and record their versions; use npm and the installed Node 24 runtime after compatibility checks. Add shadcn components as needed. Bring up an explicitly dedicated development/test PostgreSQL instance; Docker is currently stopped. Auth is the scoped local login-link design in architecture. Seed two tenants for isolation tests, products, policies and simulated cases A/B/C; seeded orders have no fabricated PayPal IDs. Begin with one product and quantity one per order.

Gate: typecheck, lint, unit tests, real PostgreSQL integration tests, Prisma validation and build pass. Verify missing/expired/reused login tokens, cross-tenant reads/writes, unauthenticated requests, money parsing/serialization and disabled payment controls. No provider credentials or PayPal/OpenAI calls required. Preserve the existing project contract if a scaffold tool offers to generate `AGENTS.md`.

## M2a — Real sandbox checkout and verified capture (November 9, first)

Files: `src/lib/payments/{paypal-client,schemas}`, checkout/order/capture services, `src/app/demo`, order and capture route handlers, payment persistence migration, payment tests, `docs/paypal-sandbox-runbook.md`, provider/sponsor/progress notes.

Before integration, inspect/install the APIMatic context package deliberately, record version/license/generated diff, and read its actual guidance. Use official APIs to verify it. Only now request local sandbox configuration through an ignored environment file or secret manager; never ask for values in chat. Ask for external-account access when needed. The user performs sandbox buyer approval. Persist create/capture request IDs and payloads before sending requests. Verify configured merchant/payee and one expected capture for one expected USD amount.

Gate: one genuine create -> buyer approve -> capture with stored, freshly verified IDs. Tests include tampered totals, foreign order IDs, unapproved capture, repeat create/capture, timeout, provider error and pending/mismatched capture. Pending is not completed. Typecheck/lint/unit/integration/build pass; browser checkout wiring tested with provider fixtures, actual sandbox approval recorded separately. Do not infer a live result from mocks.

## M2b — Human-approved full refund (November 9, next)

Files: approval and quote services, `src/lib/policy`, refund adapter/executor/reconciler, minimal case detail and confirmation UI, operation/ledger/audit persistence, webhook route and verification, tests and sandbox runbook.

Move essential policy, human approval, capture locking/reservations, immutable quote/decision, persistent idempotency, verification and audit into this milestone. The later policy milestone expands these; it cannot be a prerequisite deferred past the first refund. Start with full-refund-keep on a fresh capture and a manually verified illustrative policy. Implement conservative unknown-result reconciliation and signature verification immediately if the webhook endpoint is enabled. Confirm endpoint-specific retry retention before enabling any POST retry.

Gate: complete one real sandbox create/approve/capture/merchant-approve/refund flow, storing actual order/capture/refund IDs, matching money/merchant, verification times and an audit trail. Re-fetch the refund after a process restart. Demonstrate repeated approval creates one decision/operation/key. Negative tests: no capture, wrong tenant/role, policy failure, expired quote, zero/negative/over-refund, currency mismatch, changed payload on retry, timeout, crash after send, duplicate/unverified webhooks. Concurrency test uses two DB connections. `/review` is required for payment/auth changes, with findings resolved. Stop here if real verification fails; no simulated substitute.

## M3 — Customer intake and deterministic choices (November 10, first)

Files: customer routes/pages, scoped token/consent services, case queue/detail, policy and quote engine, immutable offer and receipt records, seed/evaluation fixtures, tests and docs.

Implement full keep, full return and partial keep as gated choices plus manual review. Record return-condition fulfillment for full return and explicit quote-bound customer consent for partial keep. Receipt/shipping inputs are manual or simulated, labeled accordingly. Block partial execution until M5 reconciliation gates pass. Recompute/version quotes on input changes. Document reasons for every excluded choice; no conclusive legal inference.

Gate: at least 20 labeled synthetic policy scenarios; pure integer cost arithmetic; expired/consumed/wrong-purpose tokens rejected; tenant isolation; stale quote/policy/consent rejected; pending refunds reserve balance; uncertain entitlement routes to review. Show all A/B/C examples and their assumptions. Typecheck/lint/unit/integration/build and customer-flow browser tests pass.

## M4 — Safe evidence extraction (November 10, next)

Files: `src/lib/ai`, analyze route/service/UI, analysis persistence, schemas, `docs/evaluation.md`, AI fixture/evaluation tests.

Implement the blueprint observation schema with server-side OpenAI Structured Outputs and runtime validation. Select and pin a model only after verifying capabilities and account access at this milestone. Bound requests, rate-limit and cache by input, prompt, schema and model versions. Text is required; image upload is an optional separate increment with a concrete storage provider and env contract. Missing key/API refusal/outage must preserve usable manual review.

Gate: invalid/incomplete output, refusal, prompt injection, high uncertainty, cache invalidation and timeout tests; no AI field/tool can set money or execute payments. Report live evaluation results only after actually running the labeled dataset, with manual labels and limitations. Typecheck/lint/unit/integration/build pass; real API smoke test is separately authorized and recorded.

## M5 — Reconciliation and approved partial refunds (November 11, first)

Files: webhook/reconciliation services, refund ledger/reservations, partial execution, timeline UI, concurrency/restart integration tests and runbook.

Expand the early safety implementation: pending/failed/reversed/out-of-order events; verified refund-to-capture mapping; externally originated refunds; crash recovery; bounded leased retries and documented retention. Pending/unknown operations retain reservations. Process externally discovered refunds without inventing a human decision. Disable a capture if the ledger cannot explain its state. Enable partial execution only with exact consent and reconciled remaining balance.

Gate: real sandbox partial refund followed by another permitted partial (or remaining refund) on a separate fresh capture; aggregate bounded by original captured amount. Concurrent decisions cannot over-reserve. Invalid signatures, duplicate events, pending-before-completed and delayed old events are safe. Unknown refund ID never causes blind replay. Restart resumes persisted work. Full test suite and build; `/review` for payment and webhook changes. Record any sandbox status that cannot be induced; fixture coverage is not provider validation.

## M6 — Functional AG Studio Insights (November 11, next)

Files: Insights client wrapper, authorized analytics projection/query service, authenticated LLM proxy, version-compatible Studio adapter, integration/browser tests, sponsor notes.

Use actual persisted case/payment data and explicitly simulated economics. Build one useful agent query: group cases where return shipping plus handling exceeds recovery by category. Register the Studio AI module; adapt its example OpenAI adapter through the server proxy. Resolve matching package versions and license conditions before hosting. Data/tool access is tenant scoped and read-only; dashboard editing is UI state only.

Gate: agent actually changes a working Studio visualization using authorized data; no browser secret or payment tool; wrong-tenant requests rejected; SSR/build verified; modeled savings labels and currency grouping tested. Typecheck/lint/unit/integration/build and Insights browser tests pass. Do not claim prize eligibility merely from installation.

## M7 — Hardening and reproducible submission (November 12)

Files: targeted fixes, README/setup runbook, CI, evaluation and demo script, screenshots, progress and limitations. Hosting configuration only after explicit deployment approval.

Run `/review` over payments, auth, tokens, webhooks, secrets, AI boundaries and tenant queries. Fresh-install smoke test with migrations, seed and separate test DB. Full typecheck/lint/unit/integration/build/Playwright. Validate keyboard behavior at desktop demo size, useful failure/loading states, no dead controls, no seeded data masquerading as real sandbox activity. Retain MIT license and document third-party licenses.

Gate: under-three-minute video shows a real sandbox capture/refund and honest IDs, deterministic quote, human approval, safe AI extraction and functional Studio. Provide runnable public licensed repository or approved hosting, with special-access instructions that keep provider secrets private. Judge access remains usable for the judging period. Publishing, deployment, account access and destructive migrations require the contract's approval; preparation and local checks do not.

## Timebox and scope cuts

The critical path is M1 -> M2a -> M2b. Do not spend the first days polishing analytics. If behind, defer images, multiple currencies, multi-item orders, new merchant onboarding, replacement/fulfillment integration, automatic scheduling and advanced design polish. Preserve payment correctness, required AI/Studio functionality and reproducibility. A reduced demo must explicitly disclose deferred partial or image support; never mark the full blueprint done if its acceptance criteria remain unmet.

Commands and exact planned npm script meanings are in [baseline.md](baseline.md). Every milestone updates [progress](progress.md) with commands, outcomes and remaining gates; architectural changes go in [decisions](decisions.md).
