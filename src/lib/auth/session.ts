import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { SESSION_COOKIE } from "@/lib/auth/tokens";
import { findPrincipal } from "@/server/services/auth";

export const requirePrincipal = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect("/login");
  const principal = await findPrincipal(getDb(), token);
  if (!principal) redirect("/login");
  return principal;
});
