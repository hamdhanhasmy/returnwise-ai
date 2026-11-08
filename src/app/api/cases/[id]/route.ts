import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/tokens";
import { getDb } from "@/lib/db/client";
import { findPrincipal } from "@/server/services/auth";
import { getCase } from "@/server/services/merchant";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const principal = await findPrincipal(db, raw);
  if (!principal)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const record = await getCase(db, principal, (await context.params).id);
  if (!record)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(
    {
      id: record.id,
      status: record.status,
      description: record.description,
      orderNumber: record.order.publicOrderNumber,
      totalMinor: record.order.totalMinor.toString(),
      currency: record.order.currency,
      origin: record.order.origin,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
