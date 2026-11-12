"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CostOption } from "@/lib/returns/engine";
import type { CaseCommand } from "@/server/services/returns";
import { Button } from "@/components/ui/button";
import { paymentCommand } from "@/components/payments/api";
import { Field, control, human } from "./form-parts";
import { formatUsd } from "@/lib/money";
export function CaseActions({
  id,
  version,
  status,
  options,
  modern,
  synthetic,
}: {
  id: string;
  version: number;
  status: string;
  options: CostOption[];
  modern: boolean;
  synthetic: boolean;
}) {
  const router = useRouter();
  const confirmation = useRef<HTMLDialogElement>(null);
  const [note, setNote] = useState(""),
    [rights, setRights] = useState(false),
    [resolution, setResolution] = useState(options[0]?.resolution),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function run(action: CaseCommand["action"]) {
    setBusy(true);
    setMessage("");
    try {
      await paymentCommand(`/api/returns/cases/${id}`, {
        action,
        version,
        note,
        resolution,
        rightsConfirmed: rights,
      });
      confirmation.current?.close();
      setMessage("Case updated. No payment was sent.");
      router.refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const terminal =
    ["APPROVED", "REJECTED", "CLOSED"].includes(status) ||
    status.startsWith("REFUND_");
  return (
    <section className="space-y-5 rounded-xl border bg-card p-6">
      <h2 className="text-lg font-semibold">Merchant review</h2>
      <p className="text-sm leading-6 text-muted-foreground">
        Review eligibility, mandatory rights and evidence independently. Record
        why you chose an alternative to the recommendation. Approval records a
        resolution only; PayPal is not called.
      </p>
      {status !== "CLOSED" && !status.startsWith("REFUND_") && (
        <>
          <Field label="Review note / customer-visible offer terms">
            <textarea
              className={control}
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              minLength={10}
              maxLength={1500}
              placeholder="Explain the remedy, any return requirements, and reasons for an override."
            />
          </Field>
          {modern && !terminal && (
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={rights}
                onChange={(e) => setRights(e.target.checked)}
              />
              I reviewed eligibility, mandatory rights and authorization for
              this exact remedy.
            </label>
          )}
          {modern && status === "EVALUATED" && options.length > 0 && (
            <Field label="Eligible resolution">
              <select
                className={control}
                value={resolution}
                onChange={(e) =>
                  setResolution(e.target.value as CostOption["resolution"])
                }
              >
                {options.map((o) => (
                  <option key={o.resolution} value={o.resolution}>
                    {human(o.resolution)} — {formatUsd(BigInt(o.refundMinor))}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="flex flex-wrap gap-3">
            {modern &&
              ["SUBMITTED", "MANUAL_REVIEW", "EVALUATED"].includes(status) && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void run("evaluate")}
                >
                  Evaluate policy and costs
                </Button>
              )}
            {modern && status === "EVALUATED" && options.length > 0 && (
              <Button
                disabled={busy || !rights || note.trim().length < 10}
                onClick={() => void run("propose")}
              >
                Propose selected resolution
              </Button>
            )}
            {modern && status === "RESOLUTION_PROPOSED" && (
              <Button
                disabled={busy || !rights || note.trim().length < 10}
                onClick={() => confirmation.current?.showModal()}
              >
                Review merchant approval
              </Button>
            )}
            {!terminal && (
              <Button
                variant="outline"
                disabled={busy || note.trim().length < 10}
                onClick={() => void run("manual-review")}
              >
                Mark for manual review
              </Button>
            )}
            {modern && ["EVALUATED", "MANUAL_REVIEW"].includes(status) && (
              <Button
                variant="outline"
                disabled={busy || note.trim().length < 10}
                onClick={() => void run("request-information")}
              >
                Request information
              </Button>
            )}
            {!terminal && status !== "PENDING" && (
              <Button
                variant="outline"
                disabled={busy || note.trim().length < 10}
                onClick={() => void run("reject")}
              >
                Reject with reason
              </Button>
            )}
            {(status === "REJECTED" ||
              (status === "APPROVED" && synthetic)) && (
              <Button
                variant="outline"
                disabled={busy || note.trim().length < 10}
                onClick={() => void run("close")}
              >
                Close case
              </Button>
            )}
          </div>
        </>
      )}
      <dialog
        ref={confirmation}
        aria-label="Confirm case approval"
        className="m-auto max-w-lg rounded-xl border-2 border-primary bg-card p-6 text-foreground backdrop:bg-black/40"
      >
        <h3 className="font-semibold">Record this exact resolution?</h3>
        <p className="my-3 text-sm">
          The current proposal and customer acceptance will be checked again.
          This action does not send a refund.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button disabled={busy} onClick={() => void run("approve")}>
            Record merchant approval
          </Button>
          <Button
            variant="outline"
            onClick={() => confirmation.current?.close()}
          >
            Cancel
          </Button>
        </div>
        {message && (
          <p role="alert" className="mt-4 text-sm">
            {message}
          </p>
        )}
      </dialog>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </section>
  );
}
