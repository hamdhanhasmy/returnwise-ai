# Phase 7A — strictly $0 deployment

Status: **public HTTPS deployment verified**, including desktop/mobile exploration, authenticated merchant session checks and actual Render restart persistence. Judge URL: **https://returnwise-ai-t6sv.onrender.com** → **Try demo** (direct `/demo` also works). Initial application release was `0ccce70`; the latest deployed application is `9c69e5f19130fa1df7dc1f4e7cec27b5f1907775`, adding homepage/sign-in demo buttons. Hosted desktop/mobile verification confirmed both buttons open `/demo`, issue no merchant session and preserve private API rejection. Render API confirms Free web/database plans in Ohio, one instance, no disk/autoscaling/replicas/HA; automatic deploys are off. The user confirmed no payment method. The database has eight migrations and one restricted merchant/admin setup, with no hosted orders/cases/payments seeded. Public Studio permission, hosted customer-upload UI, new hosted AI and genuine hosted webhook delivery remain separate unverified gates.

## Milestones

1. Preserve PostgreSQL-backed legacy evidence and add a private Supabase adapter for new hosted uploads. Files: storage configuration/adapter, EvidenceService, additive Prisma migration, retention cleanup and focused tests. Normalize images as before; reserve storage quota durably before external calls; never expose privileged keys or public object URLs.
2. Add a deliberately restricted public demonstration separate from merchant authentication. Publish only reviewed fictional/sanitized snapshots and previously verified Sandbox references. No public mutation, evidence upload, paid AI or financial execution. Keep the existing authorized merchant workflow.
3. Add Render Free build/start settings, safe one-time migration/merchant initialization instructions, hosted configuration validation, licence gating and smoke checks. No paid services/disks/one-off jobs, no hosted test fixtures, no destructive commands.
4. Run local regression/production checks, then verify the real HTTPS deployment only after account configuration and deployment are available. Report external blockers and restart/persistence checks honestly.

## Verified infrastructure constraints

Official Render documentation: select Free explicitly for both service/database. Free PostgreSQL has a 1 GB limit, expires after 30 days and has no managed backups. The Free web service idles after 15 minutes, has ephemeral files, and has no shell or one-off jobs. Use an external database connection privately for operator-run migrations; internal URL for same-region runtime. Strict $0 requires no billing-backed overages or upgrades; stop on any payment requirement.

Supabase Free includes 1 GB storage; projects can pause after a week of inactivity. Use a dedicated private `return-evidence` bucket, JPEG-only uploads and a 5 MiB object limit. Application quota will be substantially lower and include in-progress/uncertain uploads.

AG Studio documentation authorizes unlicensed local evaluation, not unlicensed hosted use. Public Studio stays unavailable unless an appropriate licence and explicit hosted-demo authorization are configured. A clearly labeled read-only table fallback must not be represented as AG Studio.

