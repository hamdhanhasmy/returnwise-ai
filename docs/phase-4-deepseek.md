# Phase 4 — DeepSeek evidence analysis

Implemented and locally verified, 2026-11-10. User direction supersedes the original OpenAI runtime choice; no OpenAI key, AI financial authority, Phase 5 orchestration or AG Studio is introduced. Genuine results are separated from automated mocks and synthetic business amounts.

## Plan and boundaries

1. Add `src/lib/ai/` provider/schema/cost/image modules and additive evidence/analysis/budget persistence. Private normalized images remain in PostgreSQL behind tenant/capability authorization, never public files or provider URLs. Bound upload size, pixels, image count and inference output. Customer consent explicitly names DeepSeek before any transmission.
2. Add customer upload/consent/delete controls and merchant analysis/manual-review UI. Existing case versions/locks invalidate old proposals on changed evidence. AI output cannot set amounts, policy, eligibility or PayPal actions; new evidence requires human review before a proposal can proceed.
3. Add isolated regression tests, synthetic evaluation fixtures/script, genuine provider verification when locally configured, and full Phase 1–3 regression checks.

Use `/chat/completions` at the fixed `https://api.deepseek.com`, model `deepseek-flash`, JSON object output and `thinking.type=disabled`. Native fetch implements the documented OpenAI-compatible wire interface, with no SDK's implicit retries. Successful unchanged analyses are cached by case/evidence/model/prompt/configuration hash. Global lifetime application budget uses integer nano-USD and a locked PostgreSQL account; reservations survive restarts. Conservative peak rates are estimates, not invoices. Unknown provider outcomes retain their full estimated charge and are not automatically retried. Only explicit rate-limit responses get one bounded retry with its own persisted reservation.

## Official sources checked

- https://api-docs.deepseek.com/guides/vision/ — Flash image blocks, inline base64, detail choices, upper bound of 1024 image tokens.
- https://api-docs.deepseek.com/quick_start/pricing/ — Flash alias/version and peak rates: $0.30/M cache-miss input, $0.006/M cache-hit input, $1.20/M output (checked 2026-11-10). Lower off-peak rates mean local estimates can overstate actual billing.
- https://api-docs.deepseek.com/guides/json_mode/ — JSON example/instruction required; blank-space responses possible even with stop finish reason.
- https://api-docs.deepseek.com/guides/thinking_mode/ — explicit non-thinking toggle.
- https://api-docs.deepseek.com/quick_start/error_codes/ — 402 insufficient balance; 429 throttling; structured failure handling.

The user subsequently configured the key privately. Twenty genuine vision requests succeeded; no key value was exposed. See [measured evaluation](deepseek-evaluation.md).

## Working customer and merchant journey

Use the existing secure customer intake/tracking link to submit an order-backed return. Open **Open evidence workspace**, select a static JPEG/PNG/WebP and explicitly authorize private storage. Separate unchecked consent names DeepSeek, transmitted description/images, China processing, uncertain provider retention/training terms and withdrawal limitations. Saving consent never starts inference; human-only review remains available.

An active merchant administrator opens the case and explicitly selects **Analyze current evidence**. One request contains the description and all current images. No order/customer identifiers, policies, prices or payment records are sent. Uploaded text is untrusted and not automatically redacted: customers must exclude personal information.

Strict Zod validation accepts observations, issue classification, claim support, limitations, uncertainty, policy questions and injection indicators. `requiresHumanReview` must be true. Unknown fields, including monetary/approval fields, fail validation. React renders strings as text. No payment functions or tools are available to the model.

Evidence/consent changes invalidate active proposals and require documented human review. Changed or expired evidence makes in-flight output stale. Late output after manual recovery or case closure is also discarded while provider usage is still accounted for. Merchants inspect original/optimized images and AI limitations, record a review note, then separately re-evaluate deterministic policy. Previous economics are labeled as historical while evidence review is required. AI cannot change eligibility or financial inputs. Case approval still cannot call PayPal.

## Windows PowerShell setup

Keep the existing PostgreSQL server running. Apply the additive migration to development and the separately verified test database:

```powershell
npm.cmd ci
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run db:migrate:test
```

Privately edit ignored `.env`; obtain the key from your DeepSeek platform account. Never paste it into chat, a command line, source code or screenshots:

```dotenv
AI_ENABLED=true
DEEPSEEK_API_KEY=replace_privately
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-flash
DEEPSEEK_IMAGE_DETAIL=high
AI_MAX_OUTPUT_TOKENS=1200
AI_SPENDING_CAP_USD=0.25
```

