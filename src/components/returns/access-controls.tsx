"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { paymentCommand } from "@/components/payments/api";
export function AccessControls({ orderId }: { orderId: string }) {
  const [link, setLink] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function run(action: "issue" | "revoke") {
    setBusy(true);
    setMessage("");
    try {
      const result = await paymentCommand<{ token?: string; days?: number }>(
        "/api/returns/access",
        { action, orderId },
      );
      setLink(
        result.token ? `${location.origin}/returns#token=${result.token}` : "",
      );
      setMessage(
        action === "issue"
          ? `Private access valid for ${result.days} day(s). Earlier links revoked. Share only with this order's customer.`
          : "Customer access revoked.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void run("issue")}>
          Create private link
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void run("revoke")}
        >
          Revoke access
        </Button>
      </div>
      {link && (
        <label className="block text-xs">
          Private customer link
          <Input
            className="mt-2"
            readOnly
            value={link}
            onFocus={(e) => e.target.select()}
          />
        </label>
      )}
      {message && (
        <p role="status" className="text-xs text-muted-foreground">
          {message}
        </p>
      )}
    </div>
  );
}
