import { paymentActor, json, readJson } from "@/server/payment-http";
import { getDb } from "@/lib/db/client";
import { AnalyticsAgentService } from "@/server/services/analytics-agent";
import { analyticsFailure } from "@/server/analytics-http";
import { invariant, digest } from "@/server/services/payment-rules";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const p = await paymentActor(request);
    const expectedWorkspace = request.headers.get("X-ReturnWise-Workspace");
    invariant(
      !expectedWorkspace ||
        expectedWorkspace === digest(p.merchantId).slice(0, 16),
      "STALE_WORKSPACE",
      "Your merchant session changed. Reload before asking another question.",
      409,
    );
    return json(
      await new AnalyticsAgentService(getDb()).ask(p, await readJson(request)),
    );
  } catch (e) {
    return analyticsFailure(e);
  }
}
