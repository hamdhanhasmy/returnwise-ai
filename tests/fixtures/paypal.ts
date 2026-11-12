import { randomUUID } from "node:crypto";
import { vi } from "vitest";
import type {
  PayPalGateway,
  PayPalOrder,
  PayPalCapture,
  PayPalRefund,
} from "@/lib/payments/contracts";
import { parseUsd } from "@/lib/money";
import { usdDecimal } from "@/lib/payments/contracts";
export const fakeMerchantId = "TESTMERCHANT123";
/** Tests only: never imported by application runtime. No external requests. */
export class FakePayPal implements PayPalGateway {
  constructor(readonly merchantId = fakeMerchantId) {}
  orders = new Map<string, PayPalOrder>();
  captures = new Map<string, PayPalCapture>();
  refunds = new Map<string, PayPalRefund>();
  keys = new Map<string, string>();
  refundStatus = "COMPLETED";
  captureStatus = "COMPLETED";
  createOrder = vi.fn(async (payload: Record<string, unknown>, key: string) => {
    const existing = this.keys.get(key);
    if (existing) return this.orders.get(existing)!;
    const id = randomUUID();
    const order = {
      ...structuredClone(payload),
      id,
      status: "CREATED",
    } as PayPalOrder;
    this.orders.set(id, order);
    this.keys.set(key, id);
    return { id, status: order.status };
  });
  getOrder = vi.fn(async (id: string) => structuredClone(this.orders.get(id)!));
  captureOrder = vi.fn(async (id: string, key: string) => {
    const order = this.orders.get(id)!;
    if (!this.keys.has(key)) {
      const capture: PayPalCapture = {
        id: randomUUID(),
        status: this.captureStatus,
        amount: order.purchase_units[0]!.amount,
        payee: { merchant_id: this.merchantId },
        supplementary_data: { related_ids: { order_id: id } },
      };
      this.captures.set(capture.id, capture);
      order.purchase_units[0]!.payments = { captures: [capture] };
      order.status = "COMPLETED";
      this.keys.set(key, capture.id);
    }
    return { id, status: order.status };
  });
  getCapture = vi.fn(async (id: string) =>
    structuredClone(this.captures.get(id)!),
  );
  refundCapture = vi.fn(
    async (id: string, payload: Record<string, unknown>, key: string) => {
      const previous = this.keys.get(key);
      if (previous) return structuredClone(this.refunds.get(previous)!);
      const capture = this.captures.get(id)!;
      const amount = payload.amount as PayPalRefund["amount"] | undefined;
      const refund: PayPalRefund = {
        id: randomUUID(),
        status: this.refundStatus,
        amount: amount ?? capture.amount,
        invoice_id: payload.invoice_id as string | undefined,
        links: [
          {
            rel: "up",
            href: `https://api-m.sandbox.paypal.com/v2/payments/captures/${id}`,
            method: "GET",
          },
        ],
      };
      this.refunds.set(refund.id, refund);
      this.keys.set(key, refund.id);
      this.syncCapture(id);
      return structuredClone(refund);
    },
  );
  getRefund = vi.fn(async (id: string) =>
    structuredClone(this.refunds.get(id)!),
  );
  verifyWebhook = vi.fn(async () => true);
  approve(id: string) {
    this.orders.get(id)!.status = "APPROVED";
  }
  syncCapture(id: string) {
    const capture = this.captures.get(id)!;
    const total = [...this.refunds.values()]
      .filter((r) => r.links[0]!.href.endsWith(id) && r.status === "COMPLETED")
      .reduce((n, r) => n + parseUsd(r.amount.value), 0n);
    capture.status =
      total === 0n
        ? "COMPLETED"
        : total === parseUsd(capture.amount.value)
          ? "REFUNDED"
          : "PARTIALLY_REFUNDED";
    for (const r of this.refunds.values())
      if (total > 0n && r.links[0]!.href.endsWith(id))
        r.seller_payable_breakdown = {
          total_refunded_amount: {
            currency_code: "USD",
            value: usdDecimal(total),
          },
        };
  }
}
