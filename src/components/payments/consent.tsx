"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { paymentCommand } from "./api";
import { formatUsd } from "@/lib/money";
type Terms = {
  amountMinor: string;
  currency: string;
  reason: string;
  merchantName: string;
  orderNumber: string;
  accepted: boolean;
};
export function Consent() {
  const [token, setToken] = useState(""),
    [terms, setTerms] = useState<Terms | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function load(accept = false) {
    setBusy(true);
    try {
      const raw =
        token || new URLSearchParams(location.hash.slice(1)).get("token") || "";
      setToken(raw);
      history.replaceState(null, "", location.pathname);
      setTerms(
        await paymentCommand<Terms>("/api/refund-consent", {
          token: raw,
          accept,
        }),
      );
      setMessage(
        accept
          ? "You accepted these terms. The merchant must still authorize the refund; no payment completion is implied."
          : "",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      {!terms ? (
        <>
          <p className="text-sm text-muted-foreground">
            Use the private link provided by the merchant, or paste your
            acceptance token.
          </p>
          <Input
            aria-label="Acceptance token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <Button disabled={busy} onClick={() => void load()}>
            View exact refund terms
          </Button>
        </>
      ) : (
        <>
          <h2 className="text-xl font-semibold">{terms.merchantName}</h2>
          <p className="break-all text-xs">{terms.orderNumber}</p>
          <p className="text-3xl font-semibold">
            {formatUsd(BigInt(terms.amountMinor))} USD
          </p>
          <p>{terms.reason}</p>
          <p className="text-sm text-muted-foreground">
            This is a partial Sandbox refund for a fictional purchase. Accept
            only if this exact amount and reason match your agreement.
          </p>
          <Button
            disabled={busy || terms.accepted}
            onClick={() => void load(true)}
          >
            {terms.accepted ? "Terms accepted" : "I accept this partial refund"}
          </Button>
        </>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
