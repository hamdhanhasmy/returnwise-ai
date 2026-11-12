"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { paymentCommand } from "@/components/payments/api";
import { formatUsd } from "@/lib/money";
import { human, control } from "./form-parts";
type Props = {
  caseId: string;
  version: number;
  status: string;
  synthetic: boolean;
  received: boolean;
  proposal: {
    id: string;
    termsHash: string;
    resolution: string;
    amountMinor: string;
    currency: string;
    status: string;
    requiresConsent: boolean;
    respondedAt: string | null;
    explanation: string;
  } | null;
  refund: {
    status: string;
    providerStatus: string | null;
    providerId: string | null;
    verifiedAt: string | null;
    canReplay: boolean;
  } | null;
};
export function CaseRefundPanel(p: Props) {
  const router = useRouter(),
    dialog = useRef<HTMLDialogElement>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [note, setNote] = useState("");
  async function run(body: unknown) {
    setBusy(true);
    setMessage("");
    try {
      await paymentCommand(`/api/returns/cases/${p.caseId}/refund`, body);
      dialog.current?.close();
      setMessage(
        "Provider state refreshed. Only a verified completed refund closes the case.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
      router.refresh();
    }
  }
  const proposal = p.proposal,
    physical = proposal?.resolution === "FULL_REFUND_RETURN";
  return (
    <section
      className="my-6 space-y-4 rounded-xl border bg-card p-6"
      aria-label="Case payment resolution"
    >
      <h2 className="text-lg font-semibold">
        Resolution & PayPal Sandbox refund
      </h2>
      {p.synthetic ? (
        <p className="text-sm">
          Synthetic scenario — no provider payment exists and no refund can be
          sent.
        </p>
      ) : (
        <>
          <p className="text-sm">
            A separate final merchant confirmation sends the exact approved
            remedy. AI observations and customer acceptance alone never send
            money.
          </p>
          {proposal ? (
            <div className="rounded-lg bg-muted/40 p-4 text-sm space-y-2">
              <p>
                {human(proposal.resolution)} ·{" "}
                <strong>
                  {formatUsd(BigInt(proposal.amountMinor))} {proposal.currency}
                </strong>
              </p>
              <p>{proposal.explanation}</p>
              <p>
                Exact offer: {proposal.id.slice(0, 8)} ·{" "}
                {human(proposal.status)}
              </p>
              <p>
                Customer acceptance:{" "}
                {proposal.requiresConsent
                  ? proposal.status === "DECLINED"
                    ? "Declined — this proposal cannot be executed"
                    : proposal.respondedAt
                      ? "Recorded for these exact terms"
                      : "Required before approval"
                  : "Not required for this full-refund remedy"}
              </p>
              {physical && (
                <p>
                  Return receipt and inspection:{" "}
                  {p.received
                    ? "Confirmed by merchant"
                    : "Required before payment"}
                </p>
              )}
            </div>
          ) : (
            <p>
              Evaluate policy, propose a remedy and record merchant approval
              first.
            </p>
          )}
          {p.status === "APPROVED" && physical && !p.received && (
            <div className="space-y-3">
              <label className="block text-sm">
                Receipt and inspection record
                <textarea
                  className={control}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={1500}
                  placeholder="Document the actual item received and inspection."
                />
              </label>
              <Button
                disabled={busy || note.trim().length < 10}
                onClick={() =>
                  void run({ action: "receipt", version: p.version, note })
                }
              >
                Confirm physical return received and inspected
              </Button>
            </div>
          )}
          {proposal &&
            ["APPROVED", "REFUND_AUTHORIZED"].includes(p.status) &&
            (!physical || p.received) &&
            !p.refund && (
              <>
                <label className="flex gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  I authorize this exact Sandbox refund and confirm eligibility,
                  policy, evidence review and any required receipt.
                </label>
                <Button
                  disabled={busy || !confirmed}
                  onClick={() => dialog.current?.showModal()}
                >
                  Review final PayPal refund
                </Button>
              </>
            )}
          {p.refund && (
            <div className="space-y-2 text-sm" role="status">
              <p>
                Refund operation: <strong>{human(p.refund.status)}</strong>
              </p>
              <p>
                Verified provider status:{" "}
                {p.refund.providerStatus ?? "Not yet verified"}
              </p>
              {p.refund.providerId && (
                <p className="break-all">
                  PayPal refund: {p.refund.providerId}
                </p>
              )}
              <p>
                {p.refund.verifiedAt
                  ? `Last provider verification: ${p.refund.verifiedAt}`
                  : "Pending verification. Do not create another refund."}
              </p>
            </div>
          )}
          {(p.refund || p.status === "REFUND_AUTHORIZED") && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void run({ action: "reconcile", retry: false })}
            >
              Reconcile existing refund
            </Button>
          )}
          {p.refund?.canReplay && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => dialog.current?.showModal()}
            >
              Review recovery of original request
            </Button>
          )}
        </>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      <dialog
        ref={dialog}
        aria-label="Confirm exact PayPal case refund"
        className="m-auto max-w-lg rounded-xl border-2 border-primary bg-card p-6 text-foreground backdrop:bg-black/40"
      >
        <h3 className="font-semibold">
          {p.refund?.canReplay
            ? "Recover the original request"
            : "Send this exact Sandbox refund"}
          ?
        </h3>
        <p className="my-4">
          {proposal && (
            <>
              {human(proposal.resolution)} —{" "}
              <strong>
                {formatUsd(BigInt(proposal.amountMinor))} {proposal.currency}
              </strong>
              . {proposal.explanation}
            </>
          )}
        </p>
        <p className="mb-4 text-sm">
          {p.refund?.canReplay
            ? "Reconciliation runs first. Any replay uses the original immutable payload and PayPal request ID; no new operation is created."
            : "The server rechecks the case, acceptance, receipt, capture and remaining balance before sending."}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            disabled={busy}
            onClick={() =>
              void run(
                p.refund?.canReplay
                  ? { action: "reconcile", retry: true }
                  : {
                      action: "execute",
                      version: p.version,
                      proposalId: proposal!.id,
                      termsHash: proposal!.termsHash,
                      confirmed: true,
                      eligibilityConfirmed: confirmed,
                    },
              )
            }
          >
            {busy
              ? "Verifying…"
              : p.refund?.canReplay
                ? "Recover original request"
                : "Send authorized refund to PayPal"}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => dialog.current?.close()}
          >
            Cancel
          </Button>
        </div>
        {message && (
          <p role="alert" className="mt-3 text-sm">
            {message}
          </p>
        )}
      </dialog>
    </section>
  );
}
