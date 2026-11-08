# Proposed environment contract

Planning only, 2026-11-08. No `.env` or `.env.example` is created in this phase and no secrets were requested or inspected. These are the exact proposed application variable names; code must implement and validate them in the relevant milestone. Existing `.gitignore` already excludes `.env` and `.env.*` except `.env.example`.

## Required by milestone

| Variable | Needed | Example / validation | Exposure |
| --- | --- | --- | --- |
| `DATABASE_URL` | M1 runtime and migrations | `postgresql://returnwise:REPLACE_ME@localhost:5432/returnwise_dev?schema=public`; PostgreSQL URL, TLS when remote | Server secret; ignored local `.env` or host secret store |
| `TEST_DATABASE_URL` | M1 DB integration tests | `postgresql://returnwise_test:REPLACE_ME@localhost:5432/returnwise_test?schema=public`; dedicated disposable DB, different database name and URL from runtime | Test process only; tests fail before cleanup if separation is unproven |
| `APP_BASE_URL` | M1 | `http://localhost:3000`; exact absolute origin, no path/query; HTTPS for hosted use | Server config for origin checks and links; origin itself is public |
| `PAYPAL_ENV` | M1 validation; M2 requests | Exactly `sandbox`; reject all other values | Server; no production toggle |
| `PAYPAL_CLIENT_ID` | M2a | Sandbox REST app client ID, nonempty | Server source of truth; **nonsecret ID intentionally supplied to browser JS SDK only** |
| `PAYPAL_CLIENT_SECRET` | M2a | Secret for same sandbox REST app | Server secret; never serialize |
| `PAYPAL_MERCHANT_ID` | M2a | Sandbox business account's PayPal merchant ID; not app client ID or email alias | Server ownership check; must equal configured Merchant and verified payee |
| `PAYPAL_WEBHOOK_ID` | M2b when enabling webhooks | Registered webhook ID for same sandbox REST app | Server config; missing value disables/rejects webhook verification, never bypasses it |
| `OPENAI_API_KEY` | M4; reused by M6 | Locally supplied API credential | Server secret; no browser or Studio adapter key |
| `OPENAI_MODEL` | M4 | Explicit documented Structured Outputs model ID chosen and recorded at integration; no unverified default | Server; same model may serve M6 only if its tool support is verified |
| `AG_STUDIO_LICENSE_KEY` | Conditional M6 hosting | Vendor-issued key if required by intended use; omit for permitted local evaluation | Config is server-read then passed intentionally to Studio's browser license initialization; treat distribution per license, never as an API credential |

No credentials are needed for M0. Foundation works without PayPal/OpenAI credentials, with explicit unavailable states. Once integration is enabled, partial credential groups are configuration errors, not simulated success. Missing OpenAI configuration keeps manual case review available. Model choice/account access is an M4 gate, not a request for credentials now.

The browser's PayPal client ID exception is deliberate: client ID is not a client secret. Prefer a narrow server-rendered SDK configuration object so there is no duplicate `NEXT_PUBLIC_PAYPAL_CLIENT_ID` that can drift from server credentials. Never send arbitrary environment objects. `PAYPAL_CLIENT_SECRET`, `OPENAI_API_KEY` and DB credentials have no `NEXT_PUBLIC_` equivalents.

## Conditional operational settings

| Variable | When introduced | Meaning |
| --- | --- | --- |
| `DATABASE_MIGRATION_URL` | If least-privilege runtime DB role or pooled hosting requires a separate owner connection | Server/CLI-only direct connection used by migration tooling; omit and use DATABASE_URL only on dedicated local development DB where appropriate. Configure explicitly in chosen Prisma version. |
| `RECONCILIATION_SECRET` | Only if an approved host scheduler calls an HTTP reconciliation route | High-entropy server-to-server bearer credential; authenticated merchant reconciliation requires no scheduler secret. Do not create a public unauthenticated cron route. |
| `PORT` | Host-provided or local override | Next.js listening port; default 3000. |
| `NODE_ENV` | Managed by Next.js/scripts | Build/runtime mode. It must never select live PayPal. |

Login links and sessions use random opaque tokens hashed in PostgreSQL, not signed JWTs; this design does not need `AUTH_SECRET`, SMTP credentials, OAuth provider secrets or a shared demo password. A future local CLI issues a one-time link to an existing seeded user through a secure local handoff; no token is committed or placed in shared logs. Any auth-provider change updates this contract first.

Optional images are explicitly out of the initial vertical slice. No storage provider is selected, so no invented bucket/key variables are required. Introduce a concrete storage contract and exact variables only when adding uploads. Similarly, no live PayPal URL, payout settings, partner assertion, transaction-search credentials or generic AI proxy URL is required.

## Constants, not environment knobs

- Sandbox base URL fixed in the adapter: `https://api-m.sandbox.paypal.com`. Do not accept arbitrary client/provider URLs or follow unvalidated response links.
- USD-only currency support, quote/calculator/schema versions, demo amount ceiling, timeouts, token lifetimes, input limits and policy fixtures are typed code or persisted policy. Version changes and tests accompany changes.
- Webhook URL derives from `APP_BASE_URL` plus `/api/paypal/webhooks`; it is registered separately with the sandbox app. A localhost URL cannot receive ordinary PayPal HTTPS callbacks; approve a tunnel/host when that integration step arrives.
- Request IDs belong in DB records, never environment variables. Buyer credentials are entered only in PayPal's sandbox approval UI, never application environment or chat.

At implementation, `.env.example` contains fake placeholders, required-stage comments and no real credential. Provide secrets only through the ignored local file or deployment secret UI at the actual integration milestone. The server validates readiness without echoing values. Never run commands that print the whole environment.
