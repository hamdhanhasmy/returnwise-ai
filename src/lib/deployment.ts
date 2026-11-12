import { parseEnvironment } from "./validation/env";
import { storageConfig } from "./evidence/config";
export function hostedStudioEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  // Local development retains the existing vendor-supported evaluation experience.
  if (env.RENDER !== "true") return true;
  return (
    env.AG_STUDIO_HOSTED_AUTHORIZED === "true" &&
    !!env.NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY
  );
}
export function validateRenderEnvironment(
  env: Record<string, string | undefined>,
) {
  const c = parseEnvironment({
    ...env,
    APP_BASE_URL: env.APP_BASE_URL || env.RENDER_EXTERNAL_URL,
  });
  if (!c.DATABASE_URL || !c.APP_BASE_URL.startsWith("https://"))
    throw Error("Hosted DATABASE_URL and HTTPS APP_BASE_URL are required");
  if (
    env.RENDER_EXTERNAL_URL &&
    new URL(c.APP_BASE_URL).origin !== new URL(env.RENDER_EXTERNAL_URL).origin
  )
    throw Error("APP_BASE_URL must match the assigned Render HTTPS origin");
  if (storageConfig(env).provider !== "supabase")
    throw Error("Hosted evidence requires private Supabase storage");
  if (env.TEST_DATABASE_URL)
    throw Error("Do not configure a test database in the hosted web service");
  if (env.DATABASE_MIGRATION_URL)
    throw Error(
      "Keep migration-owner credentials on the operator machine, not the hosted runtime",
    );
  if (new URL(c.DATABASE_URL).username !== "returnwise_runtime")
    throw Error(
      "Hosted web service requires the dedicated non-owner returnwise_runtime connection",
    );
  const port = Number(env.PORT ?? "10000");
  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    [18012, 18013, 19099].includes(port)
  )
    throw Error("Invalid Render PORT");
  return { port, origin: c.APP_BASE_URL };
}
