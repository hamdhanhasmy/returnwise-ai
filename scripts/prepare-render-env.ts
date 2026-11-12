import { readFile, writeFile } from "node:fs/promises";
import { parse } from "dotenv";
try {
  const local = parse(await readFile(".env")),
    runtime = parse(await readFile(".local/render-runtime.env"));
  const url = new URL(runtime.RENDER_DATABASE_URL!);
  if (
    url.username !== "returnwise_runtime" ||
    url.pathname !== "/returnwise_hosted" ||
    !local.SUPABASE_URL ||
    !local.SUPABASE_SECRET_KEY
  )
    throw Error("Verified private configuration required");
  const env: Record<string, string> = {
    NODE_VERSION: "24.16.0",
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    DATABASE_URL: url.toString(),
    PAYPAL_ENV: "sandbox",
    PUBLIC_DEMO_ENABLED: "true",
    EVIDENCE_STORAGE: "supabase",
    SUPABASE_URL: local.SUPABASE_URL,
    SUPABASE_SECRET_KEY: local.SUPABASE_SECRET_KEY,
    EVIDENCE_STORAGE_CAP_BYTES: "104857600",
    AI_ENABLED: "false",
    AI_SPENDING_CAP_USD: "0.25",
    AG_STUDIO_HOSTED_AUTHORIZED: "false",
  };
  for (const key of [
    "DEEPSEEK_API_KEY",
    "DEEPSEEK_BASE_URL",
    "DEEPSEEK_MODEL",
    "DEEPSEEK_IMAGE_DETAIL",
    "AI_MAX_OUTPUT_TOKENS",
    "PAYPAL_CLIENT_ID",
    "PAYPAL_CLIENT_SECRET",
    "PAYPAL_MERCHANT_ID",
  ])
    if (local[key]) env[key] = local[key];
  // No old webhook target, owner/test connection or unconfirmed public Studio entitlement.
  if (Object.values(env).some((v) => /[\r\n]/.test(v)))
    throw Error("Invalid multiline configuration");
  await writeFile(
    ".local/render-web.env",
    Object.entries(env)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join("\n") + "\n",
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      prepared: true,
      privateImportFile: ".local/render-web.env",
      variableNames: Object.keys(env),
      containsOwnerOrTestConnection: false,
      aiEnabled: false,
      publicStudioAuthorized: false,
      secretValuesPrinted: false,
    }),
  );
} catch {
  console.error(
    "Private Render import preparation failed; verify the initialized runtime/Supabase configuration. Values withheld.",
  );
  process.exitCode = 1;
}
