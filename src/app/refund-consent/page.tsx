import { Consent } from "@/components/payments/consent";
import { Brand } from "@/components/brand";
export default function RefundConsent() {
  return (
    <main className="mx-auto max-w-lg space-y-8 px-5 py-16">
      <Brand />
      <div className="rounded-xl border bg-card p-7">
        <p className="mb-2 text-xs font-semibold text-primary">
          PAYPAL SANDBOX
        </p>
        <h1 className="mb-6 text-2xl font-semibold">
          Your refund, on your terms.
        </h1>
        <Consent />
      </div>
    </main>
  );
}
