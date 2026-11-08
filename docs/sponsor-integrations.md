# Sponsor integration evidence

Status on 2026-11-08: planning only. No sponsor integration has been implemented or tested.

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

## AG Studio

Proposed integration: tenant-scoped persisted case/payment data, clearly labeled modeled economics, interactive Studio dashboard and functional read-only analytics agent through an authenticated server LLM proxy. [Installation](https://www.ag-grid.com/studio/react/installation/) and [Agent Quick Start](https://www.ag-grid.com/studio/react/ai-quickstart/) were read.

Installed versions, matching peer dependencies, license entitlement, implementation paths, demo query result and tests: **not yet available**. Basic AG Grid is not a substitute for the project's Studio requirement. Do not claim integration success or award compliance before M6 evidence exists.

## Render / hosting

No host selected, account accessed or deployment performed. Full setup instructions are a valid delivery option under the [official rules](https://paypalaihackathon.devpost.com/rules). If targeting a hosting sponsor, review actual eligibility and approval requirements before choosing/deploying; no sponsor result is promised.
