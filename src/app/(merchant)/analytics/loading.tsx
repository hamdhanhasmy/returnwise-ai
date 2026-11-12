export default function AnalyticsLoading() {
  return (
    <div role="status" className="space-y-5 p-6">
      <p className="text-sm text-muted-foreground">
        Preparing your return intelligence…
      </p>
      <div className="h-48 animate-pulse rounded-2xl bg-muted" />
      <div className="grid grid-cols-2 gap-4">
        <div className="h-32 animate-pulse rounded-xl bg-muted" />
        <div className="h-32 animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  );
}
