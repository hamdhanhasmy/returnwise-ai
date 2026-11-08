import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { consumeLoginToken, InvalidLoginError } from "@/server/services/auth";
import {
  configuredOrigin,
  isTrustedOrigin,
  readSmallForm,
} from "@/lib/validation/http";
import { SESSION_COOKIE, SESSION_SECONDS } from "@/lib/auth/tokens";
import { loginRateLimit } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const origin = configuredOrigin();
  if (!isTrustedOrigin(request, origin))
    return NextResponse.json({ error: "Untrusted origin" }, { status: 403 });
  if (!loginRateLimit.allow())
    return NextResponse.json(
      { error: "Too many sign-in attempts. Try again in a minute." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  let token: string;
  try {
    token = (await readSmallForm(request)).get("token") ?? "";
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }
  try {
    const session = await consumeLoginToken(getDb(), token);
    const response = NextResponse.redirect(new URL("/dashboard", origin), 303);
    response.cookies.set(SESSION_COOKIE, session, {
      httpOnly: true,
      secure: origin.startsWith("https:"),
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_SECONDS,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof InvalidLoginError)
      return NextResponse.redirect(
        new URL("/login?error=invalid", origin),
        303,
      );
    return NextResponse.json(
      { error: "Sign-in unavailable. Check database configuration." },
      { status: 503 },
    );
  }
}
