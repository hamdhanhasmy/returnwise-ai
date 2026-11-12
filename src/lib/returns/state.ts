import { invariant } from "@/server/services/payment-rules";
export const transitions: Record<string, readonly string[]> = {
  SUBMITTED: ["EVALUATED", "MANUAL_REVIEW", "REJECTED"],
  MANUAL_REVIEW: [
    "EVALUATED",
    "MANUAL_REVIEW",
    "AWAITING_CUSTOMER",
    "REJECTED",
  ],
  EVALUATED: [
    "EVALUATED",
    "MANUAL_REVIEW",
    "RESOLUTION_PROPOSED",
    "AWAITING_CUSTOMER",
    "REJECTED",
  ],
  RESOLUTION_PROPOSED: ["APPROVED", "MANUAL_REVIEW", "REJECTED"],
  AWAITING_CUSTOMER: [
    "RESOLUTION_PROPOSED",
    "MANUAL_REVIEW",
    "SUBMITTED",
    "REJECTED",
  ],
  APPROVED: ["CLOSED", "REFUND_AUTHORIZED"],
  REFUND_AUTHORIZED: ["REFUND_PROCESSING", "REFUND_PENDING", "REFUND_FAILED"],
  REFUND_PROCESSING: ["REFUND_PENDING", "REFUND_FAILED", "CLOSED"],
  REFUND_PENDING: ["REFUND_PROCESSING", "REFUND_FAILED", "CLOSED"],
  REFUND_FAILED: ["REFUND_PENDING", "CLOSED"],
  REJECTED: ["CLOSED"],
  CLOSED: [],
  PENDING: ["MANUAL_REVIEW"],
};
export function assertTransition(from: string, to: string) {
  invariant(
    transitions[from]?.includes(to),
    "INVALID_TRANSITION",
    "This case action is no longer available. Refresh the case.",
  );
}
