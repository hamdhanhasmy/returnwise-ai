import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

export const opaqueTokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
export function newToken() {
  return randomBytes(32).toString("hex");
}
export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export const SESSION_COOKIE = "rw_session";
export const SESSION_SECONDS = 8 * 60 * 60;
