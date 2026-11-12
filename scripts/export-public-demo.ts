import { writeFile } from "node:fs/promises";
import { scriptDatabase } from "./database";
import { AnalyticsService } from "../src/server/services/analytics";
import { assessmentSchema } from "../src/lib/ai/contracts";
import { economicSnapshotSchema } from "../src/lib/analytics/contracts";
const db = scriptDatabase();
let stage = "configuration";
try {
  if (!process.argv.includes("--write"))
    throw Error("Explicit --write required");
  const merchantId = "11111111-1111-4111-8111-111111111111";
  stage = "local merchant lookup";
  const user = await db.user.findFirstOrThrow({
    where: { merchantId, role: "ADMIN", disabledAt: null },
    include: { merchant: true },
  });
  const p = {
    userId: user.id,
    merchantId,
    role: user.role,
    email: user.email,
    merchantName: user.merchant.name,
  };
  const snapshot = await new AnalyticsService(db).snapshot(p);
  stage = "allowlisted case lookup";
  const specifications = [
    {
      sku: "RETURN-DEMO-A",
      slug: "damaged-bowl",
      claim:
        "Fictional damaged bowl; compare equivalent full remedies using configured estimates.",
    },
    {
      sku: "RETURN-DEMO-B",
      slug: "recoverable-lamp",
      claim:
        "Fictional high-value recoverable lamp; a physical return can preserve value.",
    },
    {
      sku: "RETURN-DEMO-C",
      slug: "manual-review",
      claim:
        "Fictional ambiguous request; missing evidence requires human assessment.",
    },
    {
      sku: "PHASE5-BOWL-USD5",
      slug: "verified-sandbox-bowl",
      claim:
        "Generated broken-bowl evidence used in the previously completed $5 Sandbox verification.",
    },
  ];
  const cases = [];
  for (const spec of specifications) {
    stage = `case ${spec.slug}`;
    const c = await db.returnCase.findFirstOrThrow({
      where: {
        merchantId,
        order: { product: { sku: spec.sku } },
        ...(spec.slug === "verified-sandbox-bowl"
          ? { id: "9f0144e9-daaf-487b-89a8-e83e77314401" }
          : {}),
      },
      include: {
        order: { include: { payment: { include: { providerRefunds: true } } } },
        evaluations: { orderBy: { caseVersion: "desc" }, take: 1 },
        analyses: {
          where: { status: "SUCCEEDED" },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
    const row = snapshot.rows.find((r) => r.id === c.id);
    if (!row) throw Error("Approved snapshot row missing");
    const payment = c.order.payment;
    const refundedMinor =
      payment?.providerRefunds
        .filter((r) => r.providerStatus === "COMPLETED")
        .reduce((sum, r) => sum + r.amountMinor, 0n) ?? 0n;
    if (
      spec.slug === "verified-sandbox-bowl" &&
      (!payment ||
        payment.ledgerState !== "RECONCILED" ||
        payment.captureAmountMinor !== 500n ||
        payment.currency !== "USD" ||
        refundedMinor !== 500n ||
        !payment.paypalCaptureId ||
        c.status !== "CLOSED")
    )
      throw Error("Verified historical case does not match published claim");
    const analysis = c.analyses[0];
    stage = `usage ${spec.slug}`;
    const usage = await db.analysisAttempt.aggregate({
      where: { merchantId, analysis: { caseId: c.id } },
      _count: { _all: true },
      _sum: { estimatedNano: true },
    });
    cases.push({
      slug: spec.slug,
      claim: spec.claim,
      analysisUsage: {
        requests: usage._count._all,
        estimatedNano: (usage._sum.estimatedNano ?? 0n).toString(),
      },
      metric: {
        ...row,
        id: spec.slug,
        reference:
          spec.slug === "verified-sandbox-bowl"
            ? "VERIFIED-5USD"
            : `SYNTHETIC-${spec.slug.toUpperCase()}`,
      },
      financial: c.evaluations[0]
        ? economicSnapshotSchema.parse(c.evaluations[0].result)
        : null,
      assessment: analysis
        ? {
            model: analysis.model,
            promptVersion: analysis.promptVersion,
            status: analysis.status,
            result: assessmentSchema.parse(analysis.result),
          }
        : null,
      payment: payment
        ? {
            currency: payment.currency,
            capturedMinor: payment.captureAmountMinor!.toString(),
            refundedMinor: refundedMinor.toString(),
            captureReference: `…${payment.paypalCaptureId!.slice(-6)}`,
            ledgerState: payment.ledgerState,
            refunds: payment.providerRefunds.map((r) => ({
              reference: `…${r.paypalRefundId.slice(-6)}`,
              status: r.providerStatus,
              amountMinor: r.amountMinor.toString(),
            })),
          }
        : null,
    });
  }
  const document = {
    version: 1,
    publishedAt: new Date().toISOString(),
    provenance:
      "Reviewed fictional cases and sanitized snapshot of previously verified LOCAL Sandbox records. No provider operation is executed by this public demo; hosted PostgreSQL is separate.",
    cases,
  };
  await writeFile(
    "src/lib/demo/published.json",
    JSON.stringify(document, null, 2) + "\n",
    "utf8",
  );
  console.log(
    "Published four allowlisted, sanitized demo cases; no customer descriptions, tokens, evidence references or full provider identifiers exported. Review the JSON before publishing.",
  );
} catch (e) {
  const code =
    e &&
    typeof e === "object" &&
    "code" in e &&
    typeof e.code === "string" &&
    /^[A-Z0-9_]{2,12}$/.test(e.code)
      ? e.code
      : "WITHHELD";
  console.error(JSON.stringify({ stage, code }));
  console.error(
    "Public export stopped. Use --write only with the existing verified local demo database. No provider call or database write occurred.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
