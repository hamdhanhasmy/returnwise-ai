# PayPal Sandbox runbook

Phase 2 is implemented for one configured business merchant, USD, one item/capture per order, amounts up to USD 1,000, and at most 20 refund operations per capture. Fictional products are separate from genuine Sandbox operations. No live-payment switch exists. See the historical [implementation evidence](phase-2-verification.md) and current [genuine Sandbox evidence](phase-2.5-verification.md) for what actually ran.

## Local configuration (Windows / PowerShell)

1. Keep `npm.cmd run db:local` running in its terminal, or use your configured PostgreSQL service. Preserve separate `DATABASE_URL` and `TEST_DATABASE_URL`; see [test isolation](test-database-isolation.md). Never copy development data into tests or reset either database for this integration.
2. Apply the additive migrations and regenerate the client:

   ```powershell
   npm.cmd run db:generate
   npm.cmd run db:migrate
   npm.cmd run db:migrate:test
   ```

3. In the PayPal Developer Dashboard, select **Sandbox**, create/select a REST app owned by a Sandbox business account, and obtain its client ID, secret, and business merchant ID. Use a separate Sandbox **personal** account as the buyer. Enter values privately into the ignored `.env` file using your editor; never paste secrets into chat, scripts, screenshots, or Git. Keep `PAYPAL_ENV=sandbox` and set `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MERCHANT_ID`. Do not add `NEXT_PUBLIC_` secrets. Only the client ID is intentionally passed to the official buyer SDK.
4. Bind the existing local merchant and add the explicit fictional demo policy. This local operator command performs no PayPal requests and never prints credentials. It preserves existing policy versions and refuses rebinding to a different account.

   ```powershell
   npm.cmd run paypal:verify -- --oauth
   npm.cmd run paypal:configure -- --merchant=11111111-1111-4111-8111-111111111111 --verification-product
   npm.cmd run auth:link -- --email=admin@oakandloom.example --merchant=11111111-1111-4111-8111-111111111111
   npm.cmd run dev
   ```

   Run `auth:link` only in your private terminal; its output is a single-use sign-in credential. Restart Next.js after environment changes. Open the sign-in link, then **Demo checkout**. Staff can inspect records but cannot perform payment actions. The binding command configures a local association; the first authenticated provider lookup must still verify it.

The verification-product flag creates a merchant-scoped fictional $1.00 USD item without changing existing product prices. The API origin is fixed to `https://api-m.sandbox.paypal.com`; there is no configurable live/base-URL override. The listener path is `/api/paypal/webhook`. Authentication uses hashed random login/session credentials; this architecture does not require an `AUTH_SECRET` environment variable.

## Genuine lifecycle acceptance

- Select a fictional product and confirm its persisted USD price. Approve with the official **Sandbox JavaScript SDK v6** experience using the personal buyer account. The application creates the PayPal order on the server and verifies the capture through authenticated GETs.
- Inspect **Transactions → detail**: actual order ID, capture ID, raw provider status, verified amount, and verification timestamp must be present. `CAPTURED` requires an actual verified `COMPLETED` capture. Browser approval alone is insufficient.
- For a full refund, enter the full remaining amount and reason. Review the exact amount, attest human eligibility, then explicitly confirm in the dialog. A fresh untouched full capture uses PayPal's empty full-refund body; other refunds specify the exact amount.
- For a partial refund, prepare the amount and reason, privately give the buyer the acceptance link, and have them accept the exact terms. Return to the merchant's review and confirm. The acceptance token lives in the URL fragment, is hashed at rest, expires in 30 minutes, and is never stored as a raw token in server logs. Acceptance is an agreement, not proof of buyer identity; only share with the intended Sandbox buyer. Lost links require a new review.
- Check the actual refund ID and provider status. `PENDING`, `PROCESSING`, or `NEEDS_RECONCILIATION` are **not completed refunds**. Use **Refresh from PayPal** until the verified outcome arrives. Test full and sequential partial refunds on separate purchases.
- Record timestamps, IDs, amounts, and outcomes in a private evidence log; redact account data and secrets before including evidence in the submission. Automated mock tests do not satisfy this acceptance gate.

## Recovery and operating limits

All create/capture/refund intent and request IDs persist before external I/O. PostgreSQL locks and short transactions reserve capacity; no transaction spans PayPal network calls. A payment lease serializes operations. A crashed process's lease expires after two minutes; reconcile before continuing.

