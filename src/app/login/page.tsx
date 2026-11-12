import { ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { LoginForm } from "@/components/login-form";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const invalid = (await searchParams).error === "invalid";
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-[#284b38] p-12 text-white lg:flex">
        <Brand inverse />
        <div className="relative z-10 max-w-lg">
          <p className="mb-5 text-[10px] tracking-[0.2em] text-[#bfd0b4] uppercase">
            A little more care goes a long way
          </p>
          <h1 className="text-5xl leading-[1.12] font-medium tracking-[-0.04em]">
            Good returns start
            <br />
            with understanding.
          </h1>
          <p className="mt-6 max-w-sm text-sm leading-7 text-[#c6d4c0]">
            A thoughtful space for merchants to bring together the evidence, the
            economics, and the human decision.
          </p>
        </div>
        <p className="text-xs text-[#bfd0b4]">
          ReturnWise AI · Sandbox-only prototype
        </p>
        <div
          aria-hidden="true"
          className="absolute -right-35 -bottom-30 size-100 rounded-full border-60 border-white/5"
        />
      </section>
      <section className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <div className="mb-12 lg:hidden">
            <Brand />
          </div>
          <p className="mb-2 text-[10px] font-semibold tracking-widest text-primary uppercase">
            Merchant access
          </p>
          <h2 className="text-3xl font-semibold tracking-tight">
            Welcome to your workspace.
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Use a one-time sign-in link issued by your local administrator.
          </p>
          {invalid && (
            <p
              role="alert"
              className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
            >
              This link is invalid, expired, or already used. Generate a new
              local sign-in link.
            </p>
          )}
          {process.env.PUBLIC_DEMO_ENABLED === "true" && (
            <div className="my-6 rounded-xl border bg-card p-4">
              <p className="text-sm font-medium">Here to explore ReturnWise?</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Open the read-only judge dashboard. No account or sign-in link
                needed.
              </p>
              <Button asChild className="mt-4 w-full">
                <Link href="/demo">Try demo</Link>
              </Button>
            </div>
          )}
          <LoginForm />
          <div className="mt-8 rounded-lg border bg-card p-4">
            <p className="flex items-center gap-2 text-xs font-medium">
              <ShieldCheck className="size-4 text-primary" /> Setting up
              locally?
            </p>
            <p className="mt-2 text-[11px] leading-6 text-muted-foreground">
              After migrating and seeding the database, use{" "}
              <code className="rounded bg-muted px-1">
                npm run auth:link -- --email=… --merchant=…
              </code>
              . See the README for the exact command.
            </p>
          </div>
          <p className="mt-6 text-[10px] text-muted-foreground">
            Fictional products · PayPal Sandbox only · Human authorization
          </p>
        </div>
      </section>
    </main>
  );
}
