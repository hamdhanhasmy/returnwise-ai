# Phase 5 judge walkthrough

This is a Sandbox demonstration using fictional products, a generated image and configured cost estimates. The complete new $5 capture/analysis/merchant-authorized refund journey was verified on 2026-11-11; sanitized evidence is in [the Phase 5 report](phase-5-orchestration.md). Both that $5 capture and the historical $1 capture are now fully refunded. Do not reuse either for additional refunds. A future demonstration needs a separately authorized new purchase.

## Prepare locally (PowerShell)

Keep `npm.cmd run db:local` running. Privately configure the existing Sandbox and DeepSeek environment variables as described in their runbooks. Never paste credentials or private customer links into chat/screenshots.

```powershell
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run db:migrate:test
npm.cmd run demo:setup
npm.cmd run returns:impact
npm.cmd run dev
# Separate terminal; open the resulting private link locally:
npm.cmd run auth:link -- --email=admin@oakandloom.example --merchant=11111111-1111-4111-8111-111111111111
```

`demo:setup` creates/reuses the fictional $5.00 ceramic bowl and an explicit merchant policy version. It makes no PayPal or DeepSeek request. Cost assumptions: shipping $2.00, handling $1.00, recovery $0.25; full physical-return modeled cost $7.75 versus $5.00 returnless. The $2.75 difference is an estimate, not a measured saving. Existing case snapshots remain unchanged.

## One complete journey

1. Obtain explicit operator approval for one **$5.00 USD Sandbox purchase/capture and one $5.00 full returnless refund**. No new operations are authorized merely by seeding or running tests.
2. Sign into `http://127.0.0.1:3000`, open **Demo checkout**, select **Fictional ceramic bowl — Phase 5 Sandbox demo**, and approve through PayPal using a separate Sandbox Personal buyer. Wait for verified capture; record the new internal transaction URL. Do not create a second purchase if the result is uncertain.
3. In **Customer portal**, select the newly captured order and issue its private intake link. In a separate customer tab, open the link, choose damaged item / damaged condition, and describe the broken bowl. Submit the case and preserve the private tracking link locally.
4. Open the evidence workspace. Upload `assets/demo/synthetic-broken-bowl.png`, authorize private storage and explicitly consent to DeepSeek processing. This photograph-like image is generated, not evidence from a real customer; its provenance and prompt are in `assets/demo/README.md`.

   An optional local operator helper performs steps 3–4 and requests genuine analysis through the browser: `npx.cmd tsx scripts/prepare-case-demo.ts --payment=PAYMENT_UUID --live-synthetic-analysis`. It only accepts the newly captured $5 demo product, never logs private tokens, refuses to duplicate an existing case and stops before human review/proposal/payment. This is separate from CI and can spend the configured AI budget. `npx.cmd tsx scripts/verify-case-demo.ts` reads sanitized database evidence without provider calls.
5. Open the merchant case. Request DeepSeek analysis once. Inspect the schema-validated observations, uncertainty, limitations and model identifier. Record an independent human review; refresh the case, then **Evaluate policy and costs**. AI cannot supply financial inputs or approve the remedy.
6. Compare the two full remedies. Select full refund without return, enter exact customer-visible terms and attest eligibility. Propose the resolution. Full refund without return does not require negotiated partial-settlement acceptance; the customer can see the exact offer. For a partial alternative, the customer must accept the exact version before approval. Never substitute an obsolete accepted offer.
7. Re-enter the merchant review note/attestation for the new case version, review and record approval. This sends no payment. For a physical-return alternative, verify actual receipt and inspection before proceeding.
8. In **Resolution & PayPal Sandbox refund**, verify the exact **$5.00 USD** amount and terms, check authorization, then **Review final PayPal refund** → **Send authorized refund to PayPal**. This is the sole financial confirmation.
9. Wait for verified provider status **COMPLETED**, case **CLOSED**, actual refund reference and audit history. Refresh customer status. Pending/unknown is not success: use **Reconcile existing refund**. Only explicit original-request recovery can replay the same stored idempotency key; never create another refund to resolve uncertainty.
10. Independently retrieve the new payment using `npm.cmd run paypal:verify -- --merchant=11111111-1111-4111-8111-111111111111 --payment=PAYMENT_UUID`. This read-only command never creates or refunds. Sanitize provider references in published proof.

After completion, `npx.cmd tsx scripts/verify-case-demo-ui.ts --payment=PAYMENT_UUID` checks customer and merchant desktop/mobile views, including the genuine stored assessment and read-only evidence controls. It issues temporary private local access, creates screenshots without capabilities and makes no provider request. Like the other genuine smoke helpers, it is separate from automated test/CI suites.

For the three-minute recording, prepare login, buyer approval and image upload beforehand if needed, and clearly state what was prerecorded. Show the verified capture, genuine stored AI assessment, financial comparison, exact merchant authorization, verified refund and case timeline. Never show private links, `.env`, credentials or browser account details.

## Contrasting modeled cases

`npm.cmd run returns:impact` reads the three existing Phase 3 synthetic snapshots, without changing them or calling providers. A: physical return $93 versus returnless $80 ($13 modeled advantage). B: physical return $85 versus returnless $240; select physical return. C: manual review. Across the two comparable cases the baseline is $178 and selected cost $165; one case is excluded for review. Input snapshots retain their original calculation versions. This is not an observed merchant outcome or an AI accuracy metric.

Later AG Studio may read these authorized aggregates, with baseline/version/source labels. No Studio integration is implemented in Phase 5.

Phase 6 now supplies the actual authenticated AG Studio dashboard. Finish the judge demonstration at `/analytics`: compare synthetic economics in Economics lab, switch to Sandbox totals, then use the consented native assistant to ask about verified refunds. See [Phase 6 verification and walkthrough](phase-6-analytics.md). This uses existing records and does not require a new purchase or refund.
