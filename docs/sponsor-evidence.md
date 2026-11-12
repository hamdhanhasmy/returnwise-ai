# Sponsor evidence — final submission

This index describes actual work and observed verification. It does not assert a prize outcome or expand licensing rights. Earlier reports retain historical statuses; this summary supersedes their outdated “unimplemented” checkpoints.

## AG Grid / AG Studio

**Implemented:** pinned `ag-studio-react@3.1.0` and `ag-studio@3.1.0`, compatible Grid 36.3.x / Charts 14.3.x, actual `<AgStudio>` and its data engine, grouped bars/line charts/grids, native cross-filtering, report edit/view, per-merchant session layouts, Economics lab and case drill-through. Desktop supports native layout editing and assistant; mobile supports responsive report exploration. No custom-widget claim.

**Agent Framework:** `AgStudioAiModule`, `createAiHarness`, a custom DeepSeek runner and native conversation panel. Backend selects from allowlisted read-only aggregate tools, validates empty arguments, computes exact answers, rechecks administrator/tenant scope, and reserves spend under the shared cap. One bounded function-selection request, not an assumed OpenAI Responses adapter. No database write/payment/policy tool or private-image/customer dataset is exposed to the model.

**Genuine local result:** DeepSeek selected `verified_refunds`, 589 input / 17 output tokens, 1,004 ms, estimated **$0.0001971**. Native Studio displayed three previously completed Sandbox refunds totaling **$6.00**, zero pending; the repeated question used cache without another request. This is the preserved $0.40/$0.60/$5 history, not three new payments. [Phase 6 report](phase-6-analytics.md).

**Inspectable source:** `src/components/analytics/`, `src/server/services/analytics.ts`, `src/server/services/analytics-agent.ts`, `src/app/api/analytics/` and `tests/` (use repository search if a module was subsequently renamed). Exact source inventory is in the release report.

**Evidence:** [genuine local Studio overview](images/ag-studio-local.png), [genuine cached native assistant](images/ag-studio-agent-local.png). The sidebar contains only fictional seeded merchant identity; no private capability or provider secret is shown. Public screenshots are separately labeled; the hosted ordinary-table fallback is not native Studio.

**Updated licence finding (12 November):** the sponsor's [official hackathon post](https://www.ag-grid.com/blog/build-a-payments-dashboard-without-building-a-dashboard/#whats-next-the-paypal-ai-hackathon) specifically offers judging-period licence-key support. This addresses the earlier generic-trial concern at the policy level, but the supplied public-domain/key activation has not been confirmed with the sponsor. Existing technically valid Studio Pro AI trial expires 27 December 2026. Keep the hosted gate off until the sponsor confirms the usable key/domain/AI entitlement. No paid purchase or licence bypass is proposed. Actual local Studio/assistant footage should be included in the video.

### Copy-ready sponsor inquiry — prepared, not sent

Subject: PayPal AI Hackathon — ReturnWise AI public AG Studio judging key

Hello AG Studio team,

ReturnWise AI uses AG Studio React 3.1.0 with native charts, grids, cross-filtering, editable reports and an Agent Framework custom DeepSeek runner restricted to server-computed, read-only return analytics. Your 6 November hackathon post offers licence-key support for judging.

Could you confirm or provide a free hackathon key for **https://returnwise-ai-t6sv.onrender.com**, including Studio AI entitlement through **15 December 2026**, and whether our existing trial key is appropriate for that public judge demo? We currently keep hosted Studio disabled with an explicitly labeled table fallback; genuine local Studio and cached assistant evidence are in the repository/video materials. No real customer data or public financial actions are exposed.

Code: https://github.com/hamdhanhasmy/returnwise-ai
Devpost: **[ADD PROJECT URL WHEN AVAILABLE]**

Thank you,
**[TEAM REPRESENTATIVE NAME]**

Send privately through the sponsor's linked official contact/Discord channel; do not post the licence key. This document has not sent any message.

## APIMatic

Actually installed/read **PayPal Context Plugin 0.4.1** (installer 0.12.0) during Phase 2.5, with subsequent Phase 5 guidance review. Contribution: durable intent before external I/O, persistent request-ID/payload recovery, bounded retries/timeouts and safe errors/logging. `tests/integration/payments.test.ts` checks committed capture intent and refund reservation/payload/request ID from inside mocked outbound calls. Case integration retains those boundaries. Official PayPal contracts remain authoritative; generic SDK idempotency examples were not copied over PayPal's documented header.

This was integration-review/testing guidance, not a generated runtime connector. No new APIMatic use is claimed in this documentation-only release. [Detailed provenance](sponsor-integrations.md), [Phase 2.5 genuine verification](phase-2.5-verification.md), [Phase 5 financial orchestration](phase-5-orchestration.md).

## Render

Actual public Free Node web service plus Free PostgreSQL in Ohio; HTTPS at **https://returnwise-ai-t6sv.onrender.com**. Next.js builds with Prisma generation; a restricted runtime database role has no DDL/payment deletion/truncation/audit update privilege. Additive owner migrations stay off the runtime. No paid disks/jobs/upgrades or payment method; private evidence is on Supabase, not ephemeral disk.

Observed checks include public HTTPS routes, clean desktop/mobile exploration, session flags/auth rejection, and an actual restart with new-process logs, unchanged DB fingerprint and preserved private image hashes. Temporary probe objects were deleted; no payment/AI operation ran. [Public screenshot](images/public-home.png), [deployment runbook](phase-7a-deployment.md), [final release checks](phase-7-release.md).

The read-only snapshot is distinct from the hosted ledger. Current Free DB expiry is 12 December, so [continuity work](database-continuity.md) is required before judging ends; no paid renewal or automatic migration is claimed. Sponsor category acceptance is determined by the organizers, not this document.
