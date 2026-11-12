import { IntelligenceDashboard } from "@/components/analytics/intelligence-dashboard";
import { publicAnalytics } from "@/lib/demo/analytics";
import { hostedStudioEnabled } from "@/lib/deployment";
export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const table = (await searchParams).view === "table";
  return (
    <IntelligenceDashboard
      initial={publicAnalytics()}
      workspace="public-demo"
      endpoint="/api/demo/analytics"
      caseBase="/demo/cases"
      publicDemo
      studioEnabled={!table && hostedStudioEnabled()}
    />
  );
}
