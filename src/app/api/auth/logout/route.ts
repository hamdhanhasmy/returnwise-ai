import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db/client";
import { SESSION_COOKIE } from "@/lib/auth/tokens";
import { revokeSession } from "@/server/services/auth";
import { configuredOrigin, isTrustedOrigin } from "@/lib/validation/http";

export async function POST(request: Request) {
  const origin = configuredOrigin();
  if (!isTrustedOrigin(request, origin))
    return NextResponse.json({ error: "Untrusted origin" }, { status: 403 });
  try {
    await revokeSession(getDb(), (await cookies()).get(SESSION_COOKIE)?.value);
  } catch {
    return NextResponse.json(
      { error: "Could not revoke session. Please retry." },
      { status: 503 },
    );
  }
  const response = NextResponse.redirect(new URL("/login", origin), 303);
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: origin.startsWith("https:"),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
