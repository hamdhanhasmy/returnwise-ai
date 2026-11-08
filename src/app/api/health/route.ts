import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { parseEnvironment } from "@/lib/validation/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
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
        payments: "disabled",
        ai: "disabled",
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
