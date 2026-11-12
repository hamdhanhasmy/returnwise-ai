# ReturnWise AI — Devpost submission copy

Ready-to-paste project description. Replace the YouTube/team placeholders before submitting. This file is preparation, not a submitted Devpost entry.

## 1. Project name

ReturnWise AI

## 2. One-line tagline

Turn return evidence into explainable decisions and verified PayPal refunds—with humans in control.

## 3. The problem

A damaged item can cost more to ship back and inspect than a merchant can recover from it. Yet a cheaper remedy is not automatically the right remedy. Merchants need to understand the evidence, respect their policy and the customer's entitlement, compare costs, and know whether a refund actually completed. These decisions often live in disconnected support, analytics and payment tools.

## 4. Who it helps

Small and growing online merchants handling product-return requests, their support teams, and customers who need a clear resolution. ReturnWise is a hackathon prototype; we do not claim paying customers or production adoption.

## 5. How ReturnWise works

A customer opens an expiring order-scoped link, describes the issue, and can upload a private image with separate consent for AI processing. DeepSeek extracts observations and uncertainty. A deterministic engine checks versioned merchant rules and compares eligible financial options using persisted amounts and configured estimates. A merchant reviews the evidence, proposes exact terms, obtains customer agreement when required, and separately authorizes the refund. ReturnWise reuses the original verified PayPal capture, reserves the amount durably, and closes the case only after a completed refund and reconciled ledger.

## 6. Core AI capabilities

DeepSeek Flash vision returns schema-validated evidence observations, issue classifications, limitations and missing information. Ambiguous evidence stays visible for human review; it is not proof of fraud. The application deduplicates analysis, caches unchanged evidence, records token usage and reserves estimated cost under a server-side spending cap. A second, read-only analytics interaction uses DeepSeek tool selection inside AG Studio's native Agent Framework. Neither AI path can price, approve or execute a refund.

## 7. Why PayPal is essential

PayPal is the financial execution and verification layer, not a decorative checkout button. Orders v2 supplies genuine buyer-approved Sandbox purchases and captures; Payments v2 supplies refunds against those captures. Durable request IDs, integer reservations, authenticated retrieval and verified webhooks handle retries, uncertainty and duplicate delivery. We verified a $1 capture with $0.40 and $0.60 refunds, then a separate $5 case-linked capture and full refund. Both captures are fully refunded; no production funds were used.

## 8. Financial decision-engine innovation

ReturnWise separates observations, eligibility, economics, consent and payment authority. Among equivalent permitted full remedies, physical-return cost is refund + shipping + handling/disposal − estimated recovery; returnless cost is refund + applicable unavoidable costs. All calculations use integer minor units. Partial settlements require exact customer agreement and are never counted as equivalent full-refund savings.

Our three synthetic scenarios produce different outcomes: a damaged bowl favors returnless refund, a recoverable lamp favors physical return, and an ambiguous request requires manual review. Against a physical-return baseline, the two comparable cases cost $178 versus $165 for the selected full remedies: **$13 modeled cost avoidance**, with the third case excluded for review. These are configured estimates, not measured merchant savings. The additional verified $5 case has its own $2.75 modeled comparison; it does not change the original three-scenario claim.

## 9. Architecture and stack

A single Next.js App Router application uses strict TypeScript, React, Tailwind/shadcn, PostgreSQL, Prisma and Zod. Server services own authorization, immutable policy/evaluation snapshots, financial reservations and audit records. Private Supabase Storage holds new hosted evidence; legacy local database images remain supported. Vitest and Playwright cover the deterministic, persistence and UI boundaries. PayPal and DeepSeek secrets remain server-side.

## 10. AG Studio integration

Actual `ag-studio-react` / `ag-studio` **3.1.0** powers the authenticated Return Intelligence workspace: native charts, grids, filtering, report customization, saved session layouts and case navigation. Its Agent Framework uses a custom DeepSeek runner with allowlisted read-only aggregate tools; exact answers come from the server. A genuine request used 589 input and 17 output tokens, with estimated cost $0.0001971; the repeated question was served from cache. Local implementation and screenshots are available. The hosted ordinary-table fallback is explicitly not AG Studio while the hackathon key/domain activation is clarified.

