"use client";
import { Button } from "@/components/ui/button";
export default function AnalyticsError({ reset }: { reset: () => void }) {
  return (
    <section role="alert" className="rounded-xl border bg-card p-8">
      <h1 className="text-xl font-semibold">
        Analytics is temporarily unavailable.
      </h1>
      <p className="my-4 text-sm text-muted-foreground">
        Check the database connection and your merchant session, then try again.
      </p>
      <Button onClick={reset}>Retry analytics</Button>
    </section>
  );
}
