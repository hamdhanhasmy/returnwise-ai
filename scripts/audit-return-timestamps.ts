import { scriptDatabase } from "./database";
// Read-only inventory. Never infer or rewrite historical timestamps from a round trip.
const db = scriptDatabase();
try {
  const report = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const session =
      await tx.$queryRaw`SELECT current_setting('TimeZone') AS timezone, now() AS instant`;
    const orders =
      await tx.$queryRaw`SELECT origin, "timingProvenance", count(*)::int AS count FROM "Order" GROUP BY origin,"timingProvenance"`;
    const cases =
      await tx.$queryRaw`SELECT "workflowVersion", count(*)::int AS count, count("submittedAt")::int AS "explicitSubmissionInstants" FROM "ReturnCase" GROUP BY "workflowVersion"`;
    const payments =
      await tx.$queryRaw`SELECT right("paypalCaptureId",6) AS "captureSuffix", status, "captureAmountMinor"::text AS "capturedMinor", "captureCompletedAt", "createdAt" FROM "Payment" WHERE "paypalCaptureId" IS NOT NULL`;
    const refunds =
      await tx.$queryRaw`SELECT right("paypalRefundId",6) AS "refundSuffix", "providerStatus", "amountMinor"::text AS "amountMinor", "providerUpdatedAt", "verifiedAt" FROM "ProviderRefund"`;
    const webhooks =
      await tx.$queryRaw`SELECT status,count(*)::int AS count FROM "WebhookEvent" GROUP BY status`;
    const demonstrations=await tx.$queryRaw`SELECT o."publicOrderNumber", c.status, c.recommendation FROM "ReturnCase" c JOIN "Order" o ON o.id=c."orderId" WHERE o."publicOrderNumber" LIKE 'RW-DEMO-%' ORDER BY o."publicOrderNumber"`;
    return { session, orders, cases, payments, refunds, webhooks, demonstrations };
  });
  console.log(JSON.stringify(report, null, 2));
} catch {
  console.error(
    "Read-only timestamp audit unavailable; check connectivity and applied migrations. No records changed.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
