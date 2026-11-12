"use client";
import Script from "next/script";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { paymentCommand } from "./api";
type SDK = {
  createInstance(options: { clientId: string; components: string[] }): Promise<{
    findEligibleMethods(): Promise<{ isEligible(method: string): boolean }>;
    createPayPalOneTimePaymentSession(options: {
      onApprove(data: { orderId: string }): Promise<void>;
      onCancel(): void;
      onError(error: unknown): void;
    }): Promise<{
      start(
        options: { presentationMode: "auto" },
        order: Promise<{ orderId: string }>,
      ): Promise<void>;
    }>;
  }>;
};
declare global {
  interface Window {
    paypal?: SDK;
  }
}

export function Checkout({
  clientId,
  products,
}: {
  clientId: string;
  products: { id: string; name: string; price: string }[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(products[0]?.id ?? "");
  const [ready, setReady] = useState(false),
    [message, setMessage] = useState("Loading secure PayPal Sandbox checkout…");
  const mount = useRef<HTMLDivElement>(null),
    busy = useRef(false);
  useEffect(() => {
    if (!ready || !selected) return;
    let disposed = false;
    const container = mount.current;
    const run = async () => {
      const sdk = await window.paypal!.createInstance({
        clientId,
        components: ["paypal-payments"],
      });
      const eligibility = await sdk.findEligibleMethods();
      if (!eligibility.isEligible("paypal"))
        throw new Error(
          "PayPal is not eligible in this browser. Try a supported browser and a Sandbox buyer account.",
        );
      let current: { paymentId: string; orderId: string } | undefined;
      const session = await sdk.createPayPalOneTimePaymentSession({
        async onApprove(data) {
          if (!current || data.orderId !== current.orderId) {
            setMessage(
              "Approval did not match this checkout. Open Transactions to reconcile.",
            );
            return;
          }
          setMessage("Buyer approved. Verifying the capture with PayPal…");
          try {
            await paymentCommand(`/api/payments/${current.paymentId}`, {
              action: "capture",
            });
            router.push(`/transactions/${current.paymentId}`);
          } catch (error) {
            setMessage(
              error instanceof Error
                ? error.message
                : "Capture could not be verified",
            );
            busy.current = false;
          }
        },
        onCancel() {
          busy.current = false;
          setMessage(
            "Buyer closed checkout. No capture has been confirmed. The same checkout can be reopened.",
          );
        },
        onError() {
          busy.current = false;
          setMessage(
            "PayPal checkout could not finish. Check Transactions before trying again.",
          );
        },
      });
      if (disposed) return;
      const button = document.createElement("paypal-button");
      button.setAttribute("aria-label", "Pay with PayPal Sandbox");
      button.addEventListener("click", () => {
        if (busy.current) return;
        busy.current = true;
        setMessage("Opening PayPal Sandbox…");
        const create = async () => {
          const storageKey = `returnwise-checkout:${selected}`;
          const key = localStorage.getItem(storageKey) ?? crypto.randomUUID();
          localStorage.setItem(storageKey, key);
          const result = await paymentCommand<{
            paymentId: string;
            orderId: string;
            status: string;
          }>("/api/payments", { productId: selected, checkoutKey: key });
          current = result;
          if (result.status !== "AWAITING_APPROVAL") {
            router.push(`/transactions/${result.paymentId}`);
            throw new Error("Open the existing transaction to continue.");
          }
          return { orderId: result.orderId };
        };
        // Pass the promise immediately to preserve browser user activation for the popup.
        void session
          .start({ presentationMode: "auto" }, create())
          .catch((error) => {
            busy.current = false;
            setMessage(
              error instanceof Error ? error.message : "Checkout unavailable",
            );
          });
      });
      container?.replaceChildren(button);
      setMessage(
        "Ready. Use a separate PayPal Sandbox personal buyer account.",
      );
    };
    void run().catch((error) => {
      if (!disposed)
        setMessage(
          error instanceof Error ? error.message : "PayPal could not load",
        );
    });
    return () => {
      disposed = true;
      container?.replaceChildren();
    };
  }, [ready, selected, clientId, router]);
  return (
    <div className="space-y-5">
      <Script
        src="https://www.sandbox.paypal.com/web-sdk/v6/core"
        strategy="afterInteractive"
        onReady={() => setReady(true)}
        onError={() =>
          setMessage(
            "The PayPal script could not load. Check your network or browser restrictions.",
          )
        }
      />
      <label className="block text-sm font-medium" htmlFor="product">
        Fictional demo product
      </label>
      <select
        id="product"
        className="w-full rounded-lg border bg-background p-3"
        value={selected}
        onChange={(e) => {
          if (!busy.current) setSelected(e.target.value);
        }}
      >
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} · {p.price} USD
          </option>
        ))}
      </select>
      <div className="rounded-xl border bg-muted/30 p-5">
        <p className="text-xs text-muted-foreground">
          Persisted price · one item · no shipping
        </p>
        <p className="mt-2 text-3xl font-semibold">
          {products.find((p) => p.id === selected)?.price}{" "}
          <span className="text-sm">USD</span>
        </p>
      </div>
      <div ref={mount} className="min-h-12 max-w-sm" />
      <p role="status" className="text-sm text-muted-foreground">
        {message}
      </p>
      <p className="text-xs text-muted-foreground">
        Refreshes reuse this checkout. Start another purchase from its
        transaction detail after reviewing the outcome.
      </p>
      <Link
        href="/transactions"
        className="text-sm font-semibold text-primary underline"
      >
        Open transactions and recovery
      </Link>
    </div>
  );
}
