import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  ChartNoAxesCombined,
  ShieldCheck,
  ScanEye,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default function Home() {
  if (process.env.PUBLIC_DEMO_ENABLED !== "true") redirect("/dashboard");
  return (
    <main className="min-h-screen bg-[#f7f8f4]">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-6">
        <Brand />
        <Button asChild variant="outline">
          <Link href="/login">Merchant sign-in</Link>
        </Button>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-10 sm:py-20">
        <section className="rounded-2xl bg-[#284b38] px-6 py-12 text-white sm:p-16">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#c6d4c0]">
            Return intelligence · PayPal Sandbox
          </p>
          <h1 className="mt-5 max-w-3xl text-4xl font-medium leading-tight tracking-tight sm:text-6xl">
            A clearer path for every return.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-[#d8e3d4]">
            Explore how evidence observations, transparent return economics and
            human approval come together in a verified Sandbox refund journey.
          </p>
          <Button
            asChild
            className="mt-8 h-12 bg-white px-6 text-[#284b38] hover:bg-white/90"
          >
            <Link href="/demo">
              Try demo <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <p className="mt-4 text-sm text-[#d8e3d4]">
            No sign-in required. Read-only judge dashboard.
          </p>
        </section>
        <section
          aria-label="What you can explore"
          className="mt-6 grid gap-4 md:grid-cols-3"
        >
          {[
            {
              icon: ScanEye,
              title: "Understand the evidence",
              text: "Inspect a previously stored genuine DeepSeek assessment of a clearly labeled synthetic product image.",
            },
            {
              icon: ChartNoAxesCombined,
              title: "Compare return economics",
              text: "Explore fictional cases and configured cost estimates, including returnless and physical-return options.",
            },
            {
              icon: ShieldCheck,
              title: "Follow a verified outcome",
              text: "View sanitized history from a completed PayPal Sandbox capture and refund. Merchant actions stay protected.",
            },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-xl border bg-white p-6">
              <Icon aria-hidden="true" className="size-6 text-primary" />
              <h2 className="mt-4 text-lg font-semibold">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {text}
              </p>
            </div>
          ))}
        </section>
        <p className="mt-6 max-w-3xl text-sm leading-6 text-muted-foreground">
          This public demo uses reviewed fictional scenarios and published
          snapshots of previously verified local operations. It does not run new
          AI requests, upload customer evidence or execute payments. Modeled
          savings are estimates.
        </p>
      </div>
    </main>
  );
}
