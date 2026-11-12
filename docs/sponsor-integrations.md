# Sponsor integration evidence

Final submission update (12 November): the sponsor's [official hackathon post](https://www.ag-grid.com/blog/build-a-payments-dashboard-without-building-a-dashboard/#whats-next-the-paypal-ai-hackathon) specifically offers judging-period licence-key support, superseding the earlier generic-trial-only assessment below. The public key/domain activation still needs clarification; no paid licence purchase or hosted gate bypass occurred. Current evidence, native local screenshots and a prepared (unsent) sponsor inquiry are in [sponsor-evidence.md](sponsor-evidence.md). Render is now genuinely deployed and verified; historical “no host selected” checkpoints below are preserved as history, not current status.

Phase 7A hosting note: a locally validated Studio Pro AI trial expires 27 December 2026. General trial terms restrict use to internal evaluation, so public hosted Studio remains disabled pending confirmation for the hackathon domain. The public table fallback is explicitly ordinary HTML and is not claimed as AG Studio. Existing Phase 6 native Studio/Agent Framework code and genuine local DeepSeek evidence remain preserved. No new APIMatic work or sponsor eligibility is claimed during deployment preparation.

## Phase 6 — actual AG Studio integration, 2026-11-12

Installed pinned `ag-studio-react@3.1.0` and `ag-studio@3.1.0`, with matched AG Grid 36.3.x and AG Charts 14.3.x. The authenticated Analytics page uses actual AgStudio, local data engine/field definitions, grouped bar and line charts, grids, cross-filtering, configurable layouts, edit/view mode, merchant-scoped Save/Reset and mobile single-column layouts. Native widgets support comparing equivalent full-refund economics with clearly labeled configured estimates; verified Sandbox refunds are separate database aggregates. No ordinary-chart substitute or custom-widget claim is made.

Agent Framework code uses `AgStudioAiModule`, `createAiHarness`, a custom server-backed runner and native assistant UI/prompt starters. DeepSeek Chat Completions function calls are explicitly adapted and constrained to one read-only aggregate tool, with shared persistent budget reservations and strict schemas. The example OpenAI Responses adapter was not reused or represented as compatible by assumption. Genuine runtime status, screenshots, provider usage/cost and final checks are recorded in [Phase 6 verification](phase-6-analytics.md); implementation alone is not evidence of a successful paid request.

This integration makes persisted decision assumptions explorable: merchant-controlled Studio reports show physical-return versus returnless costs, recoverable value and the modeled baseline advantage alongside verified PayPal results. AI can select a safe analytical question, while exact facts remain server-authoritative. No customer photographs, descriptions, access tokens or provider secrets enter the Studio dataset or analytics provider. Production licences/AI entitlement and sponsor eligibility remain separate external requirements; no award compliance is asserted.

## Phase 5 follow-up review — 2026-11-11

Actually read installed APIMatic PayPal 0.4.1 `typescript-integrate-paypal` and `typescript-configuration-resilience` skill guidance from the Codex plugin cache. Used its durable-claim, unknown-outcome, bounded-transport and safe-logging guidance to review `CaseRefundService` delegating to the existing `PaymentService`; retained commit-before-network, stored payload/request ID and explicit original-operation recovery. Case refund integration regressions cover concurrent confirmation, pending/unknown recovery and duplicate webhook synchronization. Official Payments v2 and idempotency references were checked. No new generated SDK, provider endpoint or sponsor eligibility claim was introduced. Generated-SDK-specific setup gates were outside this native REST adapter's scope. AG Studio remains unimplemented.

## Current update — Phase 2.5, 2026-11-09

**APIMatic guidance was successfully read and used in this milestone.** The earlier unavailable status below is historical. Genuine PayPal capture and partial refund have also been verified; see [Phase 2.5 evidence](phase-2.5-verification.md). No sponsor eligibility or award outcome is asserted.

Commands: `npx.cmd --yes context-plugins@0.12.0 doctor`, followed by `npx.cmd --yes context-plugins@0.12.0 install paypal --targets codex --yes` with installer telemetry disabled for installation (`$env:DO_NOT_TRACK='1'`). Doctor found the existing VS Code installation, recognized Codex and reached the marketplace. The installation registry subsequently listed both `vscode` and `codex`; Codex configuration contains the context-plugins marketplace and enabled `paypal@context-plugins` entry. The available tool catalog did not dynamically gain an APIMatic MCP tool; local plugin guidance was accessible directly.

Installed content actually inspected: `%USERPROFILE%\.context-plugins\vscode\paypal\.claude-plugin\plugin.json` reports **PayPal 0.4.1, APIMatic, MIT**. Relevant `SKILL.md` files under `skills/typescript/` included `typescript-integrate-paypal`, `typescript-getting-started`, `typescript-authentication`, `typescript-configuration-resilience`, `typescript-error-handling`, and `typescript-testing`. Review focused on durable intent, unknown outcomes, OAuth caching, retry boundaries, bounded transport, safe logging and separate live/mock verification.

