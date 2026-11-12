import { z } from "zod";

export function storageConfig(
  env: Record<string, string | undefined> = process.env,
) {
  const parsed = z
    .object({
      EVIDENCE_STORAGE: z.enum(["database", "supabase"]).default("database"),
      SUPABASE_URL: z.string().url().optional(),
      SUPABASE_SECRET_KEY: z.string().min(20).optional(),
      EVIDENCE_STORAGE_CAP_BYTES: z.coerce
        .number()
        .int()
        .min(1048576)
        .max(104857600)
        .default(104857600),
    })
    .safeParse({
      ...env,
      SUPABASE_URL: env.SUPABASE_URL || undefined,
      SUPABASE_SECRET_KEY: env.SUPABASE_SECRET_KEY || undefined,
    });
  if (!parsed.success)
    throw Error("Invalid private evidence storage configuration");
  const c = parsed.data;
  if (c.EVIDENCE_STORAGE === "supabase") {
    if (!c.SUPABASE_URL || !c.SUPABASE_SECRET_KEY)
      throw Error("Supabase private storage credentials are required");
    const u = new URL(c.SUPABASE_URL);
    if (
      u.protocol !== "https:" ||
      !/^[a-z0-9-]+\.supabase\.co$/.test(u.hostname) ||
      u.username ||
      u.password ||
      u.pathname !== "/" ||
      u.search ||
      u.hash ||
      u.port
    )
      throw Error("Expected the official HTTPS Supabase project origin");
  }
  return {
    provider: c.EVIDENCE_STORAGE,
    url: c.SUPABASE_URL,
    secret: c.SUPABASE_SECRET_KEY,
    capBytes: c.EVIDENCE_STORAGE_CAP_BYTES,
    bucket: "return-evidence" as const,
  };
}
