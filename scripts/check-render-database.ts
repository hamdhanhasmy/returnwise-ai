import { renderOwnerUrl } from "./render-database";
import { scriptDatabase } from "./database";
let db: ReturnType<typeof scriptDatabase> | undefined;
try {
  const url = renderOwnerUrl();
  db = scriptDatabase(url.toString());
  const result = await db.$queryRaw<
    {
      expected: boolean;
      timezone: string;
      migrationsPresent: boolean;
      appPresent: boolean;
    }[]
  >`SELECT current_database()='returnwise_hosted' AS expected, current_setting('TimeZone') AS timezone, to_regclass('public._prisma_migrations') IS NOT NULL AS "migrationsPresent", to_regclass('public."Merchant"') IS NOT NULL AS "appPresent"`;
  if (!result[0]?.expected || result[0].timezone !== "UTC")
    throw Error("Unexpected hosted target");
  const roles = await db.$queryRaw<
    { runtimeRoleExists: boolean; ownerCanCreateRole: boolean }[]
  >`SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='returnwise_runtime') AS "runtimeRoleExists", (SELECT rolcreaterole FROM pg_roles WHERE rolname=current_user) AS "ownerCanCreateRole"`;
  console.log(
    JSON.stringify({
      hostedConnectionVerified: true,
      ...result[0],
      ...roles[0],
      merchantCount: result[0].appPresent ? await db.merchant.count() : null,
      readOnly: true,
    }),
  );
} catch {
  console.error(
    "Hosted read-only connection check failed. Verify private external owner URLs, dedicated returnwise_hosted name, TLS, availability and temporary operator IP allowlist; no credentials printed or data modified.",
  );
  process.exitCode = 1;
} finally {
  await db?.$disconnect();
}
