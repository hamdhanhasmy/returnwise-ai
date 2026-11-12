# Genuine DeepSeek synthetic evidence evaluation

Run date: 2026-11-10. Model: `deepseek-flash`; documented alias: `DeepSeek-V4.1-Flash-1017`. Actual response metadata returned `deepseek-flash`. Endpoint: `https://api.deepseek.com/chat/completions`. JSON mode, non-thinking, high detail, 1200-token output limit, prompt `evidence-v1`.

## Dataset and measurements

Twenty deterministic rasterized vector illustrations from `tests/fixtures/evidence.ts`: five families, four variants each. These are **synthetic illustrations, not customer photographs**. Orders/cases are labeled `AI-EVAL-V1-*` and create no PayPal payments. Synthetic consent was recorded through the same service; customer capabilities were revoked after upload.

| Family | Cases | Schema valid | Observable label agreement | Observed behavior |
|---|---:|---:|---:|---|
| Broken bowl | 4 | 4 | 4 | Separated/jagged pieces; support UNCLEAR in 3, PARTIAL in 1 |
| Scratched laptop | 4 | 4 | 4 | Visible lines; all UNCLEAR about physical scratches |
| Blurred/ambiguous bowl | 4 | 4 | 4 | All HIGH uncertainty, UNCLEAR support |
| Shattered claim, intact bowl image | 4 | 4 | 4 | All UNSUPPORTED |
| Image/text instruction injection | 4 | 4 | 4 | All flagged injection; no forbidden fields or approvals |

All 20 responses required human review and reported HIGH uncertainty, recognizing illustration limitations. Agreement is a predeclared narrow regex/category check, not independently scored accuracy. Four color variants are correlated; scratched images share geometry. Results cannot establish real-photo damage classification, cause, identity, fraud, rights or production accuracy. A confusion matrix over real damage labels is not justified here.

Actual provider usage across 20 attempts:

- **10,380 input tokens**, including **3,197 cache-hit tokens**, 7,183 miss tokens.
- **3,475 output tokens**.
- Latency **1,606–3,340 ms**, median **2,139 ms**, mean **2,196.3 ms**, measured at the adapter boundary.
- Estimated total **$0.006344082** = `7183 × $0.30/M + 3197 × $0.006/M + 3475 × $1.20/M`.
- Conservative peak-price estimate, not a billing invoice; below the **$0.25** application cap.
- Repeat run: **20 cache hits**, still **20 persisted attempts**, unchanged estimated spend.

Broken-1 example: 515 input / 186 output tokens, 3,325 ms, $0.000377700 estimate. It described separated bowl halves and said the illustration cannot establish physical condition or cause. The genuine result was loaded through the authenticated merchant UI with its private image. Case reference: `e3463ed4…`; no credentials/private links are included here.

## Reproduce deliberately

Configure the private variables and migrate as described in [Phase 4](phase-4-deepseek.md). These commands use the development/demo database and can incur charges for new cache keys; they are **separate from routine mocked tests**:

```powershell
npm.cmd run ai:evaluate -- --live --limit=1
npm.cmd run ai:evaluate -- --live --limit=20
npm.cmd run build
npx.cmd tsx scripts/verify-deepseek-ui.ts
```

Evaluation requires `--live` and bounded `--limit`, uses the same consent/authorization/budget service, and never calls PayPal. Full synthetic observations/metadata are in ignored `.local/evaluation/deepseek-report.json`. Reruns overwrite that report with the selected subset while reusing persisted operations. UI smoke launches its own production server on port 3201, creates a local merchant session privately and sends no AI/payment requests. Leave that port free.

Automated tests cover schema/blank/refusal/output-limit failures, missing credentials, authentication/balance/throttling, uncertain network/timeouts, concurrent budget reservations, caching, withdrawn consent, tenant isolation, immutable usage and human-review gates. Those failures are mocked. Live insufficient-balance, adversarial-photo robustness and rare model failures were not artificially induced.

Before real-customer use: obtain consented representative product photos, independent labels and uncertainty criteria; evaluate subtle defects across resizing/detail choices, products and lighting, then report false positives/negatives. Do not reuse these 20 prompt-development illustrations as an independent accuracy benchmark.
