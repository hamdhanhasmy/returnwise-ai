# Provider documentation review

Reviewed public official documentation on 2026-11-08. No authenticated provider account was accessed, no SDK was installed and no live API request was made. These notes verify API names and planning assumptions, not account readiness or sandbox transaction success.

## PayPal REST contracts

All application REST traffic is fixed to `https://api-m.sandbox.paypal.com`. Proposed adapter calls:

| Purpose | Method and path | Official reference |
| --- | --- | --- |
| Obtain server access token | `POST /v1/oauth2/token`, client credentials grant | [Authentication](https://developer.paypal.com/api/rest/authentication/) |
| Create buyer order | `POST /v2/checkout/orders` | [Create order](https://developer.paypal.com/api/orders/v2/orders-create) |
| Re-read order / recover capture result | `GET /v2/checkout/orders/{id}` | [Orders reference](https://developer.paypal.com/api/orders/v2) |
| Capture approved order | `POST /v2/checkout/orders/{id}/capture` | [Capture order](https://developer.paypal.com/api/orders/v2/orders-capture) |
| Verify capture | `GET /v2/payments/captures/{capture_id}` | [Capture details](https://developer.paypal.com/api/payments/v2/captures-get) |
| Refund a verified capture | `POST /v2/payments/captures/{capture_id}/refund` | [Refund capture](https://developer.paypal.com/api/payments/v2/captures-refund) |
| Reconcile a known refund | `GET /v2/payments/refunds/{refund_id}` | [Refund details](https://developer.paypal.com/api/payments/v2/refunds-get) |
| Verify received webhook signature | `POST /v1/notifications/verify-webhook-signature` | [Signature verification](https://developer.paypal.com/api/webhooks/v1/verify-webhook-signature-post) |

MVP uses `intent: CAPTURE`, one USD purchase unit, browser buyer approval, then server capture. Persist separate create/capture operation keys; never allow the client to choose the amount or capture owner. Current SDK v5 documentation supplies a browser `client-id`; this is the intended nonsecret configuration exception. Select the concrete supported SDK version at M2 and follow its matching approval contract. [JS SDK configuration](https://developer.paypal.com/sdk/js/v5/configuration).

Refund API supports an empty JSON body for full refund and an `amount` object for partial refund. It accepts `PayPal-Request-Id` and `Prefer: return=representation`. Our additional safety rule permits `{}` only for the first untouched, freshly verified full capture, with a persisted full amount and a response-amount check. No partner `PayPal-Auth-Assertion`, platform fees or payouts are needed for the one-merchant direct-credential design. The optional partner header in examples is not a requirement to copy. [Refund reference](https://developer.paypal.com/api/payments/v2/captures-refund).

The capture example includes payee merchant ID, currency/amount and related order ID. Verify available identifiers against locally persisted associations; missing identity data requires additional authoritative lookup or manual review. Do not substitute an email alias for merchant ID. Refund lookup provides a refund resource and capture relationship via its `up` link. Validate expected IDs and the sandbox origin/path; do not follow arbitrary URLs. [Capture details](https://developer.paypal.com/api/payments/v2/captures-get), [refund details](https://developer.paypal.com/api/payments/v2/refunds-get).

### Idempotency and uncertain outcomes

PayPal documents same-key replay and notes that simultaneous calls can fail the second request. Retention is API-specific. The fetched endpoint pages did not establish a trustworthy numerical retention period for this application; do not invent 6-hour/45-day guarantees. M2 must verify current endpoint-specific retention before enabling timed POST replay. Read-only reconciliation remains possible without that assumption. Local uniqueness and held reservations persist indefinitely. [Idempotency](https://developer.paypal.com/api/rest/reference/idempotency/).

No verified endpoint in this review lists all refunds for a capture or looks up a refund by request ID. `GET capture` is not assumed to expose a complete refundable balance or full refund history. `total_refunded_amount` in a refund response is a cross-check, not proof that there is no other pending request. Unexplained external changes freeze execution. Missing refund ID after a timeout remains an explicit reconciliation case.

### Webhooks

Proposed subscriptions, verified against [event names](https://developer.paypal.com/api/rest/webhooks/event-names/):

- `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.DECLINED`.
- `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`.
- `PAYMENT.REFUND.PENDING`, `PAYMENT.REFUND.FAILED`.

Do not invent a `PAYMENT.REFUND.COMPLETED` event. Treat refund/capture events as reconciliation triggers; validate actual versioned event payloads in sandbox. Resource type/ID differs by event, so never interpret every `resource.id` as a capture ID.

Verification request maps the received `PAYPAL-AUTH-ALGO`, `PAYPAL-CERT-URL`, `PAYPAL-TRANSMISSION-ID`, `PAYPAL-TRANSMISSION-SIG`, and `PAYPAL-TRANSMISSION-TIME` headers plus configured `webhook_id` and unmodified parsed `webhook_event`. Require successful verification before financial processing. A verifier outage is not a bypass. Use PayPal's verification API rather than fetching attacker-supplied certificate URLs in application code. [Verification API](https://developer.paypal.com/api/webhooks/v1/verify-webhook-signature-post).

Webhook subscriptions are app-specific; events from another REST app are not automatically delivered to this app. Genuine webhook delivery and simulator fixtures are separate evidence. [Webhooks overview](https://developer.paypal.com/api/rest/webhooks/).

## OpenAI

Official Structured Outputs documentation supports a strict JSON schema in Responses `text.format`; the JavaScript guide demonstrates `responses.parse` with `zodTextFormat`. Handle refusal and incomplete output separately from a validated extraction. The application will still validate schema, lengths and business boundaries. Select a compatible model at M4; public docs do not prove account access. [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

The observation model has no financial fields or tools. Insights uses a separate read-only tool contract. Schema compliance is not evidence that a claim or image interpretation is true.

## AG Studio

Installation docs currently display version 3.1.0 and require matching `ag-studio-react`/`ag-studio` versions plus compatible Grid/Charts. Local evaluation is permitted without a license; hosted use and trial entitlement must be checked. No package is installed here. [Installation](https://www.ag-grid.com/studio/react/installation/).

The Agent Quick Start uses `AgStudioAiModule` and `createAiHarness`. Its OpenAI adapter is an example to adapt, **not a shipped import to assume exists in npm**. Browser-direct key use in the example must be replaced with our authenticated server proxy. [Agent Quick Start](https://www.ag-grid.com/studio/react/ai-quickstart/).

## Toolchain and contest

Installed Node 24.16.0 meets the current Next.js documented minimum (20.9) and the Prisma v7 Node range that includes 24.x. This is a version-prerequisite check, not an installed dependency/build test. Pin exact packages together during M1. [Next installation](https://nextjs.org/docs/app/getting-started/installation), [Prisma v7 requirements](https://www.prisma.io/docs/orm/v7/reference/system-requirements).

The official rules confirm the blueprint deadline and permit runnable source instructions as an alternative to hosting. Their sponsor table describes AG Grid tools broadly; the stronger requirement to use AG Studio specifically is this project's contract, not an independently verified contest mandate. APIMatic installation alone is not evidence of meaningful integration or a prize result. [Official rules](https://paypalaihackathon.devpost.com/rules).

## Retrieval limits

Some PayPal markdown export links were rejected by the browsing tool's content-type handling; their HTML endpoint references were read instead. The APIMatic linked GitHub tree failed to fetch; its official marketplace page was read. No undocumented SDK method, retention guarantee or generated plugin content is asserted from those failures. See [sponsor integration status](sponsor-integrations.md).