Sources: [Render Free](https://render.com/docs/free), [Next.js on Render](https://render.com/docs/deploy-nextjs-app), [Supabase Free](https://supabase.com/pricing), [private buckets](https://supabase.com/docs/guides/storage/buckets/creating-buckets), [server API keys](https://supabase.com/docs/guides/api/api-keys), [AG Studio installation](https://www.ag-grid.com/studio/react/installation/).

Existing evidence is stored in PostgreSQL byte columns, not local files. Existing genuine payment/refund records will not be fabricated or automatically copied into a fresh hosted database. Any public evidence of prior external verification must be labeled a published snapshot of the local verified run.

## Exact $0 setup — do this in order

### Supabase Free

1. Use a **Free organization/project**. Do not enable a paid plan, add-on or automatic upgrade. Keep unrelated storage out of this dedicated project/bucket so its quota is meaningful.
2. Storage → create bucket with exact ID `return-evidence`; **Public OFF**; allowed MIME types **image/jpeg**; file limit **5 MiB (5,242,880 bytes) or lower**. The application normalizes PNG/WebP/JPEG into JPEG before storage. Do not add anonymous/authenticated bucket policies: the existing ReturnWise server authorization is the access boundary.
3. Copy the project URL and **server secret key** (or legacy service-role key) privately into ignored `.env` as `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Never use a publishable/anon key here, never add NEXT_PUBLIC to these names and never put them in GitHub.
4. Verify separately from normal automated tests: `npx.cmd tsx scripts/verify-supabase.ts` (read-only bucket check), then `npx.cmd tsx scripts/verify-supabase.ts --roundtrip` (two temporary normalized synthetic objects, private read, unauthorized public read rejection, deletion). The report explicitly does not prove a Render restart.
5. Hosted `EVIDENCE_STORAGE=supabase`, `EVIDENCE_STORAGE_CAP_BYTES=104857600` (100 MiB maximum). Both stored variants and pending/unknown uploads count. Existing database images remain readable; no historical bytes are moved/deleted automatically.

All images use existing content validation, metadata stripping, consent, opaque customer capability and administrator tenant checks. Private bytes pass through authenticated same-origin server routes; browser-visible signed URLs are unnecessary. Download/delete object keys come only from persisted matching merchant/case/evidence references. No storage secret reaches the browser.

Upload network work is outside DB transactions. Durable UPLOADING → READY state prevents partial files from being served. Failed/unknown uploads become DELETE_PENDING and retain quota. Removed evidence is hidden immediately; successful physical deletion changes state to PURGED and releases quota. Operator retention cleanup retries expired/deletion-pending records and abandoned uploads, never financial records:

```powershell
# Dry-run first; use the appropriate private environment for the target service.
node --env-file=.env.render --import tsx scripts/purge-evidence.ts
# Only after reviewing the batch:
node --env-file=.env.render --import tsx scripts/purge-evidence.ts --apply
```

DELETE_PENDING uploads have a ten-minute quiet period before batch retry; UPLOADING records require an hour before abandoned cleanup. Investigate uncertain provider uploads before manual cleanup. A provider timeout cannot guarantee immediate remote erasure. No paid scheduler is installed; the operator must run retention cleanup. Free storage/bandwidth limits and project pause remain provider constraints.

### Render Free PostgreSQL and safe migrations

1. Render Hobby/free workspace → New → PostgreSQL. Name `returnwise-db`; database **returnwise_hosted**; PostgreSQL **18**; region **Ohio** for the configured database (or another matching region for BOTH services on a new setup); compute **Free**, storage **1 GB**. No autoscaling, replicas or upgrades.
2. Temporarily allow only your current public operator IP (/32) for external database access. Internal same-region traffic remains available. Remove broad `0.0.0.0/0`; temporarily re-add only your IP when operator migrations/login issuance/retention are needed.
3. Privately create ignored `.env.render` on your machine. Do not modify local `.env` or paste values in a terminal/chat:

```dotenv
# Owner connection for LOCAL operator commands only (external HTTPS/TLS database connection).
DATABASE_URL=replace_with_render_EXTERNAL_owner_database_url
DATABASE_MIGRATION_URL=replace_with_the_same_EXTERNAL_owner_database_url
RENDER_INTERNAL_DATABASE_URL=replace_with_render_INTERNAL_owner_database_url
HOSTED_ADMIN_EMAIL=your_private_authorized_admin_email
PAYPAL_ENV=sandbox
# Set APP_BASE_URL to the actual assigned HTTPS Render origin before issuing sign-in links.
```

The external connection is PostgreSQL over TLS, not an HTTP URL. Preserve Render's TLS options; use its External Database URL. No owner credential is placed in the web service. Keep external database IP restrictions in place.

```powershell
npm.cmd ci
npm.cmd run db:generate
# These commands read the private .env.render values; dotenv does not override shell/Node env values.
node --env-file=.env.render --import tsx scripts/check-render-database.ts
node --env-file=.env.render --import tsx scripts/migrate-render.ts
node --env-file=.env.render --import tsx scripts/migrate-render.ts --deploy
node --env-file=.env.render --import tsx scripts/migrate-render.ts
# Explicit one-time bootstrap, only against the migrated EMPTY hosted database:
node --env-file=.env.render --import tsx scripts/initialize-render.ts --initialize
```

This bootstrap creates only one authorized merchant/admin and a restricted `returnwise_runtime` DB login. It creates no orders, cases, products, test fixtures, provider IDs, payment operations or AI requests. It refuses a non-empty database/existing runtime role, preserves existing data and never resets credentials. It grants runtime SELECT/INSERT/UPDATE on application tables, no DDL/DELETE/TRUNCATE, no audit UPDATE and no migration-table access. Owner connections stay local. If role creation is denied, stop and report it; do not silently deploy as owner.

Generated restricted connections are saved privately in ignored `.local/render-runtime.env`, never stdout. Its `RENDER_DATABASE_URL` is the **internal** runtime connection for Render's `DATABASE_URL`; its `DATABASE_URL` is the restricted external connection for optional operator commands. Keep both private. A commit/connection failure during initialization requires inspection, not automatic reset/retry.

**Never run** `db:seed`, `returns:seed`, tests, `migrate reset`, `db push` or test migrations against the hosted database. Public synthetic scenarios come from the reviewed published artifact, independently of hosted PostgreSQL. Existing local genuine ledgers remain untouched. An authorized merchant may later create a real Sandbox checkout only with explicit approval; public visitors cannot.

### Render Free Web Service

Source repository: `https://github.com/hamdhanhasmy/returnwise-ai`. Reviewed Phase 2–7A application source was committed/pushed as `0ccce70` and Render independently reported that exact deployed commit as live. The initial preflight HEAD was still Phase 1; no old remote build is presented as the complete application. Later documentation/operator-only commits do not deploy automatically.

Create a **Node Web Service**, not Static Site. Select the same database region, repository/default branch, **Free** instance, automatic deploys **off**, no disk, no paid jobs/add-ons. Use the free `onrender.com` HTTPS hostname; do not purchase a domain.

| Setting | Exact value |
| --- | --- |
| Node | `24.16.0` (`NODE_VERSION`) |
| Build | `npm ci --include=dev && npm run db:generate && npm run build` |
| Start | `npm run start:render` |
| Binding | `0.0.0.0`, Render-provided `PORT` (default 10000) |
| Health | `/api/health` (bounded DB probe; no provider call) |
| Database | private INTERNAL `returnwise_runtime` URL from initializer |
| Migrations | explicit local operator commands above, never build/start/paid pre-deploy jobs |

`render.yaml` is a Free-only reference/template, with explicit Free plans and no disk/paid job. The dashboard sequence above is easiest when the DB must be initialized before the web service. Do not apply the template over unrelated existing services/databases. It requires the restricted DATABASE_URL manually; it deliberately does not inject Render's migration-owner connection.

Runtime environment:

- Required: `NODE_VERSION=24.16.0`, `NODE_ENV=production`, `DATABASE_URL` (restricted internal), `PAYPAL_ENV=sandbox`, `EVIDENCE_STORAGE=supabase`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `EVIDENCE_STORAGE_CAP_BYTES=104857600`, `PUBLIC_DEMO_ENABLED=true`, `NEXT_TELEMETRY_DISABLED=1`. APP_BASE_URL is derived from Render's assigned HTTPS URL by the start wrapper; an explicit matching HTTPS origin may also be configured.
- Default safe: `AI_ENABLED=false`, `AI_SPENDING_CAP_USD=0.25`, `AG_STUDIO_HOSTED_AUTHORIZED=false`.
- Optional authorized AI: private `DEEPSEEK_API_KEY`, `AI_ENABLED=true`, existing fixed `DEEPSEEK_BASE_URL=https://api.deepseek.com`, `DEEPSEEK_MODEL=deepseek-flash`, `DEEPSEEK_IMAGE_DETAIL=high`, `AI_MAX_OUTPUT_TOKENS=1200`. Consider a smaller cap for the hosted demonstration. Only use existing prepaid balance; no auto top-up. Public visitors cannot invoke it.
- Optional authorized PayPal: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MERCHANT_ID`, `PAYPAL_WEBHOOK_ID`. The API origin stays fixed in code to Sandbox. New hosted merchants start with payments disabled and require explicit existing merchant-binding CLI configuration.
- Studio: `NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY` plus `AG_STUDIO_HOSTED_AUTHORIZED=true` only after confirming the supplied trial permits this domain/demo and includes AI. Rebuild when changing NEXT_PUBLIC values. This vendor browser entitlement is public; provider keys are server-only. Absent permission, the fallback is clearly an ordinary table, not Studio.
- **Do not set** `TEST_DATABASE_URL`, `DATABASE_MIGRATION_URL`, `HOSTED_ADMIN_EMAIL` or `RENDER_INTERNAL_DATABASE_URL` on the web service. No invented AUTH_SECRET is needed: authentication uses securely random DB-backed opaque tokens/sessions.

Render automatically supplies `RENDER`, `RENDER_EXTERNAL_URL` and `PORT`. The start wrapper derives APP_BASE_URL from RENDER_EXTERNAL_URL when no explicit value is supplied, then validates the exact HTTPS origin. Startup rejects HTTP/wrong origin, owner runtime login, test/migration credentials, local evidence storage or invalid reserved ports. Session cookies remain HttpOnly/SameSite and Secure under HTTPS. No HTTP endpoint issues privileged login links.

Before issuing a hosted sign-in link, privately add the actual HTTPS `APP_BASE_URL` to `.env.render`. Use the merchant UUID printed by initialization and your configured admin email:

```powershell
node --env-file=.env.render --import tsx scripts/issue-login-link.ts --email=YOUR_CONFIGURED_ADMIN_EMAIL --merchant=HOSTED_MERCHANT_UUID
```

Open the resulting one-use 15-minute fragment link privately, never in shared CI/deploy logs. `/demo` grants no merchant session. The initializer's admin UUID is not a customer capability. Authorized private data stays behind existing session/tenant guards.

The login issuer now reuses the hosted operator TLS/target check: URLs without an explicit `sslmode` use `verify-full`, and insecure modes are rejected. Keep the same external owner connection in local `.env.render`'s `DATABASE_URL` / `DATABASE_MIGRATION_URL`; these are never the hosted runtime connection. An absent TLS setting previously caused Prisma P1010 even with a valid merchant/admin. Set the deployed HTTPS APP_BASE_URL before running the command; it is validated before a token is created.

### HTTPS webhook and public demo

Register/update the existing Sandbox REST app's genuine webhook to `https://ACTUAL-SERVICE.onrender.com/api/paypal/webhook`, retain the existing supported event list and privately set the corresponding webhook ID on Render. Do not register a fabricated ID or treat simulator delivery as genuine. No deployment smoke creates/captures/refunds a payment. Free cold starts may delay webhook delivery; existing verification, deduplication and authenticated reconciliation remain authoritative. Phase 5's missing new delivery is not retroactively claimed as resolved.

`/demo` and `/demo/cases/<published-slug>` are opt-in public routes backed only by the reviewed four-case artifact. It contains sanitized snapshots from three fictional scenarios and the previously completed local $5 case/DeepSeek assessment; the fixed committed synthetic image is public by design. No actual customer's private image is exported. Case IDs, full provider IDs, descriptions, tokens, emails, storage keys and human free-text notes are omitted. The hosted ledger starts separately; it is never seeded with copied provider successes. Filters and case exploration require no account, mutation, model request or database query.

The original synthetic comparison is $13 modeled advantage; including the prior verified Sandbox case's configured estimates adds $2.75. Its $5 refund is a published historical verification, not a new hosted operation or real-money saving. The public assistant is always disabled even when licensed; the real administrator may use the existing budgeted assistant privately.

### Licence verification and cost limits

Final-submission update: AG Grid's [6 November hackathon post](https://www.ag-grid.com/blog/build-a-payments-dashboard-without-building-a-dashboard/#whats-next-the-paypal-ai-hackathon) explicitly offers judging-period key support. This specific guidance supersedes treating generic trial terms alone as the hackathon policy. The actual hosted key/domain/AI activation is still unresolved; keep the gate off until the sponsor provides/clarifies it. No paid licence or bypass is needed. See [prepared inquiry and current evidence](sponsor-evidence.md). The original assessment below records why the initial deployment used the fallback.

The local pinned-vendor diagnostic (`scripts/check-studio-license.ts`) found a valid STUDIO-PRO-AI trial expiring **27 December 2026**. This establishes technical key validity, not public-demo permission. The Studio trial page permits production evaluation, while [general EULA clause 13.2(a)](https://www.ag-grid.com/eula/commercial/) restricts trial use to internal evaluation. Because that does not unambiguously authorize an external judge-facing demonstration, public Studio remains disabled pending clarification from the trial issuer. No licence enforcement is bypassed and no fee/upgrade is authorized. Suggested clarification request: “Please confirm whether my Studio Pro AI trial permits a temporary, publicly accessible PayPal AI Hackathon evaluation demo on my onrender.com domain, using only fictional/synthetic data.” Until confirmed, use the clearly labeled ordinary-table fallback; the actual Studio integration is retained for authorized/internal evaluation.

Strict $0: use no payment method/billing-backed overages or paid features. Watch Render included build minutes/bandwidth/hours and Supabase storage/egress. Render documents that without a payment method services/builds suspend rather than bill for quota exhaustion. If an existing billing-backed workspace could charge overages, do not deploy there until its $0 safety is established. Do not upgrade to solve free-plan limits. Keep a local export/recording before Render's 30-day DB expiry; no paid backup is configured. Availability after expiry is not promised.

## Verification gates

Local: typecheck, lint, all unit/integration/direct-integration tests against verified separate PostgreSQL, Prisma validate/status, production build, desktop/mobile E2E, source/client secret scans. Routine tests explicitly use database storage/mocks and disable provider credentials.

Hosted after deployment:

```powershell
node --import tsx scripts/smoke-hosted.ts --url=https://ACTUAL-SERVICE.onrender.com
```

Then inspect the public dashboard/case at desktop and phone widths, verify `/api/health` and unauthorized merchant API rejection, and privately exercise a synthetic customer upload/read/delete through an authorized merchant-created order/case if available. Do not manufacture a payment for this check. Verify any existing stored assessment renders without a new DeepSeek request.

Before a manual Render restart, record a non-sensitive hosted row fingerprint and evidence content hash privately. Restart only the Free web service (no database reset), then retrieve the SAME DB records and private objects. A fresh Supabase client check alone is not a Render restart test. The operator helper below performed an actual restart, required new `Ready in` process logs after its request, then confirmed HTTPS health, identical merchant/user/financial/evidence fingerprints and both private image variants. It removed only its temporary objects. This uses authenticated server storage access; it does not claim a customer upload through the hosted UI.

```powershell
# Operator-only, separate from automated tests; never run repeatedly to retry an uncertain restart.
node --env-file=.env.render --import tsx scripts/verify-hosted-ui.ts
node --env-file=.env.render --import tsx scripts/verify-hosted-persistence.ts --restart
# Wait for the new process to start, then run this read-only check/temporary-object cleanup:
node --env-file=.env.render --import tsx scripts/verify-hosted-persistence.ts --check
```

The persistence helper refuses a second restart when private probe state exists. The retained ignored state records that completed probe; do not delete it merely to bypass this guard. Public screenshots: `artifacts/hosted-demo-desktop.png`, `hosted-demo-mobile.png`, `hosted-case-desktop.png`, `hosted-case-mobile.png`. Reports under ignored `.local/evaluation/`: `hosted-ui.json`, `render-persistence.json`, `supabase-storage.json`. Reports/screenshot artifacts are local operator evidence, not committed credentials.

## Observed verification and operator API path

- Local: **158 unit, 107 integration, 107 direct integration and 38 desktop/mobile E2E passed**; typecheck, lint, Prisma validation and production build passed. The two new provisioning contract tests reject paid plans, multiple instances, disks/autoscaling and forbidden owner/test/API-key environment variables. Screenshots of the public fallback and mobile verified-case snapshot were inspected.
- Genuine Supabase: normalized synthetic image 425,719 bytes; two private variants uploaded, integrity checked with a fresh client, unauthenticated public retrieval rejected (HTTP 400), deletion confirmed. Report: ignored `.local/evaluation/supabase-storage.json`. No PayPal or DeepSeek call.
- Hosted PostgreSQL: eight migrations applied; UTC confirmed; one merchant/admin; zero payment/refund records. Restricted runtime verification denies schema/table creation, payment DELETE/TRUNCATE, audit UPDATE and migration-table reads. No hosted development/test fixture seed was run.
- Actual Render API confirms **web service and database Free**, Ohio, one Node instance, no disk/autoscaling/HA/replicas, database expiry **12 December 2026**. Created service `srv-dbqq1rifngtc738bt590`, deployment `dep-dbqq1rqfngtc738bt690`, application commit `0ccce70`; API status `live`. The user confirmed no payment method and Free-only resources. No paid fallback, upgrade or additional financial/AI request was made.
- Genuine HTTPS: homepage, demo dashboard, verified-case snapshot, synthetic image, public analytics and DB health returned 200; unauthenticated merchant analytics returned 401; POST-only payments GET returned 405 and empty unauthenticated POST returned 401. No payment operation was constructed.
- Hosted Playwright operator smoke passed at desktop 1280 and mobile 390 widths: filtering, no page overflow, decoded synthetic image, stored genuine assessment and sanitized refund status. Screenshots were visually inspected. Authorized merchant login produced Secure/HttpOnly/SameSite=Lax cookies; analytics access succeeded; wrong-origin mutation returned 403; logout revoked access. Counts confirm zero new payments/refunds/AI attempts.
- Actual Render restart accepted; new process startup observed in service logs; HTTPS healthy afterward; existing hosted merchant/user/financial/evidence fingerprint unchanged; both private synthetic image variants persisted and were deleted afterward. The first immediate poll correctly reported startup not yet observed, without issuing another restart; a later check passed. Hosted customer-upload UI remains **not verified**, rather than being inferred from this storage probe.
- Secret checks: configured local/hosted credentials were absent from scanned source; PayPal/DeepSeek/Supabase secrets absent from 33 browser asset files. `.env`, `.env.render` and both private generated runtime/import files are ignored. No raw secret was logged. Runtime import excludes the Render API key, owner/test URLs, unconfirmed Studio key and obsolete webhook target.

Initial failures were corrected transparently: Prisma cannot deserialize advisory-lock `void`, so lock calls use executeRaw; local DATABASE_URL duplicates were consolidated and hosted settings moved to `.env.render`; the stopped local cluster was restarted without resetting data; operator bootstrap pool-start waits were increased after P2028, with read-only checks confirming no partial merchant/role commit. The new payment smoke initially used GET on POST-only endpoints (405); it now checks the existing empty unauthenticated POST rejection (401), before body validation/provider construction. The hosted UI harness initially guessed the cookie name, then imported the established `SESSION_COOKIE` constant; it also waits for fragment hydration/image decoding. The final reruns passed. Windows sandbox tsx startup failures were rerun with approved process access. No existing tests or security guards were weakened.

The connected browser and Windows fallback both failed kernel initialization (`os error 3`). The user therefore selected the official Render API path. Privately add `RENDER_API_KEY` to `.env.render` only; do not give it to the web service. `scripts/deploy-render.ts` uses the current official [Render OpenAPI contract](https://api-docs.render.com/openapi/render-public-api-1.json), matches the configured DB against returned resources and prints only sanitized settings/status.

```powershell
# Generate the private environment import once from the verified restricted role:
node --import tsx scripts/prepare-render-env.ts
# Read-only Free-plan/request preflight:
node --env-file=.env.render --import tsx scripts/deploy-render.ts
# Only after confirming NO payment method/paid overages and publishing the reviewed main branch:
$env:RENDER_ZERO_COST_CONFIRMED = 'true'
node --env-file=.env.render --import tsx scripts/deploy-render.ts --create
# Bounded read-only status query (no automatic deploy retry):
node --env-file=.env.render --import tsx scripts/deploy-render.ts --status
```

Creation explicitly sets plan **free**, one Node instance in Ohio, no disk/autoscaling/pre-deploy job and automatic deploys off. Render's API otherwise defaults to a paid compute plan; the helper never relies on that default. It refuses payment-required responses, never upgrades and never automatically retries creation. Re-running checks for the same named service first. Deployment API credentials and runtime env values are never printed. Key validity does not prove website availability; require the real HTTPS smoke and visual check before claiming success.

Changed file groups: pinned Supabase dependency/lock; private evidence adapter/config/service/retention and additive `202611120001_private_evidence_storage`; public demo routes/artifact/analytics projection; Render config/start/owner migration/bootstrap/restricted-role/operator API helpers; secret scans; targeted unit/integration/browser coverage; privacy notice, README, architecture, decisions, sponsor notes and this runbook. Earlier Phase 2–6 working files are preserved for the deployment release, not rewritten as a second integration.

## Remaining operator steps and honest limits

1. **Judge access works now:** open https://returnwise-ai-t6sv.onrender.com/demo shortly before presenting to allow a Free cold start. Explore the three synthetic economic scenarios, then the published completed $5 Sandbox case. Do not describe these snapshots as new hosted provider operations. No judge login is needed.
2. **Private merchant access:** set `APP_BASE_URL=https://returnwise-ai-t6sv.onrender.com` privately in `.env.render`, then issue a one-time link with the command above using hosted merchant `01c31800-4f91-45c0-a583-f923be5c4889` and the privately configured admin email. Do not use the local seeded merchant UUID on this fresh hosted database. The hosted account was verified by the operator smoke; it starts without order/case/provider fixtures.
3. **AG Studio:** request free public-demo permission from the trial issuer for this exact onrender.com domain. A technically valid key alone does not grant contractual permission. Until clarified, keep hosted authorization false and use the honest fallback. No new sponsor eligibility claim is made.
4. **Webhook:** register/update the Sandbox app subscription to `https://returnwise-ai-t6sv.onrender.com/api/paypal/webhook` and privately save its corresponding `PAYPAL_WEBHOOK_ID` on Render. The old local tunnel ID was intentionally omitted. Genuine hosted delivery is not verified; existing local genuine verification remains documented separately. Do not create new payments merely to test deployment.
5. **Hosted evidence/AI journey:** no hosted customer order/case exists, so upload through an authorized customer capability, a new hosted inference and full hosted case-to-refund remain unverified. Do not seed tests against this DB. Create only an intentionally authorized demonstration order/case, with separate explicit approval before any new Sandbox purchase/refund. Hosted `AI_ENABLED=false` preserves $0 incremental AI expenditure; use only existing prepaid balance and the server cap if deliberately enabling it later.
6. **Free limits/privacy:** database expires 12 December 2026, with no paid renewal/backup configured. Preserve a private export/local recording before expiry. Watch included bandwidth/build/storage quotas; do not enable overages. Restrict external database access to the operator IP in Render if not already restricted; dashboard IP-allowlist configuration was not independently verified. Run documented retention cleanup manually; no paid scheduler exists. Supabase project pause and Render cold starts can interrupt availability. Historical timestamp uncertainty remains unchanged. This is a restricted hackathon deployment, not a production-readiness certification.

Local regression suites ran against the verified dedicated test database only. Remote GitHub Actions execution is not claimed. Deployment acceptance is **public read-only HTTPS and persistence verified, with the above integration/licensing limits**; do not label every hosted provider gate complete.
