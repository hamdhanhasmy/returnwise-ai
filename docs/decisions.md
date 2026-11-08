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