Restart `npm.cmd run dev`. No variable uses `NEXT_PUBLIC_`. Existing database, application-origin and authentication configuration remains unchanged; PayPal credentials are independent. Set `AI_ENABLED=false` to disable inference. Mocked tests need no provider credentials.

The endpoint/model are literal-validated. Detail permits `low`, `high` or `auto`; output is bounded to 512–1400 tokens. The documented alias was DeepSeek-V4.1-Flash-1017. Native server-side fetch uses the official OpenAI-compatible interface, explicit `thinking: { type: "disabled" }`, JSON mode, a 30-second timeout and a bounded response body. JSON mode is not a strict-schema guarantee: Zod validation remains mandatory.

## Private images and retention

Server limits: 5 MiB encoded, 20 million decoded pixels, 64–8192 pixels per side, no animation/SVG, MIME matching decoded format, three active images and six lifetime submissions per case. Orientation is normalized and metadata removed. No cropping/enlargement: review copies are at most 4096 pixels, inference copies at most 1280 pixels with JPEG quality 90 and 4:4:4 sampling. **Preview AI image** shows the inference copy; provider `low` detail can reduce it further. Subtle damage may disappear during resizing: request close-ups and human review.

Images are private PostgreSQL bytes, never public files or remote image URLs. Existing hashed expiring CUSTOMER_TRACK capabilities bind customer, order, case and merchant. Active administrator and tenant checks protect merchant actions; IDs alone confer no access. Exact-origin checks protect mutations. Responses use private/no-store, nosniff and restrictive CSP headers. Per-capability/user/global limits and a two-decoder limit protect this single-instance prototype. Public/multiple-instance deployment needs shared ingress request/body/time limits and database resource controls.

Removing an open-case image nulls both copies, audits the action and invalidates proposals. Access expires after 30 days; physical cleanup is an operator task:

```powershell
npm.cmd run evidence:purge             # read-only dry run; max 100 candidates
# Only after reviewing the retention policy and authorizing deletion:
npm.cmd run evidence:purge -- --apply  # remove expired image bytes with audit
```

Schedule authorized cleanup and repeat batches until no candidates remain. No development `--apply` was run in this phase. Backups, descriptions and assessment/audit history require an explicit deployment retention policy. Withdrawal cannot recall already sent data or in-flight requests. DeepSeek's general privacy policy excludes downstream applications and does not establish API zero-retention/training exclusion. Review provider processing/transfer arrangements before real-customer use. `/privacy/evidence` contains the customer notice and links to the [Open Platform terms](https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html) and [privacy policy](https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html).

## Spending, caching and recovery

One persistent `AiBudget` account enforces a shared lifetime application cap. All instances must share the database, account ID and cap/configuration. This is not a daily reset or a provider-account hard limit. Other applications using the key are outside the ledger.

- Short PostgreSQL transactions lock the case and budget, persist a reservation and commit before network I/O. Admission requires `spent + held + reservation <= cap`.
- Integer nano-USD only: one USD is 1,000,000,000 nano-USD. Conservative input bound = prompt/description UTF-8 bytes + 2048 framing tokens + 1024 tokens/image. Output is bounded by configuration. Peak miss/hit/output rates are 300/6/1200 nano-USD per token; rates are versioned estimates, not invoices.
- Actual usage metadata settles successful/invalid-output attempts; model/request reference, latency, cost basis and error are persisted. Settled attempt UPDATE/DELETE/TRUNCATE is blocked. Merchants see only their own spend, not other tenants' usage.
- Only explicit HTTP 429 receives one bounded retry, with its own persisted reservation. Pre-inference rejections have zero estimated cost. Blank/malformed JSON, schema failures, refusals, balance exhaustion, 5xx, network uncertainty and timeouts fall back to review; uncertain requests are not automatically repeated.
- Potentially charged failures without usage consume their full reserved estimate. A process crash leaves capacity held and the operation running. Investigate provider records; do not erase the ledger or automatically resend. Human review remains available after the in-flight grace period. Usage above its bound trips a spending circuit breaker; no application can undo a provider overcharge or guarantee the old cap if pricing/token bounds change.
- A unique cache key covers case, description/image hashes, model and documented revision, prompt version, detail and output limit. Repeated unchanged requests return the existing operation, including failed/unknown outcomes. Raising the cap does not silently retry a failed same-evidence request; use human review.

The genuine 20-case rerun produced **20 cache hits, still 20 attempts, unchanged $0.006344082 estimated total**. Automated PostgreSQL tests verify reservation persistence before provider execution and concurrent cap enforcement.

## Files and migration

