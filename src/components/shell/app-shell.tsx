import Link from "next/link";
import { ArrowUpRight, Check, LogOut, ShieldCheck } from "lucide-react";
import type { Principal } from "@/server/services/auth";
import { Brand } from "@/components/brand";
import { Navigation } from "./navigation";
import { Button } from "@/components/ui/button";

export function AppShell({
  principal,
  children,
}: {
  principal: Principal;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-primary focus:p-3 focus:text-white"
      >
        Skip to content
      </a>
      <aside className="border-b bg-card px-5 py-4 lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-60 lg:flex-col lg:overflow-y-auto lg:border-r lg:border-b-0 lg:px-5 lg:py-7">
        <Link
          href="/dashboard"
          aria-label="ReturnWise home"
          className="mb-5 inline-block lg:mb-9"
        >
          <Brand />
        </Link>
        <div className="mb-6 hidden items-center gap-3 rounded-lg border bg-background/60 p-3 lg:flex">
          <span className="flex size-8 items-center justify-center rounded-md bg-[#e8e5df] text-xs font-semibold">
            {principal.merchantName
              .split(" ")
              .map((part) => part[0])
              .slice(0, 2)
              .join("")}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold">
              {principal.merchantName}
            </span>
            <span className="text-[10px] text-muted-foreground">
              Merchant workspace
            </span>
          </span>
        </div>
        <p className="mb-2 hidden px-3 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground lg:block">
          WORKSPACE
        </p>
        <Navigation />
        <div className="mt-auto hidden pt-8 lg:block">
          <div className="rounded-xl border border-[#dce5dc] bg-[#f2f6f0] p-4">
            <ShieldCheck className="mb-2 size-5 text-primary" />
            <p className="text-xs font-semibold">Built for careful decisions</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Human review. Clear evidence. Every step accounted for.
            </p>
            <Link
              href="/settings"
              className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-primary"
            >
              Workspace details <ArrowUpRight className="size-3" />
            </Link>
          </div>
          <div className="mt-5 flex items-center gap-2 border-t pt-5">
            <span className="flex size-8 items-center justify-center rounded-full bg-[#ece9e2] text-xs font-semibold">
              {principal.email.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium">
                {principal.role === "ADMIN" ? "Administrator" : "Staff member"}
              </span>
              <span className="block truncate text-[10px] text-muted-foreground">
                {principal.email}
              </span>
            </span>
            <form action="/api/auth/logout" method="post">
              <Button variant="ghost" size="icon" aria-label="Sign out">
                <LogOut />
              </Button>
            </form>
          </div>
        </div>
      </aside>
      <div className="lg:pl-60">
        <header className="flex min-h-17 items-center justify-between gap-4 border-b bg-card/60 px-5 md:px-9">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="hidden sm:inline">Workspace</span>
            <span className="hidden sm:inline">/</span>
            <span className="font-medium text-foreground">
              {principal.merchantName}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-[10px] font-medium">
              <span className="size-1.5 rounded-full bg-amber-500" /> Sandbox
              only
            </span>
            <span className="hidden items-center gap-1 text-[11px] text-muted-foreground sm:flex">
              <Check className="size-3" /> Sandbox workspace
            </span>
            <form className="lg:hidden" action="/api/auth/logout" method="post">
              <Button variant="ghost" size="icon" aria-label="Sign out">
                <LogOut />
              </Button>
            </form>
          </div>
        </header>
        <main
          id="main"
          className="mx-auto max-w-360 px-5 py-8 md:px-9 md:py-10"
        >
          {children}
        </main>
        <footer className="mx-5 flex flex-wrap items-center justify-between gap-2 border-t py-5 text-[10px] text-muted-foreground md:mx-9">
          <span>ReturnWise AI · Thoughtful returns, clearer decisions.</span>
          <span>Fictional products / PayPal Sandbox only</span>
        </footer>
      </div>
    </div>
  );
}