Concrete contribution: `tests/integration/payments.test.ts` now checks committed capture intent and the exact refund reservation/payload/request ID **from inside the mocked outbound provider call**, following the plugin's claim-before-call recommendation. This regression passed in both 36-test PostgreSQL runs. `tests/unit/paypal.test.ts` checks that the credential-only OAuth diagnostic does not expose a token or accept live mode. The isolated smoke command follows the plugin testing guidance to keep genuine external checks separate from mocked suites.

The plugin's generated SDK workflow is scoped to package `paypal`/`PaypalClient`. ReturnWise retains its working typed REST adapter and official buyer SDK; no generated server SDK was installed or substituted. Its generic `Idempotency-Key` discussion was **not** copied: the adapter continues sending the persisted `PayPal-Request-Id` required by [official PayPal idempotency documentation](https://developer.paypal.com/api/rest/reference/idempotency/). Endpoint paths, wire schemas and supported error/retry semantics remain grounded in the official references listed in the Phase 2 report, not inferred from generic SDK examples. No payment service defect requiring an architectural rewrite was found by this targeted review.

The plugin was used as review/testing guidance, not as a runtime PayPal connector or as the code generator for the pre-existing integration. Installation and MIT metadata alone are not represented as sponsor contribution.

## Historical inspection checkpoints

Status on 2026-11-08: planning only. No sponsor integration has been implemented or tested.

Update 2026-11-09: PayPal REST and official SDK v6 integration are implemented and mock-tested; genuine Sandbox execution remains unverified. APIMatic was still unavailable in the repository, inspected user skills/plugin directories, and tool catalog. No installed version, generated files, or APIMatic guidance was available. The authorized fallback was current official PayPal documentation. Historical Phase 0 inventory below is retained; do not describe this as APIMatic-assisted or claim sponsor eligibility. See [Phase 2 evidence](phase-2-verification.md). AG Studio and deployment remain deferred.

## APIMatic PayPal Context Plugin

- Repository inventory contains no `.agents`, `.codex`, `.claude`, plugin-generated guidance, package manifest or installed dependencies.
- Available tool/skill catalog exposes no APIMatic or PayPal context tool. Plugin Management discovery for `APIMatic PayPal` returned no matches. This search is not an exhaustive assertion about all possible installations or the [plugin directory](https://chatgpt.com/plugins).
- Global npm inventory lists only `@opencode/cli@2.0.27`; no global `context-plugins` executable was found on PATH. The inspected user skill locations did not contain an APIMatic/PayPal skill.
- Public [APIMatic PayPal marketplace](https://context.apimatic.io/plugins/paypal/) lists version 0.4.1, MIT license, Node 18+, generated SDK/context skills, and install command `npx context-plugins install paypal`.
- That version is **marketplace metadata**, not an installed version. No installer was run and no generated plugin was available to read. Phase 0 preserves the user's no-code/no-install inspection scope.

At M2a, inspect the installer and its target locations before running it from the project root; it advertises installing to detected assistants. Pin/record the resolved CLI/plugin versions and license, review all generated diffs, read relevant authentication/endpoints/error/resilience/testing guidance, and verify against official PayPal REST references. Avoid automatic SDK retries that replace our persistent request IDs or replay uncertain operations without policy.

Required evidence to fill after actual integration:

| Evidence | Current status |
| --- | --- |
| Exact install command, CLI/plugin versions and install locations | Not run |
| Files generated or modified | None |
| Guidance applied to concrete source files | None |
| Actual create/capture/refund and negative tests attributable to integration | Not run |
| Generated dependency license review | Not performed; marketplace says MIT |

## AG Studio — preserved Phase 0 planning

The implemented Phase 6 evidence at the top supersedes the historical unavailable fields below.

Proposed integration: tenant-scoped persisted case/payment data, clearly labeled modeled economics, interactive Studio dashboard and functional read-only analytics agent through an authenticated server LLM proxy. [Installation](https://www.ag-grid.com/studio/react/installation/) and [Agent Quick Start](https://www.ag-grid.com/studio/react/ai-quickstart/) were read.

Installed versions, matching peer dependencies, license entitlement, implementation paths, demo query result and tests: **not yet available**. Basic AG Grid is not a substitute for the project's Studio requirement. Do not claim integration success or award compliance before M6 evidence exists.

## Render / hosting

No host selected, account accessed or deployment performed. Full setup instructions are a valid delivery option under the [official rules](https://paypalaihackathon.devpost.com/rules). If targeting a hosting sponsor, review actual eligibility and approval requirements before choosing/deploying; no sponsor result is promised.