## 11. APIMatic integration

The installed APIMatic PayPal Context Plugin 0.4.1 informed review of durable intent, uncertain outcomes, retries and safe logging. A concrete regression checks committed capture/refund intent, reserved amount, payload and persistent PayPal request ID from inside the mocked outbound call. We retained our existing REST adapter and verified provider contracts against official PayPal documentation; we do not claim a generated SDK implementation.

## 12. Render integration

Render Free hosts the public HTTPS application and a separate Free PostgreSQL database. A restricted runtime role, explicit safe migrations, bounded health check and private Supabase object storage preserve the security boundary. Real restart checks confirmed database and private-image persistence. The public **Try demo** experience is deliberately read-only and uses reviewed published snapshots; it is not an unrestricted hosted customer-to-refund workflow.

## 13. Technical challenges

The hardest problems were financial ambiguity after a timeout, exact offer/version binding, concurrent refund reservations, and separating a model's observation from authority to move money. We also corrected PostgreSQL session timezone handling and conservatively excluded historical uncertain dates from time-dependent decisions. Hosted Free limits and sponsor licensing required an honest, bounded public demonstration.

## 14. What we learned

A successful API submission is not the same as a completed refund. Reliable AI-assisted commerce needs durable intent, verified provider state, reproducible calculations and clear human responsibility. An analytics assistant is more trustworthy when it selects a narrow tool and the server supplies exact facts rather than accepting model-invented financial results.

## 15. Verification evidence

Previously verified genuine external operations include the complete $5 Sandbox case-to-refund journey, stored/displayed DeepSeek assessment, and an earlier authenticated transaction-generated webhook. Routine automated tests use provider mocks and an isolated PostgreSQL test database; genuine smoke helpers are separate. The final release command/results record is [phase-7-release.md](phase-7-release.md). Prior full baseline: 158 unit, 107 integration and 38 desktop/mobile browser tests, plus passing TypeScript/lint/Prisma/build. Do not substitute historical counts for the final release report.

## 16. Limitations

Sandbox only; no real funds, legal certification, production customers or measured savings. Synthetic-image evaluation does not establish real-photo accuracy. Public visitors cannot upload, invoke paid AI or issue refunds. Hosted customer upload, new hosted AI inference and new hosted webhook delivery remain unverified. Studio public activation is pending sponsor clarification. Render's current Free database expires 12 December, before judging ends; a documented $0 continuity plan is prepared but no database migration has been performed. Privacy/retention and multi-instance ingress controls require further production review.

## 17. Future roadmap

After the hackathon: independently review the financial/privacy boundaries, evaluate consented real-world evidence, validate merchant cost assumptions, improve shared rate limiting and retention operations, and test continuity before any approved database cutover. Production payments and broader onboarding require separate review and authorization.

## 18. Public demo

https://returnwise-ai-t6sv.onrender.com — choose **Try demo**, no credentials required. Free cold starts may take time. Full local judge instructions: [judge-setup.md](judge-setup.md).

## 19. Public repository

https://github.com/hamdhanhasmy/returnwise-ai — application source under MIT; third-party licences remain applicable.

## 20. Public YouTube video

**[REQUIRED: REPLACE WITH PUBLIC YOUTUBE URL BEFORE SUBMITTING]**

## Submission form notes

Built with: Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, PostgreSQL, Prisma, Zod, DeepSeek, PayPal Orders v2, PayPal Payments v2, AG Studio, APIMatic PayPal Context Plugin, Render, Supabase Storage, Vitest, Playwright.

Team/representative: **[REQUIRED: ADD ALL ACTUAL TEAM MEMBERS AND DEVPOST PROFILE LINKS]**. Select sponsor categories only after checking the actual submission form requirements; no prize eligibility is guaranteed.

Short introduction: ReturnWise AI connects private customer evidence, bounded AI observations, deterministic return economics and human approval to a verified PayPal Sandbox refund. Explore the read-only public demo, then use the repository to run the complete application locally.
