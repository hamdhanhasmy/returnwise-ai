"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  conditions,
  reasons,
  type ReturnPolicy,
} from "@/lib/returns/contracts";
import { Button } from "@/components/ui/button";
import { paymentCommand } from "@/components/payments/api";
import { Field, control, human } from "./form-parts";
const decimal = (s: string | null) =>
  s === null
    ? ""
    : `${BigInt(s) / 100n}.${(BigInt(s) % 100n).toString().padStart(2, "0")}`;
function money(form: FormData, key: string) {
  const value = String(form.get(key) ?? "");
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw new Error(
      "Enter non-negative USD amounts with at most two decimal places.",
    );
  const [whole, cents = ""] = value.split(".");
  return (BigInt(whole!) * 100n + BigInt(cents.padEnd(2, "0"))).toString();
}
export function PolicyForm({
  policy,
  version,
  editable,
}: {
  policy: ReturnPolicy;
  version?: number;
  editable: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function save(form: FormData) {
    setBusy(true);
    setMessage("");
    try {
      const text = (key: string) => String(form.get(key) ?? "");
      const list = (key: string) =>
        text(key)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      const rules = {
        windowDays: Number(text("windowDays")),
        eligibleCategories: list("eligibleCategories"),
        excludedCategories: list("excludedCategories"),
        allowedReasons: form.getAll("allowedReasons"),
        manualConditions: form.getAll("manualConditions"),
        allowReturnless: form.has("allowReturnless"),
        allowPartial: form.has("allowPartial"),
        partialOfferMinor: money(form, "partialOfferMinor"),
        maxPartialMinor: money(form, "maxPartialMinor"),
        maxPartialBps: Number(text("maxPartialBps")),
        shippingResponsibility: text("shippingResponsibility"),
        shippingMinor: money(form, "shippingMinor"),
        handlingMinor: money(form, "handlingMinor"),
        disposalMinor: money(form, "disposalMinor"),
        keepProcessingMinor: money(form, "keepProcessingMinor"),
        recoveryMethod: text("recoveryMethod"),
        recoveryMinor: text("recoveryMinor")
          ? money(form, "recoveryMinor")
          : null,
        highValueMinor: money(form, "highValueMinor"),
        currency: "USD",
      };
      const result = await paymentCommand<{ version: number }>(
        "/api/returns/policy",
        rules,
      );
      setMessage(
        `Return policy version ${result.version} saved. Existing cases keep their original policy.`,
      );
      router.refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const moneyFields = [
    ["shippingMinor", "Return shipping estimate (USD)"],
    ["handlingMinor", "Inspection and handling (USD)"],
    ["disposalMinor", "Return disposal / processing (USD)"],
    ["keepProcessingMinor", "Unavoidable keep processing (USD)"],
    ["highValueMinor", "High-value review threshold (USD)"],
    ["partialOfferMinor", "Proposed partial offer (USD)"],
    ["maxPartialMinor", "Maximum discretionary partial (USD)"],
  ] as const;
  return (
    <form action={save} className="space-y-7">
      <div>
        <h2 className="text-lg font-semibold">
          Return policy {version ? `· v${version}` : "· not configured"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          New versions apply to new submissions. These settings cannot establish
          legal entitlement or override customer rights. Standalone PayPal
          review policies stay separate.
        </p>
      </div>
      <fieldset
        disabled={!editable || busy}
        className="space-y-6 disabled:opacity-70"
      >
        <legend className="sr-only">Merchant return-policy rules</legend>
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Standard return window (days)">
            <input
              className={control}
              name="windowDays"
              type="number"
              min="1"
              max="365"
              required
              defaultValue={policy.windowDays}
            />
          </Field>
          <Field label="Eligible categories (comma-separated)">
            <input
              className={control}
              name="eligibleCategories"
              required
              defaultValue={policy.eligibleCategories.join(", ")}
            />
          </Field>
          <Field label="Non-returnable categories (manual review)">
            <input
              className={control}
              name="excludedCategories"
              defaultValue={policy.excludedCategories.join(", ")}
            />
          </Field>
          <Field label="Return shipping responsibility">
            <select
              className={control}
              name="shippingResponsibility"
              defaultValue={policy.shippingResponsibility}
            >
              <option value="MERCHANT">
                Merchant — estimated cost included
              </option>
              <option value="CUSTOMER">
                Customer — requires rights review
              </option>
            </select>
          </Field>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <fieldset className="rounded-xl border p-4">
            <legend className="px-2 text-sm font-semibold">
              Allowed reasons
            </legend>
            <div className="space-y-2">
              {reasons.map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="allowedReasons"
                    value={r}
                    defaultChecked={policy.allowedReasons.includes(r)}
                  />
                  {human(r)}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="rounded-xl border p-4">
            <legend className="px-2 text-sm font-semibold">
              Conditions needing manual review
            </legend>
            <div className="space-y-2">
              {conditions.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="manualConditions"
                    value={c}
                    defaultChecked={policy.manualConditions.includes(c)}
                  />
                  {human(c)}
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Unknown condition and other/unknown reasons always require review.
            </p>
          </fieldset>
        </div>
        <h3 className="font-semibold">Configured estimates · USD</h3>
        <p className="text-sm text-muted-foreground">
          Enter known estimates explicitly. Zero means an assumed zero cost.
          Missing recovery routes to manual review; estimates are never observed
          savings.
        </p>
        <div className="grid gap-5 md:grid-cols-2">
          {moneyFields.map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                className={control}
                name={key}
                inputMode="decimal"
                required
                pattern="[0-9]+([.][0-9]{1,2})?"
                defaultValue={decimal(policy[key])}
              />
            </Field>
          ))}
          <Field label="Partial ceiling (basis points: 100 = 1%)">
            <input
              className={control}
              name="maxPartialBps"
              type="number"
              min="0"
              max="10000"
              required
              defaultValue={policy.maxPartialBps}
            />
          </Field>
          <Field label="Recovery estimate source">
            <select
              className={control}
              name="recoveryMethod"
              defaultValue={policy.recoveryMethod}
            >
              <option value="UNKNOWN">Unknown — manual review</option>
              <option value="PRODUCT_ESTIMATE">Stored product estimate</option>
              <option value="FIXED">Fixed policy estimate</option>
            </select>
          </Field>
          <Field label="Fixed recoverable value (USD, when selected)">
            <input
              className={control}
              name="recoveryMinor"
              inputMode="decimal"
              defaultValue={decimal(policy.recoveryMinor)}
            />
          </Field>
        </div>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="allowReturnless"
            defaultChecked={policy.allowReturnless}
          />
          Permit full refunds without physical return, subject to merchant
          eligibility review.
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="allowPartial"
            defaultChecked={policy.allowPartial}
          />
          Permit optional partial offers within both ceilings. Customer
          agreement is mandatory; partial offers never replace full-refund
          rights automatically.
        </label>
        {editable ? (
          <Button disabled={busy}>
            {busy ? "Saving…" : "Save new policy version"}
          </Button>
        ) : (
          <p className="text-sm">
            Administrator access is required to change policy.
          </p>
        )}
      </fieldset>
      {message && (
        <p role="status" className="rounded-lg border p-4 text-sm">
          {message}
        </p>
      )}
    </form>
  );
}
