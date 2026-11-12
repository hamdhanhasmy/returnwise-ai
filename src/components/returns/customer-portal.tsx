"use client";
import { useState } from "react";
import type { ReturnService } from "@/server/services/returns";
import { conditions, reasons } from "@/lib/returns/contracts";
import { formatUsd } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { paymentCommand } from "@/components/payments/api";
import { Field, control, human } from "./form-parts";
import { EvidencePanel } from "./evidence-panel";
type View = Awaited<ReturnType<ReturnService["customerView"]>>;
export function CustomerPortal() {
  const [token, setToken] = useState(""),
    [view, setView] = useState<View | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [privateLink, setPrivateLink] = useState("");
  async function refresh(raw: string) {
    const data = await paymentCommand<View>("/api/returns/customer", {
      action: "view",
      token: raw,
    });
    setView(data);
  }
  async function open() {
    setBusy(true);
    setMessage("");
    try {
      const raw =
        token || new URLSearchParams(location.hash.slice(1)).get("token") || "";
      setToken(raw);
      history.replaceState(null, "", location.pathname);
      await refresh(raw);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(form: FormData) {
    if (!view) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await paymentCommand<{ token: string }>(
        "/api/returns/customer",
        {
          action: "submit",
          token,
          submission: {
            productId: form.get("productId"),
            reason: form.get("reason"),
            condition: form.get("condition"),
            description: form.get("description"),
          },
        },
      );
      setToken(result.token);
      setPrivateLink(`${location.origin}/returns#token=${result.token}`);
      await refresh(result.token);
      setMessage(
        "Return request submitted. Save your private case-access link below. No refund has been sent.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function respond(
    action: "accept" | "decline" | "information",
    form?: FormData,
  ) {
    if (!view?.case) return;
    setBusy(true);
    setMessage("");
    try {
      await paymentCommand("/api/returns/customer", {
        action,
        token,
        version: view.case.version,
        ...(action === "information"
          ? { message: form?.get("message") }
          : {
              proposalId: view.proposal?.id,
              termsHash: view.proposal?.termsHash,
            }),
      });
      await refresh(token);
      setMessage(
        action === "accept"
          ? "You accepted the exact offer. Merchant approval is still required; no payment has been issued."
          : "Your response was recorded.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      {!view ? (
        <>
          <p className="text-sm leading-6 text-muted-foreground">
            Use the private link from your merchant, or enter its access token.
            We never look up an order by a public order number.
          </p>
          <Field label="Private access token">
            <input
              className={control}
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
            />
          </Field>
          <Button disabled={busy} onClick={() => void open()}>
            {busy ? "Opening…" : "Open my return"}
          </Button>
        </>
      ) : (
        <>
          <div className="rounded-xl bg-muted/50 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              {view.synthetic
                ? "Synthetic demonstration · no provider payment"
                : "PayPal Sandbox order"}
            </p>
            <h2 className="mt-3 text-2xl font-semibold">{view.productName}</h2>
            <p className="mt-2 text-sm">
              {view.merchantName} · {formatUsd(BigInt(view.totalMinor))}{" "}
              {view.currency}
            </p>
            <p className="mt-2 break-all text-xs text-muted-foreground">
              Order {view.orderNumber}
            </p>
          </div>
          {view.intake ? (
            <form action={submit} className="space-y-5">
              <Field label="Item to return">
                <select className={control} name="productId" required>
                  <option value={view.productId}>
                    {view.productName} · quantity 1
                  </option>
                </select>
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Return reason">
                  <select className={control} name="reason" required>
                    {reasons
                      .filter((r) => r !== "UNKNOWN")
                      .map((r) => (
                        <option key={r} value={r}>
                          {human(r)}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Product condition">
                  <select
                    className={control}
                    name="condition"
                    required
                    defaultValue="UNKNOWN"
                  >
                    {conditions.map((c) => (
                      <option key={c} value={c}>
                        {human(c)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Tell us what happened">
                <textarea
                  className={control}
                  name="description"
                  required
                  minLength={20}
                  maxLength={4000}
                  rows={5}
                  placeholder="Describe the issue and the condition when it arrived."
                />
              </Field>
              <p className="text-xs leading-6 text-muted-foreground">
                Your description is customer-reported evidence. After submission
                you can attach private product images and choose optional
                DeepSeek review. Submitting starts a review; it does not
                guarantee a refund.
              </p>
              <Button disabled={busy}>
                {busy ? "Submitting…" : "Submit return request"}
              </Button>
            </form>
          ) : (
            view.case && (
              <>
                <section aria-label="Case status" className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Case {view.case.id.slice(0, 8)}
                  </p>
                  <h3 className="text-xl font-semibold capitalize">
                    {human(view.case.status)}
                  </h3>
                  <p className="text-sm leading-6">{view.case.description}</p>
                  {view.refund && (
                    <div
                      role="status"
                      className="rounded-lg border p-4 text-sm space-y-2"
                    >
                      <p>
                        Refund: {formatUsd(BigInt(view.refund.amountMinor))}{" "}
                        {view.refund.currency}
                      </p>
                      <p>
                        Verified PayPal status:{" "}
                        <strong>
                          {view.refund.providerStatus ??
                            "Awaiting provider verification"}
                        </strong>
                      </p>
                      <p>
                        {view.refund.providerStatus === "COMPLETED"
                          ? "PayPal has confirmed this refund. Bank posting times can vary."
                          : "The refund is not confirmed completed. The merchant can reconcile the existing request."}
                      </p>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Merchant approval records a resolution only. Payment status
                    is separate.
                  </p>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void open()}
                  >
                    Refresh case status
                  </Button>
                </section>
                {view.proposal && (
                  <section
                    aria-label="Proposed resolution"
                    className="space-y-4 rounded-xl border p-5"
                  >
                    <h3 className="font-semibold capitalize">
                      {human(view.proposal.resolution)}
                    </h3>
                    <p className="text-3xl font-semibold">
                      {formatUsd(BigInt(view.proposal.amountMinor))}{" "}
                      {view.proposal.currency}
                    </p>
                    <p className="text-sm leading-6">
                      {view.proposal.explanation}
                    </p>
                    <p className="text-xs">
                      Offer status: {human(view.proposal.status)} · Expires{" "}
                      {new Date(view.proposal.expiresAt).toLocaleString()}
                    </p>
                    {view.proposal.requiresConsent &&
                      view.proposal.status === "PROPOSED" &&
                      view.case.status === "AWAITING_CUSTOMER" && (
                        <>
                          <p className="text-sm text-muted-foreground">
                            This optional partial remedy differs from a full
                            refund. Accept only if these exact terms match your
                            informed agreement. You can decline and ask the
                            merchant to review.
                          </p>
                          <div className="flex flex-wrap gap-3">
                            <Button
                              disabled={busy}
                              onClick={() => void respond("accept")}
                            >
                              Accept exact offer
                            </Button>
                            <Button
                              variant="outline"
                              disabled={busy}
                              onClick={() => void respond("decline")}
                            >
                              Decline offer
                            </Button>
                          </div>
                        </>
                      )}
                  </section>
                )}
                {view.case.status === "AWAITING_CUSTOMER" &&
                  view.proposal?.status !== "PROPOSED" && (
                    <form
                      action={(form) => respond("information", form)}
                      className="space-y-3"
                    >
                      <h3 className="font-semibold">
                        More information requested
                      </h3>
                      <p className="text-sm">
                        {String(
                          (
                            view.case.informationRequest as {
                              message?: string;
                            } | null
                          )?.message ?? "Please provide more detail.",
                        )}
                      </p>
                      <Field label="Additional information">
                        <textarea
                          className={control}
                          name="message"
                          required
                          minLength={10}
                          maxLength={1500}
                          rows={4}
                        />
                      </Field>
                      <Button disabled={busy}>Send information</Button>
                    </form>
                  )}
              </>
            )
          )}
        </>
      )}
      {view?.case && (
        <EvidencePanel token={token} onChanged={() => refresh(token)} />
      )}
      {message && (
        <p role="status" className="rounded-lg border bg-muted/30 p-4 text-sm">
          {message}
        </p>
      )}
      {privateLink && (
        <Field label="Save your private case-access link">
          <input
            className={control}
            value={privateLink}
            readOnly
            onFocus={(e) => e.target.select()}
          />
        </Field>
      )}
    </div>
  );
}
