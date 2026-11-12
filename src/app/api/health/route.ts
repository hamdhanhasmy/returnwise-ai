import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { parseEnvironment } from "@/lib/validation/env";
import { paypalConfig } from "@/lib/payments/config";
import { aiConfig } from "@/lib/ai/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  let payments = "disabled";
  let ai = "disabled";
  try {
    const c = aiConfig();
    if (c.enabled && c.apiKey) ai = "deepseek-configured-not-probed";
  } catch {
    /* Fail closed on invalid AI configuration. */
  }
  try {
    paypalConfig();
    payments = "sandbox-configured-not-probed";
  } catch {
    /* Missing credentials keep payments disabled. */
  }
  try {
    const env = parseEnvironment(process.env);
    if (!env.DATABASE_URL)
      return NextResponse.json(
        {
          status: "degraded",
          database: "unconfigured",
          payments: "disabled",
          ai: "disabled",
        },
        { status: 503, headers },
      );
    await getDb().$queryRaw`SELECT 1`;
    return NextResponse.json(
      {
        status: "ok",
        database: "connected",
        payments,
        ai,
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      {
        status: "degraded",
        database: "unavailable",
        payments: "disabled",
        ai: "disabled",
      },
      { status: 503, headers },
    );
  }
}
