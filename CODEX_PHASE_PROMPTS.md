# ReturnWise AI — Copy-paste Codex Phase Prompts

Use inside the local repository containing `PROJECT_BLUEPRINT.md` and `AGENTS.md`. Complete and verify each phase before the next. Do **not** paste all phases in one turn. Model names reflect OpenAI guidance as of November 2026; select the nearest available model in your Codex model picker if one is unavailable. These recommendations are for Codex development, not the model that runs within the ReturnWise application.

## Phase 0 — Plan without changing code

**Suggested Codex model: GPT-6 Astra · High reasoning.** Fallback: GPT-6.1 Sol · High.

Read AGENTS.md and PROJECT_BLUEPRINT.md thoroughly. We are creating ReturnWise AI for the PayPal AI Hackathon. First inspect the repo and current installed tooling. Do not write code yet. Produce: (1) architecture diagram (as Mermaid source in docs), (2) milestone-by-milestone implementation plan, (3) proposed Prisma data model, (4) risk list ranked by severity, (5) exact environment variables needed, (6) commands to verify baseline. Focus on a REAL PayPal sandbox capture-to-refund vertical slice and deterministic financial correctness. Ask me only for credentials when the code reaches an actual integration step; never request secrets in chat. Do not guess API methods; read official docs and installed APIMatic plugin.

## Phase 1 — Scaffold and base tests

**Suggested Codex model: GPT-6.1 Sol · Medium reasoning.**

Implement only the project foundation from blueprint: Next.js App Router + strict TS, Tailwind/shadcn, Prisma/Postgres migrations, Zod, seed with illustrative merchant/products/orders/cases, auth and merchant-scoped authorization, unit-test setup, basic merchant shell UI. Add .env.example, README, LICENSE placeholder choice only if needed (ask before choosing license), docs/progress.md, CI workflow. No AI and no PayPal requests in this phase. Make a working local app; run typecheck, lint, unit tests and build. Summarize modified files and exact commands/results.

## Phase 2 — Genuine PayPal vertical slice (highest priority)

**Suggested Codex model: GPT-6 Astra · High reasoning.** Fallback: GPT-6.1 Sol · High.

Add PayPal sandbox checkout and capture against a sandbox merchant and buyer, then a merchant-approved full refund from an actual capture. Follow current official Orders v2/Payments v2 docs and the APIMatic PayPal Context Plugin if installed. Store PayPal order ID, capture ID, merchant, currency and amount. Implement a persistent idempotency key for the refund request; do not issue a second refund from duplicate clicks. Build a safe state machine and display actual PayPal IDs and responses. No fake success data. Implement error handling, credentials only on server, tests for successful and failing operations, timeouts, wrong merchant, duplicate requests, and refund greater than balance. Do not proceed until one end-to-end sandbox transaction works. Report failures honestly.

## Phase 3 — Deterministic policies and case engine

**Suggested Codex model: GPT-6.1 Sol · High reasoning.**

Implement customer case intake with secure scoped token; merchant case queue and detail; seller policy model; 3-4 allowed resolution types; integer-cents costs and comparisons; explicit manual review; decision approval and audit events. Add case A (return costs > recovery), B (high salvage value), C (uncertain/no eligibility), all with inputs and transparent calculations. AI must not decide money or entitlement. Customer acceptance required before partial-refund-keep execution. Implement exhaustive unit tests for policy and money, tenant isolation, expired tokens, over-refunds and invalid state transitions. Typecheck, test, build.

## Phase 4 — AI evidence extraction

**Suggested Codex model: GPT-6.1 Sol · High reasoning.** Consider Astra High for difficult model/schema failures.

Add a server-only OpenAI Structured Outputs service with Zod schema for caseSummary, claimedIssue, visibleObservations, evidenceLimitations, possiblePolicyQuestions, uncertainty, requiresHumanReview. Read official current OpenAI API docs; choose a compatible model with image input only if image support is needed. Untrusted claim text/photos cannot affect system rules. Handle missing model key, refusal, timeout, malformed output, high uncertainty with a useful manual-review path. Rate-limit, cache by evidence hash+model/schema version, and create an evaluation script with at least 20 synthetic cases. Don't claim model accuracy without measuring it. Keep business decisions deterministic. Test failure behavior.

## Phase 5 — Robust refunds, webhook and reconciliation

**Suggested Codex model: GPT-6 Astra · High reasoning.** Fallback: GPT-6.1 Sol · High.

Implement PayPal webhook signature verification with official PayPal instructions, unique webhook event dedupe, correct capture/refund matching, out-of-order safety, reconciliation of pending/uncertain refund operations, and approved partial refund flow. Ensure one RefundOperation per approved decision and a persistent PayPal-Request-Id. No duplicate financial actions. Include integration tests using fixtures/mock provider with delayed/duplicate/untrusted webhook events and timeouts; test sandbox behavior where possible. Show refund status timeline and audit log in merchant UI. Do not ever turn on live PayPal.

## Phase 6 — AG Studio sponsor integration

**Suggested Codex model: GPT-6.1 Sol · Medium reasoning.**

Use AG Studio React (`ag-studio-react`) and current version-compatible docs to build Insights from persisted data. Use real sandbox payment states and clearly-labeled synthetic economics. Enable the AG Studio AI Agent Framework through a backend proxy; do NOT send OpenAI API key from the browser. Build a useful read-only analytics query, e.g. 'Show the cases where handling costs exceed expected recovery value by product category.' Follow official Quick Start and test build in Next.js SSR environment (client-only wrapper if required). Document precisely why AG Studio is essential and what the agent does. Do not substitute basic AG Grid and claim it is Studio.

## Phase 7 — Hardening, polish and submission

**Suggested Codex model: GPT-6 Astra · High reasoning.** Fallback: GPT-6.1 Sol · High.

Review whole repo for security, correctness, accessibility, real-vs-simulated distinction, testing, webhooks, OAuth secrets and multi-tenant access. Run `/review` focused on payment safety, fix high severity findings, and run lint, typecheck, tests, build, Playwright e2e. Create an excellent README with architecture, env vars, sandbox setup, exact run/seed commands, reproducible demo, screenshot placeholders, open-source license and known limitations. Prepare a scripted <3 minute video showing a real capture ID + real refund ID + case costs + AG Studio agent visualization. Ensure judges can test without access to secrets. Update docs/progress.md with exact status and blockers. Do not invent proof of functionality.

## Optional full-day Codex review prompt

**Suggested Codex model: GPT-6 Astra · Extra High reasoning.**

Review the ReturnWise AI repository as a skeptical payments security engineer and hackathon judge. Report prioritized issues with file/line references. Focus on authorization, multi-tenant leakage, input validation, idempotency, PayPal refund lifecycle, webhook signatures/replays, currency math, customer fairness, use of AG Studio Agent Framework, test coverage, dead buttons and static fake data. Don't change files in the first pass. Then propose an ordered minimal fix plan.
