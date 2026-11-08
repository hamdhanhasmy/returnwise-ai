"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      role="alert"
      className="mx-auto max-w-lg rounded-xl border bg-card p-8"
    >
      <h1 className="text-xl font-semibold">
        The workspace is temporarily unavailable.
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Check that PostgreSQL is running, the environment is configured, and
        migrations have been applied. No payment has been attempted.
      </p>
      <Button className="mt-5" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
