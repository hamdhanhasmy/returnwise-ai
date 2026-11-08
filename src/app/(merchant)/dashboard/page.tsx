import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CircleCheck,
  ClipboardCheck,
  Clock3,
  Layers3,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { requirePrincipal } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { merchantOverview } from "@/server/services/merchant";
import { PageHeading } from "@/components/page-heading";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CasesTable } from "@/components/cases-table";

export default async function Dashboard() {
  const principal = await requirePrincipal();
  const overview = await merchantOverview(getDb(), principal);
  const metrics = [
    {
      label: "Return cases",
      value: overview.caseCount.toString().padStart(2, "0"),
      detail: "Persisted demonstration cases",
      icon: Layers3,
    },
    {
      label: "Needs your review",
      value: overview.reviewCount.toString().padStart(2, "0"),
      detail: "A human decision comes first",
      icon: ClipboardCheck,
    },
    {
      label: "Illustrative orders",
      value: overview.orderCount.toString().padStart(2, "0"),
      detail: "Synthetic orders · USD",
      icon: Clock3,
    },
  ];
  return (
    <>
      <PageHeading
        eyebrow="Merchant overview"
        title="A clearer path for every return."
        description="Your cases, context, and next steps — together in one thoughtful workspace."
        action={
          <Button asChild>
            <Link href="/cases">
              Explore return cases <ArrowUpRight />
            </Link>
          </Button>
        }
      />
      <section
        aria-label="Workspace summary"
        className="mb-7 grid gap-4 md:grid-cols-3"
      >
        {metrics.map(({ label, value, detail, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{label}</span>
                <Icon className="size-4" aria-hidden="true" />
              </div>
              <p className="mt-5 text-[32px] leading-none font-semibold tracking-tight tabular-nums">
                {value}
              </p>
              <p className="mt-3 text-[10px] text-muted-foreground">{detail}</p>
            </CardContent>
          </Card>
        ))}
      </section>
      <div className="mb-7 grid gap-5 xl:grid-cols-[1.8fr_1fr]">
        <section className="relative flex min-h-52 flex-col justify-center overflow-hidden rounded-xl bg-[#e8eee2] px-7 py-7">
          <div className="max-w-md">
            <span className="mb-3 inline-flex items-center gap-1.5 rounded-md border border-[#ccd9c5] px-2 py-1 text-[10px] font-medium text-primary">
              <Sparkles className="size-3" /> A foundation for better returns
            </span>
            <h2 className="max-w-85 text-2xl leading-tight font-semibold tracking-tight">
              More context.
              <br />
              More considered decisions.
            </h2>
            <p className="mt-3 max-w-85 text-xs leading-5 text-[#52604e]">
              Start with the facts. Explore the seeded cases while payment
              execution and evidence analysis are being built.
            </p>
            <Link
              href="/cases"
              className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-primary"
            >
              Meet your first cases <ArrowRight className="size-3.5" />
            </Link>
          </div>
          <div
            aria-hidden="true"
            className="absolute -right-10 -bottom-12 hidden size-52 rounded-full border-32 border-[#d5e0cd] sm:block"
          />
        </section>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" />
              <CardTitle className="text-sm">Workspace readiness</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3.5 text-xs">
              <p className="flex items-center gap-2">
                <CircleCheck className="size-3.5 text-primary" />{" "}
                Database-backed cases{" "}
                <span className="ml-auto text-[10px] text-primary">Ready</span>
              </p>
              <p className="flex items-center gap-2">
                <CircleCheck className="size-3.5 text-primary" /> Merchant
                access control{" "}
                <span className="ml-auto text-[10px] text-primary">Ready</span>
              </p>
              <p className="flex items-center gap-2 text-muted-foreground">
                <span className="size-3.5 rounded-full border-2" /> PayPal
                sandbox operations{" "}
                <span className="ml-auto text-[10px]">Phase 2</span>
              </p>
              <p className="flex items-center gap-2 text-muted-foreground">
                <span className="size-3.5 rounded-full border-2" /> AI evidence
                extraction <span className="ml-auto text-[10px]">Later</span>
              </p>
            </div>
            <p className="mt-5 border-t pt-3 text-[10px] leading-4 text-muted-foreground">
              No payments have been captured or refunded by this application.
            </p>
          </CardContent>
        </Card>
      </div>
      <Card className="mb-6 overflow-hidden">
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm">Recent return cases</CardTitle>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Illustrative scenarios. Real database records.
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/cases">
              View all cases <ArrowRight />
            </Link>
          </Button>
        </CardHeader>
        <CasesTable cases={overview.latestCases} />
      </Card>
      <div className="flex items-start gap-3 rounded-lg border border-dashed px-4 py-3">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="text-[11px] leading-5 text-muted-foreground">
          <strong className="font-medium text-foreground">
            A safe place to start.
          </strong>{" "}
          All order values and return scenarios here are synthetic. Refund
          approval, policy decisions, and AI analysis are unavailable in this
          phase.
        </p>
      </div>
    </>
  );
}
