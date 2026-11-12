import { Brand } from "@/components/brand";
import { CustomerPortal } from "@/components/returns/customer-portal";
export default function ReturnsPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <Brand />
      <div className="mt-10 rounded-2xl border bg-card p-6 sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          Customer return portal
        </p>
        <h1 className="mt-3 mb-8 text-3xl font-semibold tracking-tight">
          We’re making room for your story.
        </h1>
        <CustomerPortal />
      </div>
    </main>
  );
}
