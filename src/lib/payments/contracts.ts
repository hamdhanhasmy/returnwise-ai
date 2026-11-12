import { z } from "zod";
import { parseUsd } from "../money";

export const providerId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
// Normalize human-entered USD strings without converting through floating point.
export const refundAmountSchema = z
  .string()
  .max(16)
  .regex(/^(0|[1-9]\d{0,3})(\.\d{1,2})?$/)
  .transform((value) => {
    const [whole, fraction = ""] = value.split(".");
    return `${whole}.${fraction.padEnd(2, "0")}`;
  })
  .refine((value) => {
    try {
      return parseUsd(value) > 0n;
    } catch {
      return false;
    }
  }, "Use a positive USD amount up to 1000.00");
export const paypalMoney = z.object({
  currency_code: z.literal("USD"),
  value: z
    .string()
    .max(16)
    .refine((value) => {
      try {
        return parseUsd(value) > 0n;
      } catch {
        return false;
      }
    }),
});
const link = z.object({
  href: z.string().url(),
  rel: z.string(),
  method: z.string().optional(),
});
export const captureSchema = z.object({
  id: providerId,
  status: z.string(),
  amount: paypalMoney,
  payee: z.object({ merchant_id: providerId }).optional(),
  supplementary_data: z
    .object({ related_ids: z.object({ order_id: providerId.optional() }) })
    .optional(),
  update_time: z.string().optional(),
});
export const orderSchema = z.object({
  id: providerId,
  status: z.string(),
  intent: z.literal("CAPTURE"),
  purchase_units: z
    .array(
      z.object({
        reference_id: z.string(),
        custom_id: z.string().optional(),
        amount: paypalMoney,
        payee: z.object({ merchant_id: providerId }),
        payments: z
          .object({ captures: z.array(captureSchema).optional() })
          .optional(),
      }),
    )
    .length(1),
});
export const refundSchema = z.object({
  id: providerId,
  status: z.string(),
  amount: paypalMoney,
  invoice_id: z.string().optional(),
  custom_id: z.string().optional(),
  links: z.array(link),
  update_time: z.string().optional(),
  seller_payable_breakdown: z
    .object({ total_refunded_amount: paypalMoney.optional() })
    .optional(),
});
export type PayPalOrder = z.infer<typeof orderSchema>;
export type PayPalCapture = z.infer<typeof captureSchema>;
export type PayPalRefund = z.infer<typeof refundSchema>;
export const receiptSchema = z.object({ id: providerId, status: z.string() });
export type PayPalReceipt = z.infer<typeof receiptSchema>;

export interface PayPalGateway {
  createOrder(
    payload: Record<string, unknown>,
    requestId: string,
  ): Promise<PayPalReceipt>;
  getOrder(id: string): Promise<PayPalOrder>;
  captureOrder(id: string, requestId: string): Promise<PayPalReceipt>;
  getCapture(id: string): Promise<PayPalCapture>;
  refundCapture(
    id: string,
    payload: Record<string, unknown>,
    requestId: string,
  ): Promise<PayPalReceipt>;
  getRefund(id: string): Promise<PayPalRefund>;
  verifyWebhook(payload: Record<string, unknown>): Promise<boolean>;
}

export function usdDecimal(minor: bigint) {
  if (minor <= 0n || minor > 100_000n) throw new Error("Invalid USD amount");
  return `${minor / 100n}.${(minor % 100n).toString().padStart(2, "0")}`;
}
