import { requirePrincipal } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { AnalyticsService } from "@/server/services/analytics";
import { IntelligenceDashboard } from "@/components/analytics/intelligence-dashboard";
import { digest } from "@/server/services/payment-rules";
import { hostedStudioEnabled } from "@/lib/deployment";
export default async function AnalyticsPage() {
  const p = await requirePrincipal();
  const initial = await new AnalyticsService(getDb()).snapshot(p);
  const workspace = digest(p.merchantId).slice(0, 16);
  return (
    <IntelligenceDashboard
      key={workspace}
      initial={initial}
      workspace={workspace}
      studioEnabled={hostedStudioEnabled()}
    />
  );
}
