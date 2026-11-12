"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatUsd } from "@/lib/money";
import { paymentCommand } from "./api";
export type RefundReview = {
  approvalId: string;
  amountMinor: string;
  reason: string;
  requiresConsent: boolean;
  expiresAt: string;
  consentToken?: string;
};
export function RefundControls({
  paymentId,
  remaining,
  review: initial,
}: {
  paymentId: string;
  remaining: string;
  review: RefundReview | null;
}) {
  const router = useRouter(),
    dialog = useRef<HTMLDialogElement>(null);
  const [review, setReview] = useState(initial),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [eligible, setEligible] = useState(false),
    [consentLink, setConsentLink] = useState("");
  const endpoint = `/api/payments/${paymentId}`;
  async function prepare(form: FormData) {
    setBusy(true);
    setMessage("");
    try {
      const value = await paymentCommand<RefundReview>(endpoint, {
        action: "prepare-refund",
        amount: form.get("amount"),
        reason: form.get("reason"),
      });
      setReview(value);
      setEligible(false);
      setConsentLink(
        value.consentToken
          ? `${location.origin}/refund-consent#token=${value.consentToken}`
          : "",
      );
      history.replaceState(null, "", `?approval=${value.approvalId}`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!review) return;
    setBusy(true);
    try {
      const value = await paymentCommand<{
        status: string;
        refundId: string | null;
      }>(endpoint, {
        action: "approve-refund",
        approvalId: review.approvalId,
        confirmed: true,
        eligibilityConfirmed: eligible,
      });
      setMessage(
        `Refund operation: ${value.status.replaceAll("_", " ")}. ${value.refundId ? `Provider refund ID: ${value.refundId}.` : "No verified refund ID yet."}`,
      );
      dialog.current?.close();
      router.refresh();
    } catch (error) {
      setMessage((error as Error).message);
      dialog.current?.close();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <form action={prepare} className="space-y-4">
        <label className="block text-sm font-medium">
          Refund amount (USD)
          <Input
            name="amount"
            inputMode="decimal"
            required
            pattern="[0-9]+([.][0-9]{1,2})?"
            defaultValue={`${BigInt(remaining) / 100n}.${(BigInt(remaining) % 100n).toString().padStart(2, "0")}`}
            className="mt-2"
          />
        </label>
        <label className="block text-sm font-medium">
          Refund reason
          <Input
            name="reason"
            required
            minLength={3}
            maxLength={255}
            placeholder="Describe the agreed resolution"
            className="mt-2"
          />
        </label>
        <Button disabled={busy || BigInt(remaining) <= 0n}>
          Review exact refund
        </Button>
      </form>
      {review && (
        <section
          className="space-y-4 rounded-xl border bg-muted/30 p-5"
          aria-label="Refund review"
        >
          <h3 className="font-semibold">
            Review {formatUsd(BigInt(review.amountMinor))} USD
          </h3>
          <p className="text-sm break-words">{review.reason}</p>
          <p className="text-xs text-muted-foreground">
            Offer expires {new Date(review.expiresAt).toLocaleString()}. This
            review ID is reused after refresh or retry.
          </p>
          {review.requiresConsent && (
            <div className="space-y-2 text-sm">
              <p>
                The buyer must accept this exact partial refund before you
                confirm it.
              </p>
              {consentLink ? (
                <label className="block">
                  Private buyer acceptance link
                  <Input
                    readOnly
                    value={consentLink}
                    onFocus={(e) => e.target.select()}
                    className="mt-2"
                  />
                </label>
              ) : (
                <p>
                  If the buyer has not accepted and the private link was lost,
                  prepare a new review. Links are displayed only once.
                </p>
              )}
            </div>
          )}
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={eligible}
              onChange={(e) => setEligible(e.target.checked)}
              className="mt-1"
            />
            I reviewed eligibility and the current return policy, and authorize
            this exact Sandbox refund.
          </label>
          <Button
            disabled={!eligible || busy}
            onClick={() => dialog.current?.showModal()}
          >
            Confirm refund…
          </Button>
        </section>
      )}
      <dialog
        ref={dialog}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border bg-card p-6 text-foreground shadow-xl backdrop:bg-black/40"
        aria-labelledby="refund-confirm-title"
      >
        <h2 id="refund-confirm-title" className="text-xl font-semibold">
          Send this Sandbox refund?
        </h2>
        <p className="my-5 text-sm">
          {review && formatUsd(BigInt(review.amountMinor))} USD will be
          submitted to PayPal. The result stays pending until verified. This
          action cannot be undone here.
        </p>
        <div className="flex gap-3">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => dialog.current?.close()}
          >
            Go back
          </Button>
          <Button disabled={busy} onClick={() => void confirm()}>
            {busy ? "Verifying…" : "Send refund to PayPal"}
          </Button>
        </div>
      </dialog>
      {message && (
        <p role="status" className="rounded-lg border p-4 text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
export function PaymentAction({
  paymentId,
  action,
  label,
  retryOperationId,
}: {
  paymentId: string;
  action: "capture" | "reconcile";
  label: string;
  retryOperationId?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <div>
      <Button
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await paymentCommand(`/api/payments/${paymentId}`, {
              action,
              retryOperationId,
            });
            setMessage(
              "Provider records checked. See the verified status below.",
            );
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
            router.refresh();
          }
        }}
      >
        {busy ? "Checking PayPal…" : label}
      </Button>
      {message && (
        <p role="status" className="mt-2 text-xs">
          {message}
        </p>
      )}
    </div>
  );
}
export function NewCheckout({ productId }: { productId: string }) {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      onClick={() => {
        localStorage.removeItem(`returnwise-checkout:${productId}`);
        router.push("/checkout");
      }}
    >
      Start a separate purchase
    </Button>
  );
}
