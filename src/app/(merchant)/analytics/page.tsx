import { PageHeading } from "@/components/page-heading";
import { FeaturePlaceholder } from "@/components/feature-placeholder";
export default function AnalyticsPage() {
  return (
    <>
      <PageHeading
        eyebrow="Analytics"
        title="Understand the bigger picture."
        description="An upcoming view of case patterns, refund outcomes, and clearly labeled modeled economics."
      />
      <FeaturePlaceholder
        phase="Planned · Phase 6"
        title="Insights with AG Studio"
        description="Interactive analytics and its read-only assistant are not connected yet. There are no measured savings or payment outcomes to report."
      />
    </>
  );
}