`202611100003_evidence_analysis` adds `ReturnEvidence`, `EvidenceAnalysis`, `AiBudget`, `AnalysisAttempt` and ReturnCase consent/review fields. It includes tenant composite foreign keys, unique image/cache/attempt keys, indexes, bounded-value checks and immutable settled usage. The existing policy-version index is preserved. Five migrations total; no old migration or genuine payment row was replaced.

- `src/lib/ai/{contracts,config,cost,images,deepseek}.ts`: strict schema/prompt, config, integer costs, images, provider.
- `src/server/services/evidence.ts`, `src/server/evidence-http.ts`, `src/app/api/evidence/`: access, consent, private reads, dedupe, reservations and human review.
- `src/server/services/returns.ts`: evidence-review gate before proposing/approving.
- `src/components/returns/{evidence-panel,customer-portal}.tsx`, merchant case/dashboard pages, privacy page and health route: working UI/status.
- `scripts/{evaluate-deepseek,verify-deepseek-ui,purge-evidence}.ts`, fixtures and unit/integration/E2E tests: evaluation, operations and coverage.
- Prisma schema/migration, package/lock files (direct pinned sharp), Playwright provider disabling, `.env.example`, README, blueprint runtime note, phase prompts and documentation.

Earlier Phase 2–3 working-tree changes remain intact and are not claimed as new Phase 4 edits.

## Actual checks

| Command | Observed result |
|---|---|
| `npm.cmd run typecheck` | Passed |
| `npm.cmd run lint` | Passed, zero warnings after fixing a JSX apostrophe |
| `npm.cmd test` | 127 passed; existing 109 preserved, 18 added |
| `npm.cmd run test:integration` | 71 passed on isolated PostgreSQL; existing 54 preserved, 17 added |
| `npx.cmd vitest run --config vitest.integration.config.ts` | 71 passed, mandatory isolation enforced |
| `npm.cmd run db:validate` | Valid schema |
| `npm.cmd run db:generate`, `db:migrate`, `db:migrate:test` | Succeeded; additive migration applied to respective databases |
| `npx.cmd prisma migrate status` | Five migrations, up to date |
| `npm.cmd run build` | Production build passed |
| `npm.cmd run test:e2e` | 24 passed, desktop/mobile Chromium, exit 0 |
| `npm.cmd run ai:evaluate -- --live --limit=1`, then `--limit=20` | 20 genuine successful vision requests, synthetic images only |
| Repeat `npm.cmd run ai:evaluate -- --live --limit=20` | 20 cache hits, no new attempts/spend |
| `npx.cmd tsx scripts/verify-deepseek-ui.ts` | Genuine assessment/private image displayed; screenshot saved; zero provider requests |
| `npm.cmd run evidence:purge` | Dry run: zero expired development candidates; no deletion |
| `npx.cmd tsx scripts/audit-return-timestamps.ts` | UTC session; original capture/refunds/webhook preserved |

Restricted Windows `tsx` launches failed before execution at `uv_os_get_passwd ENOMEM`; approved reruns succeeded. Vite's future native-loader extension warning and Playwright color-variable warnings are non-failing. Remote CI was not run. Provider failures/concurrency use mocks, not live balance exhaustion or network-fault experiments. No Phase 4 PayPal request was made.

During the next-day final rerun PostgreSQL was stopped. Test isolation rejected the run before test writes; restarting the existing persistent cluster resolved connectivity without resetting data. The subsequent complete browser rerun passed 24 tests. Final focused review also fixed a delayed-provider-response race after manual recovery, covered by an additional integration regression. A production-browser scan of configured DeepSeek and PayPal secrets found neither in 27 static files. `git diff --check` passed; a separate check disabling Windows CRLF normalization produced false-positive carriage-return whitespace diagnostics and is not the validation baseline.

Desktop/mobile screenshots were inspected for legibility and layout. Browser coverage includes upload, consent, private image reads, result display, human review, removal, auth/origin failures and no created payment records. Genuine UI smoke uses the actual stored external assessment. The same five historical orders/four legacy cases retain unverified timestamp provenance; nothing was repaired. Read-only inventory: 100-cent capture suffix `46643E` REFUNDED; refunds `894818`/`873331` COMPLETED for 40/60 cents; one PROCESSED webhook. Phase 3 scenario outcomes are unchanged.

## Readiness

Phase 4's local upload → genuine analysis → stored assessment → merchant review journey is implemented and verified. Ready for dedicated security review and Phase 5 planning; Phase 5 and AG Studio were not started. This engineering self-review is not independent `/review` sign-off. Public real-customer use remains gated on provider/privacy review, retention scheduling, shared ingress limits, database permissions/backups and an independently labeled representative real-photo evaluation. No production or universal accuracy claim is made.
