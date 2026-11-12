# Judge access and reproducible local setup

## Fast public exploration — no credentials

Open **https://returnwise-ai-t6sv.onrender.com**, choose **Try demo**, then:

1. Explore return metrics and filter **Record source → Synthetic scenarios**. The original three-scenario evaluation shows **$13 modeled cost avoidance**, not measured savings.
2. Open the damaged-bowl, recoverable-lamp and manual-review cases to compare different recommendations.
3. Select **Sandbox orders** and open the verified $5 bowl case. Inspect the generated image, previously stored genuine DeepSeek observations, configured financial comparison and sanitized completed refund reference.
4. Test at a phone width; filters, table scrolling and case navigation remain usable.

This is an interactive **read-only published snapshot**, not a newly executing customer-to-refund flow. No account, payment, API key or paid service is needed to explore it. It cannot upload private evidence, run a model, change merchant data or refund. The current public report uses an explicitly labeled ordinary table while AG Studio's hackathon key/domain activation is resolved. The genuine native Studio implementation is available locally.

Free Render may need a cold start. If unavailable, use the full local application below. The hosted database's 12 December expiry is tracked in [continuity plan](database-continuity.md); it must be addressed before judging ends.

## Fresh local build — Windows PowerShell

Requirements: Git, Node.js **24.x** with npm, and an available local PostgreSQL service. The included PostgreSQL 18 launcher is supported on desktop systems; no Docker or paid infrastructure is necessary.

```powershell
git clone https://github.com/hamdhanhasmy/returnwise-ai.git
cd returnwise-ai
npm.cmd ci
npm.cmd run db:generate
npm.cmd run db:local
```

Keep that terminal open. With no existing `.env`, the launcher generates ignored local credentials and separate `returnwise_dev` / `returnwise_test` databases on `127.0.0.1:55432`; it never resets an existing database. If using your own PostgreSQL, copy `.env.example` only when `.env` is absent, configure two dedicated databases privately, and skip the launcher.

Second terminal, same directory:

```powershell
npm.cmd run db:validate
npm.cmd run db:migrate
npm.cmd run db:migrate:test
npm.cmd run db:seed
npm.cmd run returns:seed
npm.cmd run returns:impact
npm.cmd run dev
```

Open **http://127.0.0.1:3000** (use this exact origin). Third terminal:

```powershell
npm.cmd run auth:link -- --email=admin@oakandloom.example --merchant=11111111-1111-4111-8111-111111111111
```

Open the privately printed one-use link within 15 minutes and choose **Open your workspace**. This account exists only in your own seeded local database; no shared hosted password or administrator token is published. Never paste the generated link into submission materials. macOS/Linux use `npm` instead of `npm.cmd`; root-only Linux environments need a conventional PostgreSQL instance rather than the embedded launcher.

## What works without provider keys

- Merchant sign-in, tenant isolation, policies, synthetic cases and deterministic economics.
- Customer portal capabilities issued by the authenticated merchant for existing synthetic orders; customer submission/status and exact offer response.
- Private database-backed image upload (default `EVIDENCE_STORAGE=database`) and consent UI, with unavailable-analysis/manual-review fallback.
- Native **AG Studio 3.1.0** charts/grids, source/category/time filtering, desktop report customization and saved layouts at `/analytics`. Local evaluation may show a vendor watermark; use the authorized trial locally if available. AI consent alone does not make a provider available.
- Full mocked unit/integration/browser coverage. It does not contact PayPal or paid AI providers.

Synthetic seed data never creates provider IDs, successful AI assessments or financial success. A new clone will not contain the team's genuine $1/$5 ledgers or cached AI answer. Their sanitized published evidence and reports are included separately. Do not expect synthetic cases to authorize refunds without a verified original capture.

## Genuine external workflow — explicit private configuration

The full application is implemented, but fresh real-provider execution requires your privately configured Sandbox/AI accounts. No application API secret is public. For special judge access, contact the entrant through the Devpost project/team contact channel for an arranged walkthrough; do not request credentials in a public comment. Do not publish project-wide API keys as “judge credentials.”

1. Follow [PayPal Sandbox setup](paypal-sandbox.md): use a Sandbox REST app, business merchant identifier and separate personal buyer; bind your seeded merchant using the existing configuration CLI. PayPal host is fixed to Sandbox.
2. For genuine evidence analysis, privately configure `DEEPSEEK_API_KEY`, `AI_ENABLED=true` and a small `AI_SPENDING_CAP_USD` only with an authorized prepaid account. No OpenAI key. Follow [consent, privacy and spending guide](phase-4-deepseek.md). The public hosted AI setting remains off.
3. To exercise hosted-style storage locally, privately configure `EVIDENCE_STORAGE=supabase`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and the private JPEG-only `return-evidence` bucket. Otherwise private database bytes suffice for local testing. See [deployment/storage runbook](phase-7a-deployment.md).
4. Follow [the existing complete case walkthrough](phase-5-demo.md). Obtain separate operator approval before any new Sandbox purchase/refund. Neither seed nor tests execute them automatically. The historical $1 and $5 captures are fully refunded and cannot be reused.
5. Reproduce the exact customer agreement/human review/final merchant authorization gates; uncertain provider results require reconciliation, not a new operation.

## Tests on your isolated database

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run test:integration
npx.cmd vitest run --config vitest.integration.config.ts
npm.cmd run db:validate
npm.cmd run build
npm.cmd run test:e2e:install
npm.cmd run test:e2e
```

Integration/browser tests require the distinct reachable `_test` database and refuse development/hosted targets before fixtures. Never copy hosted connections into `TEST_DATABASE_URL`. Playwright uses the production build on port 3100, with provider keys disabled; port must be free. [Isolation contract](test-database-isolation.md), [release evidence](phase-7-release.md), [environment names](../.env.example).
