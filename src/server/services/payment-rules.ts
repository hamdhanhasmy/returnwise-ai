import { createHash } from "node:crypto";
import type {
  Payment,
  ProviderRefund,
  RefundOperation,
} from "@/generated/prisma/client";
import { parseUsd } from "@/lib/money";
import { PAYPAL_SANDBOX_ORIGIN } from "@/lib/payments/config";
import type {
  PayPalOrder,
  PayPalCapture,
  PayPalRefund,
} from "@/lib/payments/contracts";

export class PaymentError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
export function invariant(
  condition: unknown,
  code: string,
  message: string,
  status = 409,
): asserts condition {
  if (!condition) throw new PaymentError(code, message, status);
}
// PostgreSQL jsonb reorders object keys; canonicalize before binding request identity.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
export const digest = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");

export function verifyOrder(payment: Payment, order: PayPalOrder) {
  const unit = order.purchase_units[0];
  invariant(
    order.id === payment.paypalOrderId &&
      order.intent === "CAPTURE" &&
      order.purchase_units.length === 1 &&
      unit?.reference_id === payment.orderId &&
      unit.custom_id === payment.id &&
      unit.payee.merchant_id === payment.expectedPayeeId &&
      unit.amount.currency_code === payment.currency &&
      parseUsd(unit.amount.value) === payment.expectedAmountMinor,
    "ORDER_MISMATCH",
    "PayPal order identity, merchant or amount does not match the persisted checkout",
  );
  return unit;
}

export function verifyCapture(
  payment: Payment,
  order: PayPalOrder,
  capture: PayPalCapture,
) {
  const unit = verifyOrder(payment, order);
  invariant(
    unit.payments?.captures?.length === 1 &&
      unit.payments.captures[0]?.id === capture.id &&
      (!payment.paypalCaptureId || payment.paypalCaptureId === capture.id) &&
      capture.amount.currency_code === payment.currency &&
      parseUsd(capture.amount.value) === payment.expectedAmountMinor &&
      capture.payee?.merchant_id === payment.expectedPayeeId &&
      capture.supplementary_data?.related_ids.order_id ===
        payment.paypalOrderId,
    "CAPTURE_MISMATCH",
    "Capture ownership, reference or amount could not be verified",
  );
}

export function refundCaptureId(refund: PayPalRefund) {
  const parents = refund.links.filter(
    (link) => link.rel === "up" && (!link.method || link.method === "GET"),
  );
  invariant(
    parents.length === 1,
    "REFUND_MISMATCH",
    "Refund capture relationship is missing",
  );
  const url = new URL(parents[0]!.href);
  const match = /^\/v2\/payments\/captures\/([A-Za-z0-9_-]+)$/.exec(
    url.pathname,
  );
  invariant(
    [PAYPAL_SANDBOX_ORIGIN, "https://api.sandbox.paypal.com"].includes(
      url.origin,
    ) &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password &&
      match,
    "REFUND_MISMATCH",
    "Refund capture relationship is invalid",
  );
  return match[1]!;
}

export function verifyRefund(
  payment: Payment,
  refund: PayPalRefund,
  operation?: RefundOperation | null,
) {
  invariant(
    refundCaptureId(refund) === payment.paypalCaptureId &&
      refund.amount.currency_code === payment.currency &&
      (!operation ||
        !refund.invoice_id ||
        refund.invoice_id === operation.id) &&
      (!operation || parseUsd(refund.amount.value) === operation.amountMinor),
    "REFUND_MISMATCH",
    "Refund amount, currency or capture does not match the approved operation",
  );
}

export function refundableBalance(
  payment: Payment,
  refunds: ProviderRefund[],
  operations: RefundOperation[],
) {
  const completed = refunds
    .filter((r) => r.providerStatus === "COMPLETED")
    .reduce((sum, r) => sum + r.amountMinor, 0n);
  const held = operations
    .filter((r) => r.reservation === "HELD")
    .reduce((sum, r) => sum + r.amountMinor, 0n);
  const externalPending = refunds
    .filter(
      (r) =>
        !r.operationId &&
        !["COMPLETED", "FAILED", "CANCELLED"].includes(r.providerStatus),
    )
    .reduce((sum, r) => sum + r.amountMinor, 0n);
  const remaining =
    (payment.captureAmountMinor ?? 0n) - completed - held - externalPending;
  invariant(
    remaining >= 0n,
    "LEDGER_MISMATCH",
    "Refund ledger exceeds the verified capture; manual review required",
  );
  return { completed, held, remaining };
}
