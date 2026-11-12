import { cookies } from "next/headers";
import { getDb } from "@/lib/db/client";
import { SESSION_COOKIE } from "@/lib/auth/tokens";
import { findPrincipal } from "@/server/services/auth";
import { AnalyticsService } from "@/server/services/analytics";
import { json } from "@/server/payment-http";
import { analyticsFailure } from "@/server/analytics-http";
import { invariant } from "@/server/services/payment-rules";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const db = getDb(),
      p = await findPrincipal(db, (await cookies()).get(SESSION_COOKIE)?.value);
    invariant(p, "UNAUTHENTICATED", "Sign in to view analytics", 401);
    return json(
      await new AnalyticsService(db).snapshot(
        p,
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
  } catch (e) {
    return analyticsFailure(e);
  }
}
