# Architecture decision log

All entries dated 2026-11-08 are planning decisions, not claims of implementation. Changes require a new entry explaining the reason, tests and risks.

| ID | Decision | Reason / consequence |
| --- | --- | --- |
| ADR-001 | Single Next.js Node application with PostgreSQL/Prisma | Matches contract; keeps authoritative state and service boundaries without new infrastructure. |
| ADR-002 | Payment-critical policy, approval, ledger and reconciliation start in M2 | A real refund cannot wait until later milestones for authorization or unknown-result safety. Later phases expand these controls. |
| ADR-003 | One configured sandbox merchant, USD, one item/unit and one capture per order initially | Small verifiable slice; other tenants test isolation without using the configured merchant's credentials. Unsupported cases route to review. |
| ADR-004 | Money is BigInt minor units; DTOs use decimal strings | Avoids float drift and unsafe JSON BigInt serialization. Modeled net costs may be negative; payment amounts cannot be. |
| ADR-005 | Immutable quote/decision/consent; one decision per case and operation per decision | Locks human-approved terms; duplicate clicks cannot generate new logical operations. Sequential further partials use a new reviewed case. |
| ADR-006 | Canonical ProviderRefund ledger plus persistent held reservations | Includes externally discovered refunds; prevents double counting and over-reservation. The operation exposes its provider refund ID through this relation. |
| ADR-007 | DB transactions before/after external I/O, never around it | Local atomicity cannot make PayPal atomic; crash recovery requires durable intent, leases and reconciliation. |
| ADR-008 | No automatic POST replay without verified endpoint retention | Same-key idempotency is time-bounded. Missing ID after ambiguity remains unresolved, not a new refund attempt. |
| ADR-009 | Full refund uses empty body only for fresh untouched capture | Honors documented full-refund API shape while binding the approved amount locally. Later partials explicitly carry the approved amount. |
| ADR-010 | Scoped locally issued login links and hashed DB sessions for demo | No external auth/email account needed for foundation; issuer is local-only, no shared demo password or public credential minting. Review before public use. |
| ADR-011 | AI is observation-only; Studio tools are read-only | Money, eligibility and approval remain deterministic/human. Studio proxy must constrain user-provided requests, not forward them blindly. |
| ADR-012 | Text first, images optional later | Meets runnable intake goal without speculative storage setup; image security added only with a concrete provider. |
| ADR-013 | PayPal client ID may reach JS SDK; secrets never do | Client ID is intentional public SDK configuration. Use one server-owned value and a narrow DTO; no secret/public env duplication. |
| ADR-014 | Keep existing MIT license and existing untracked planning inputs | No license choice or user-file rewrite needed. No git staging/commit performed. |
| ADR-015 | APIMatic deferred to implementation because no install was found | Public metadata/guidance reviewed; installer can modify detected assistants. Record actual installed version/diff and inspect guidance at M2a. |
| ADR-016 | Reproducible local setup is a valid submission fallback | Official rules allow runnable instructions; hosting remains an explicit approval step. Studio hosting license is unresolved. |

Detailed rationale and references: [architecture](architecture.md), [data model](data-model.md), [provider notes](provider-notes.md), [risks](risks.md).

## Phase 1 implementation decisions — 2026-11-08

- ADR-017: Implement the approved schema incrementally: Merchant/User/Session/AccessToken/Policy/Product/Order/Case/Audit now; quote, consent, payment and AI tables with the milestones that introduce them. `CUSTOMER_ACCEPT` token purpose is also deferred until there is a quote relation to enforce. Phase 1 exposes no customer token issuer or intake action.
- ADR-018: Use a project-local real PostgreSQL development launcher because the installed Docker service is stopped. It binds to 127.0.0.1:55432, preserves `.local/postgres`, writes random credentials to ignored `.env` only when absent, and never creates a system user or resets data. Conventional PostgreSQL and CI service containers remain supported.
- ADR-019: Pin stable Prisma 7.10.1 rather than the registry's Prisma 8 release candidate; use the required PostgreSQL driver adapter and generated client output. Next.js 16.4.5 / React 19.3.1 / Tailwind 4.3.5 are pinned in the lockfile.
- ADR-020: The credential issuer is an explicit local CLI. Sign-in credentials use URL fragments, are cleared from browser history, and are posted only to an exact-origin endpoint. No GET consumes a token and no HTTP endpoint mints credentials. Eight-hour sessions are DB-backed and revocable; login issuance is privileged local operator work.
- ADR-021: SQL triggers protect audit records from UPDATE/DELETE/TRUNCATE; a Phase 1 constraint prevents enabling payment operations. A later reviewed additive migration must remove that guard only as genuine sandbox operations are implemented. Hosted deployment requires a restricted runtime role, not the local owner credentials.
- ADR-022: An npm audit identified a moderate denial-of-service advisory in the development-only typescript-eslint minimatch dependency. Scope an override to minimatch 11.0.1 under that package; validate lint/types/build instead of applying npm's suggested framework downgrade. The resolved install reports zero vulnerabilities. Keep this override under review when upgrading the parser.
- ADR-023: Customer portal/analytics routes are clearly labeled future capability introductions. The merchant case dashboard reads actual persisted synthetic fixtures. No simulated provider success, approval control, AI output or savings metric is shown.
- ADR-024: Use `Referrer-Policy: same-origin`: browser testing showed `no-referrer` suppresses the real Origin on form POSTs and conflicts with strict CSRF validation. Keep exact-origin checks; fragment credentials never enter HTTP URLs. Use Playwright's supported Chromium new headless mode to avoid redundant browser downloads; desktop and mobile emulation both pass.

- ADR-025 (Phase 1 review fix): Test isolation belongs in the Vitest entry point and verified test client factory, not an npm-only wrapper. Preserve the development URL for comparison; require an explicit distinct `_test` database, restrict URL syntax to prevent ambiguous routing/defaults, and verify both server-reported database names through bounded read-only probes before Prisma construction or test migration launch. E2E fixtures share the factory. No destructive cleanup was introduced. Regression coverage includes real direct-Vitest subprocesses with zero-connection assertions; see [test database isolation](test-database-isolation.md).
