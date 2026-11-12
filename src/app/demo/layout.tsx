import Link from "next/link";
import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import { publicDemoEnabled, published } from "@/lib/demo/analytics";
export const dynamic = "force-dynamic";
export default function DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!publicDemoEnabled()) notFound();
  return (
    <div className="min-h-screen bg-[#f7f8f4]">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5">
          <Link href="/demo">
            <Brand />
          </Link>
          <nav className="flex gap-5 text-sm">
            <Link href="/demo">Judge exploration</Link>
            <Link href="/demo?view=table">Table view</Link>
            <Link href="/login">Authorized merchant sign-in</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-7 sm:px-8">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6">
          <strong>Public read-only demo · Sandbox only.</strong>{" "}
          {published.provenance} Published{" "}
          {new Date(published.publishedAt).toISOString().slice(0, 10)}. Time
          filters are relative to this snapshot. No new AI calls, uploads,
          purchases, refunds or account access are available here.
        </div>
        {children}
      </main>
    </div>
  );
}
