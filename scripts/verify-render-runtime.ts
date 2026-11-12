import { scriptDatabase } from "./database";
const db = scriptDatabase();
try {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    !url.hostname.endsWith(".render.com") ||
    url.pathname !== "/returnwise_hosted" ||
    url.username !== "returnwise_runtime"
  )
    throw Error("Restricted hosted runtime required");
  const [r] = await db.$queryRaw<
    {
      correctRole: boolean;
      timezone: string;
      canCreateSchema: boolean;
      canCreateTables: boolean;
      canDeletePayments: boolean;
      canTruncatePayments: boolean;
      canUpdateAudit: boolean;
      canReadMigrations: boolean;
    }[]
  >`SELECT current_user='returnwise_runtime' AS "correctRole", current_setting('TimeZone') AS timezone, has_database_privilege(current_database(),'CREATE') AS "canCreateSchema", has_schema_privilege('public','CREATE') AS "canCreateTables", has_table_privilege('public."Payment"','DELETE') AS "canDeletePayments", has_table_privilege('public."Payment"','TRUNCATE') AS "canTruncatePayments", has_table_privilege('public."AuditLog"','UPDATE') AS "canUpdateAudit", has_table_privilege('public._prisma_migrations','SELECT') AS "canReadMigrations"`;
  if (
    !r?.correctRole ||
    r.timezone !== "UTC" ||
    r.canCreateSchema ||
    r.canCreateTables ||
    r.canDeletePayments ||
    r.canTruncatePayments ||
    r.canUpdateAudit ||
    r.canReadMigrations
  )
    throw Error("Unexpected runtime privileges");
  console.log(
    JSON.stringify({
      runtimeVerified: true,
      ...r,
      merchantCount: await db.merchant.count(),
      hostedPayments: await db.payment.count(),
      hostedRefunds: await db.refundOperation.count(),
      readOnlyVerification: true,
    }),
  );
} catch {
  console.error(
    "Restricted hosted runtime verification failed; no privileges were changed or credentials printed.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
