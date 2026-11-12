"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  CONSENT_VERSION,
  PRIVACY_NOTICE,
  assessmentSchema,
} from "@/lib/ai/contracts";
import { Field, control, human } from "./form-parts";
type Photo = { id: string; width: number; height: number; expiresAt: string };
type Analysis = {
  id: string;
  status: string;
  evidenceRevision: number;
  result: unknown;
  errorCode: string | null;
  reviewedAt: string | null;
  model: string;
  attempts: {
    promptTokens: number | null;
    completionTokens: number | null;
    estimatedNano: string | null;
    costBasis: string;
    latencyMs: number | null;
  }[];
};
type PanelData = {
  consent: boolean;
  reviewRequired: boolean;
  editable?: boolean;
  enabled?: boolean;
  revision?: number;
  images: Photo[];
  analyses?: Analysis[];
  usage?: { estimatedNano: string | null };
  budget?: {
    spentNano: string;
    reservedNano: string;
    capNano: string;
    blocked: boolean;
  };
};
const dollars = (nano: string | null | undefined) => {
  const n = BigInt(nano ?? "0");
  return `$${n / 1000000000n}.${((n % 1000000000n) / 1000n).toString().padStart(6, "0")}`;
};
export function EvidencePanel({
  token,
  caseId,
  onChanged,
}: {
  token?: string;
  caseId?: string;
  onChanged?: () => Promise<void>;
}) {
  const router = useRouter(),
    merchant = !!caseId,
    path = merchant
      ? `/api/evidence/merchant/${caseId}`
      : "/api/evidence/customer";
  const [data, setData] = useState<PanelData | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [loaded, setLoaded] = useState(false),
    [photo, setPhoto] = useState<string | null>(null),
    [consent, setConsent] = useState(false);
  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo);
    },
    [photo],
  );
  async function command(body: unknown) {
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        result.error ??
          "Evidence request failed; human review remains available.",
      );
    return result;
  }
  async function refresh() {
    const next = (await command({ action: "view" })) as PanelData;
    setData(next);
    setConsent(next.consent);
    setLoaded(true);
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function change(body: unknown) {
    await command(body);
    await refresh();
    await onChanged?.();
    router.refresh();
  }
  async function upload(form: FormData) {
    const image = form.get("image");
    if (!(image instanceof File) || !image.size)
      throw new Error("Select a product image.");
    if (image.size > 5 * 1024 * 1024)
      throw new Error("Maximum image size is 5 MiB.");
    const response = await fetch(path, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": image.type,
        "X-Storage-Consent": form.has("storageConsent") ? "true" : "false",
      },
      body: image,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    await refresh();
    await onChanged?.();
    router.refresh();
  }
  async function openImage(id: string, inference = false) {
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(
        merchant
          ? { action: "image", imageId: id, inference }
          : { action: "image", id, inference },
      ),
    });
    if (!response.ok) throw new Error("Image unavailable or access expired.");
    setPhoto(URL.createObjectURL(await response.blob()));
  }
  const latest = data?.analyses?.[0],
    assessment = assessmentSchema.safeParse(latest?.result);
  return (
    <section
      className="my-6 space-y-5 rounded-xl border bg-card p-6"
      aria-label={merchant ? "AI evidence review" : "Product evidence"}
    >
      <div>
        <p className="text-xs uppercase tracking-wide text-primary">
          Optional product evidence
        </p>
        <h2 className="mt-2 text-xl font-semibold">
          {merchant
            ? "Evidence observations, human judgment"
            : "Share a closer look"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Images and AI observations cannot prove hidden damage, legal
          entitlement or a refund amount. Human review is always required.
        </p>
      </div>
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => void run(refresh)}
      >
        {loaded ? "Refresh evidence" : "Open evidence workspace"}
      </Button>
      {data && (
        <>
          <div className="space-y-3">
            {data.images.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No current images. Description-only human review remains
                available.
              </p>
            )}
            {data.images.map((e, i) => (
              <div
                key={e.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
              >
                <span className="flex-1 text-xs">
                  Image {i + 1} · {e.width} × {e.height} · Access expires{" "}
                  {new Date(e.expiresAt).toLocaleDateString()}
                </span>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void run(() => openImage(e.id))}
                >
                  View image {i + 1}
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void run(() => openImage(e.id, true))}
                >
                  Preview AI image {i + 1}
                </Button>
                {!merchant && data.editable && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void run(() => change({ action: "remove", id: e.id }))
                    }
                  >
                    Remove image {i + 1}
                  </Button>
                )}
              </div>
            ))}
          </div>
          {photo && (
            <div className="space-y-2">
              {/* Authenticated POST response is a local blob, never a public image URL. */}
              <Image
                unoptimized
                width={1280}
                height={1280}
                src={photo}
                alt="Customer-provided product evidence; unverified"
                className="max-h-96 w-full rounded-lg border object-contain"
              />
              <Button variant="outline" onClick={() => setPhoto(null)}>
                Close image
              </Button>
            </div>
          )}
          {!merchant && data.editable && (
            <>
              <form
                action={(f) => run(() => upload(f))}
                className="space-y-4 rounded-xl bg-muted/40 p-4"
              >
                <Field label="Product photo">
                  <input
                    name="image"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    required
                    className={control}
                  />
                </Field>
                <p className="text-xs leading-6">
                  Static JPEG, PNG or WebP; at most 5 MiB each and three active
                  images. Use clear close-ups without faces, addresses or
                  documents. Metadata is removed; images are resized without
                  cropping. Inspect the preview to confirm damage remains
                  visible.
                </p>
                <label className="flex items-start gap-2 text-sm">
                  <input name="storageConsent" type="checkbox" required />I
                  authorize private storage (Supabase on the hosted demo) and
                  merchant review of this product image and have permission to
                  share it.
                </label>
                <Button disabled={busy || data.images.length >= 3}>
                  Upload private image
                </Button>
              </form>
              <div className="space-y-4 rounded-xl border p-4">
                <h3 className="font-semibold">
                  Your choice: third-party AI analysis
                </h3>
                <p className="text-xs leading-6">{PRIVACY_NOTICE}</p>
                <a
                  href="/privacy/evidence"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-primary underline"
                >
                  Evidence privacy details
                </a>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  I consent to sending this description and these images to
                  DeepSeek.
                </label>
                <Button
                  disabled={busy}
                  variant="outline"
                  onClick={() =>
                    void run(() =>
                      change({
                        action: "consent",
                        enabled: consent,
                        noticeVersion: CONSENT_VERSION,
                      }),
                    )
                  }
                >
                  Save AI consent choice
                </Button>
                <p className="text-xs">
                  Current permission:{" "}
                  {data.consent ? "Granted" : "Not granted — human review only"}
                  . Saving does not trigger a request.
                </p>
              </div>
            </>
          )}
          {merchant && (
            <>
              <div className="rounded-lg bg-muted/40 p-4 text-xs leading-6">
                <p>
                  DeepSeek Flash ·{" "}
                  {data.enabled ? "Configured" : "Disabled or missing key"} ·
                  Customer consent: {data.consent ? "granted" : "not granted"}
                </p>
                <p>
                  Your merchant’s estimated evidence spend:{" "}
                  {dollars(data.budget?.spentNano)} + held:{" "}
                  {dollars(data.budget?.reservedNano)}. Shared application cap:{" "}
                  {dollars(data.budget?.capNano)}.
                </p>
                <p>
                  Conservative peak-price estimates; provider billing may be
                  lower. Repeated unchanged evidence uses the existing result.
                  Uncertain attempts are not automatically repeated.
                </p>
              </div>
              <Button
                disabled={
                  busy ||
                  !data.editable ||
                  !data.enabled ||
                  !data.consent ||
                  !data.images.length ||
                  data.budget?.blocked
                }
                onClick={() => void run(() => change({ action: "analyze" }))}
              >
                {busy ? "Working…" : "Analyze current evidence"}
              </Button>
              {!data.editable && (
                <p className="text-sm text-muted-foreground">
                  Evidence is read-only after merchant approval or case closure.
                  The recorded assessment remains available for review.
                </p>
              )}
              {latest && (
                <article className="space-y-4 rounded-xl border p-5">
                  <h3 className="font-semibold">
                    AI assessment · {human(latest.status)}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {latest.model} · evidence revision {latest.evidenceRevision}
                    {latest.evidenceRevision !== data.revision
                      ? " — historical, evidence has changed"
                      : ""}
                  </p>
                  {latest.errorCode && (
                    <p role="status" className="text-sm">
                      {latest.errorCode}: analysis unavailable or unverified.
                      Use documented human review.
                    </p>
                  )}
                  {latest.status === "RUNNING" && (
                    <p className="text-sm">
                      In progress or awaiting recovery. Refresh evidence; after
                      two minutes use human review if the process was
                      interrupted. Reserved costs remain held.
                    </p>
                  )}
                  {assessment.success && (
                    <>
                      <p className="text-sm leading-6">
                        {assessment.data.caseSummary}
                      </p>
                      <p className="text-sm">
                        Claim support: {assessment.data.claimSupport} ·
                        Uncertainty: {assessment.data.uncertainty}
                      </p>
                      {[
                        [
                          "Visible observations",
                          assessment.data.visibleObservations,
                        ],
                        ["Limitations", assessment.data.evidenceLimitations],
                        [
                          "Questions for human review",
                          assessment.data.possiblePolicyQuestions,
                        ],
                      ].map(([label, items]) => (
                        <div key={String(label)}>
                          <h4 className="text-sm font-semibold">
                            {String(label)}
                          </h4>
                          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-muted-foreground">
                            {(items as string[]).map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                      {assessment.data.injectionSuspected && (
                        <p className="text-sm">
                          Potential instruction injection detected in untrusted
                          evidence.
                        </p>
                      )}
                    </>
                  )}
                  {latest.attempts.map((a, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      Attempt {i + 1}: {a.promptTokens ?? "unknown"} input /{" "}
                      {a.completionTokens ?? "unknown"} output tokens ·{" "}
                      {dollars(a.estimatedNano)} estimated ·{" "}
                      {a.latencyMs ?? "unknown"} ms · {a.costBasis}
                    </p>
                  ))}
                </article>
              )}
              {data.editable && (
                <form
                  action={(f) =>
                    run(() =>
                      change({
                        action: "review",
                        revision: data.revision,
                        note: String(f.get("note") ?? ""),
                      }),
                    )
                  }
                  className="space-y-3"
                >
                  <Field label="Human evidence review note">
                    <textarea
                      className={control}
                      name="note"
                      minLength={10}
                      maxLength={1500}
                      required
                      rows={3}
                      placeholder="Record what you verified, uncertainty, and any reason to disregard the AI assessment."
                    />
                  </Field>
                  <p className="text-xs">
                    Recording review acknowledges the evidence and limitations.
                    It does not accept AI claims as facts, change policy or send
                    a refund. Re-evaluate policy separately before proposing a
                    remedy.
                  </p>
                  <Button disabled={busy} variant="outline">
                    Record human evidence review
                  </Button>
                  <p className="text-xs">
                    Review{" "}
                    {data.reviewRequired
                      ? "required before resolution"
                      : "recorded for current evidence"}
                    .
                  </p>
                </form>
              )}
            </>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="rounded-lg border p-3 text-sm">
          {error}
        </p>
      )}
    </section>
  );
}