- Refresh or duplicate approval uses the existing logical operation. A browser refresh reuses the checkout key; **Start a separate purchase** explicitly clears it only after a resolved payment outcome.
- Unknown create results without an order ID require manual investigation. Do not create a replacement order to hide the uncertainty. There is no invented request-ID lookup endpoint.
- Capture timeouts reconcile the persisted PayPal order and its captures through GET; they never automatically submit another capture.
- Refund timeouts retain the reservation. If the refund ID is known, GET that refund. If no ID is known, an administrator may explicitly **Reconcile and retry the same refund**; this uses the original persisted payload and request ID, only within a conservative 24-hour window. Expired retries stay reserved for manual investigation. PayPal's [request guide](https://developer.paypal.com/api/rest/requests/) documents refund request-ID retention up to 45 days; application retries use the shorter window.
- Unmatched external refunds, identity/amount mismatches, and status regressions freeze the ledger. Do not clear reservations or modify statuses manually to make the UI green. Investigate against PayPal, then implement a separately reviewed repair if needed.
- Use a dedicated Sandbox app/account and perform refunds through ReturnWise. PayPal does not expose an atomic lock shared with its dashboard or a documented capture-refund listing in this slice. Out-of-band dashboard refunds can race local reservations; detected external activity freezes the ledger, and PayPal enforces its own refund ceiling. This prototype does not claim full external-ledger synchronization.
- No background scheduler is installed. Webhooks and authenticated **Refresh from PayPal** provide reconciliation. Keep operator access available for pending/unknown operations.

## Genuine webhooks

### Temporary webhook-only tunnel on Windows

Install the official Windows `cloudflared` executable from [Cloudflare downloads](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/). For this local verification, version 2026.10.7 was downloaded from the official GitHub release into ignored `.local/tools/cloudflared.exe`; its SHA256 was `2493dbc168923bb3e59e5e7716f71deced92992eea9acd6e9d74f84ac7751343`. No executable or secret is committed.

Keep the app on port 3000 and run each of these in a separate PowerShell terminal:

```powershell
npm.cmd run paypal:listener
# If installed on PATH, use cloudflared.exe instead of the local path:
.\.local\tools\cloudflared.exe tunnel --no-autoupdate --url http://127.0.0.1:3200
```

Copy the printed `https://<temporary-host>.trycloudflare.com` origin and append **`/api/paypal/webhook`**. Register that exact URL on the existing Sandbox REST app, choose the events below, and save the registered ID privately in `.env`. Restart the app after setting `PAYPAL_WEBHOOK_ID`. Leave `APP_BASE_URL=http://127.0.0.1:3000` when browsing locally: the tunnel intentionally exposes only the webhook. The relay preserves payload bytes and signature headers, strips cookies, bounds request size/time, and forwards the application's status without its error details. It performs no signature validation itself; the application still requires PayPal verification.

The relay logs only response status and UTC time so genuine redelivery can be observed without recording payloads or signature headers. If an IPv6 network interruption prevents reconnecting, `--edge-ip-version 4` selects IPv4 on the installed tunnel client. If the provider reports the ephemeral tunnel no longer exists, restart it and update the subscription URL; do not create another payment to compensate for a delivery failure. Use the Sandbox event log's resend action for the existing transaction-generated event.

The [Quick Tunnel](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) hostname changes after restart, so update the subscription and keep the listener/tunnel alive during delivery. Stop both with Ctrl+C when finished, and remove/update the temporary subscription. Do not use browser/email access protection on this machine-to-machine endpoint.

### Registration and acceptance

Create a public HTTPS listener forwarding to `/api/paypal/webhook`, then register that URL on the **same Sandbox REST app**. Choose your tunnel/hosting provider separately; this repository does not deploy or create external accounts. Set the returned registered ID privately as `PAYPAL_WEBHOOK_ID`, restart the app, and retain the HTTPS URL while testing. If browsing the app through that HTTPS origin, set `APP_BASE_URL` to exactly that origin so authenticated POSTs pass CSRF checks.

Subscribe to:

- `CHECKOUT.ORDER.APPROVED`, `CHECKOUT.ORDER.COMPLETED`
- `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.DECLINED`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`
- `PAYMENT.REFUND.PENDING`, `PAYMENT.REFUND.FAILED`

The receiver bounds the JSON body, passes the complete original parsed event plus transmission headers and registered webhook ID to `POST /v1/notifications/verify-webhook-signature`, and requires `SUCCESS`. It stores a canonical payload hash and minimal redacted identifiers, deduplicates by event ID, and fetches current provider records before changing the ledger. A duplicate/out-of-order payload never directly overwrites money or status. Failed/unmatched/busy deliveries return errors for retry; use PayPal's event resend and authenticated reconciliation if delivery is delayed.

PayPal's [webhook documentation](https://developer.paypal.com/api/rest/webhooks/rest/) states that simulator mock events do **not** support postback verification. This implementation intentionally does not accept the simulator's `WEBHOOK_ID` bypass. Unit/integration signature mocks are separate evidence from genuine signed Sandbox delivery. Verify delivery using a real Sandbox checkout/refund and the registered app's webhook event log.

## Verification commands

```powershell
npm.cmd run db:validate
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run test:integration
npx.cmd vitest run --config vitest.integration.config.ts
npm.cmd run build
npm.cmd run test:e2e
```

Integration tests use injected provider mocks and real isolated PostgreSQL; they cannot access development through a missing test URL. Browser tests deliberately disable provider credentials. No automated suite creates real PayPal payments. See [Phase 2 evidence](phase-2-verification.md) for actual results and remaining external prerequisites.
