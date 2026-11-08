# AGENTS.md — ReturnWise AI Engineering Contract

You are working on ReturnWise AI, a fully functional, sandbox-only PayPal AI Hackathon prototype. Read `PROJECT_BLUEPRINT.md` before making changes. The deadline is Nov 12, 2026, noon Pacific.

## Operating style
- Work in narrow, testable milestones; do not implement the entire app at once.
- Start each milestone with a short plan and the files you will change; then implement, test, report commands/results and unresolved risks.
- Prefer the simplest robust implementation. Do not add microservices, queues, Redis, billing, or unrelated features until necessary.
- Read current official provider documentation when uncertain; never invent API methods, product requirements, or sponsor award compliance.
- Keep progress in `docs/progress.md` and architectural decisions in `docs/decisions.md`.
- Ask before destructive migrations, switching to production PayPal, handling real funds, accessing external accounts, changing major libraries, or deploying.
- Never make up test results, payment status, benchmark numbers or external validations.

## Stack
Next.js App Router, strict TypeScript, React, Tailwind/shadcn, PostgreSQL + Prisma, Zod, OpenAI Structured Outputs on server, PayPal Orders v2 + Payments v2 sandbox, AG Studio React, Vitest, Playwright. Use APIMatic's PayPal Context Plugin for integration help if installed. Server-side authoritative state.

## Security / business invariants
1. The AI extracts observations/limitations only. It cannot set refund amounts, interpret law conclusively, approve cases, or call PayPal.
2. Use integer minor units and ISO currency codes for all money. Do not use floating point for financial decisions.
3. Refund only a verified capture belonging to the authenticated merchant; require authenticated human approval and policy/entitlement checks.
4. Prevent duplicate refund operations via DB uniqueness and persistent PayPal-Request-Id. Identical retry of one logical operation must use the same key.
5. Handle pending/unknown external status by reconciliation; never show success without verified PayPal status.
6. Verify PayPal webhook signatures, deduplicate by event ID, validate identifiers, and guard against out-of-order delivery.
7. Never expose client secrets/OpenAI keys to browser or version control. Use `.env.example` with fake placeholders.
8. Enforce merchant tenant scope in every query and action. Validate input and restrict uploads.
9. Where AI, data, customer acceptance, or policy is insufficient, route to manual review rather than guessing.
10. Clearly distinguish PayPal SANDBOX transactions from SIMULATED costs/analytics. Do not claim production results.

## Test and review contract
Before marking a milestone complete, run available typecheck, lint, unit/integration tests; run build/e2e on suitable milestones. Report failing commands transparently and fix them. Include at least one negative test for each payment operation. Use review mode (`/review`) for high-risk changes.

## UI / product
Merchant dashboard, return case detail/approval, customer intake link, PayPal sandbox demo checkout, AG Studio Insights. Clear status indicators: manual review, pending, approved, processing, completed, failed. Professional, accessible desktop-first design; no fake interactive controls or placeholder flows pretending success.

## Definition of done
One completed real PayPal sandbox create/approve/capture/refund flow with verified IDs; deterministic case economics and authorization; AI schema-validated extraction with safe fallback; merchant approval; audit trail; AG Studio functional dashboard; automated tests; reproducible public licensed repository; demo under three minutes.
