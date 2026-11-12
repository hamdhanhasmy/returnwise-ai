import { mkdir, writeFile } from "node:fs/promises";
import { scriptDatabase } from "./database";
import { demoIds } from "../prisma/fixtures";
import { ReturnService } from "../src/server/services/returns";
import { EvidenceService } from "../src/server/services/evidence";
import { aiConfig } from "../src/lib/ai/config";
import { CONSENT_VERSION, assessmentSchema } from "../src/lib/ai/contracts";
import { evidenceScenarios, syntheticImage } from "../tests/fixtures/evidence";
const live = process.argv.includes("--live"),
  limit = Number(
    process.argv.find((s) => s.startsWith("--limit="))?.split("=")[1] ?? 20,
  );
if (!live || !Number.isInteger(limit) || limit < 1 || limit > 20)
  throw new Error(
    "Use --live --limit=1..20 to explicitly run funded DeepSeek requests with synthetic images only.",
  );
const config = aiConfig();
if (!config.enabled || !config.apiKey)
  throw new Error(
    "Privately configure DEEPSEEK_API_KEY and AI_ENABLED=true; no requests sent.",
  );
const db = scriptDatabase();
try {
  const user = await db.user.findUniqueOrThrow({
      where: { id: demoIds.admin },
    }),
    p = {
      merchantId: user.merchantId,
      userId: user.id,
      email: user.email,
      role: user.role,
      merchantName: "Oak & Loom",
    },
    returns = new ReturnService(db),
    service = new EvidenceService(db, config);
  const reports = [];
  for (const scenario of evidenceScenarios.slice(0, limit)) {
    const number = `AI-EVAL-V1-${scenario.id}`;
    let order = await db.order.findFirst({
      where: { merchantId: p.merchantId, publicOrderNumber: number },
    });
    if (!order) {
      const product = await db.product.upsert({
        where: {
          merchantId_sku: {
            merchantId: p.merchantId,
            sku: "AI-EVAL-SYNTHETIC",
          },
        },
        update: {},
        create: {
          merchantId: p.merchantId,
          sku: "AI-EVAL-SYNTHETIC",
          name: "Synthetic AI evaluation product",
          category: "Home",
          currency: "USD",
          saleAmountMinor: 8000n,
          recoveryValueMinor: 1200n,
        },
      });
      order = await db.order.create({
        data: {
          merchantId: p.merchantId,
          productId: product.id,
          publicOrderNumber: number,
          productSnapshot: { name: product.name, category: "Home" },
          customerRef: "SYNTHETIC-AI-EVALUATION",
          currency: "USD",
          totalMinor: 8000n,
          origin: "SIMULATED",
          timingProvenance: "SIMULATED",
          purchasedAt: new Date(Date.now() - 86400000),
        },
      });
    }
    let c = await db.returnCase.findFirst({
      where: { merchantId: p.merchantId, orderId: order.id },
    });
    if (!c) {
      const link = await returns.issueAccess(p, order.id);
      const created = await returns.submit(link.token, {
        productId: order.productId,
        reason: "DAMAGED",
        condition: "DAMAGED",
        description: scenario.description,
      });
      c = await db.returnCase.findUniqueOrThrow({
        where: { id: created.caseId },
      });
      await service.upload(
        created.token,
        await syntheticImage(scenario.scene, scenario.variant),
        "image/png",
        true,
      );
      await service.consent(created.token, true, CONSENT_VERSION);
      await returns.revokeAccess(p, order.id);
    }
    const result = await service.analyze(p, c.id),
      analysis = await db.evidenceAnalysis.findUniqueOrThrow({
        where: { id: result.analysisId },
        include: { attempts: true },
      }),
      parsed = assessmentSchema.safeParse(analysis.result);
    const a = parsed.success ? parsed.data : null,
      visible = a?.visibleObservations.join(" ").toLowerCase() ?? "";
    // Predeclared label checks are a narrow observable-agreement proxy, not a universal accuracy benchmark.
    const observedAgreement =
      !!a &&
      (scenario.scene === "broken" || scenario.scene === "injection"
        ? /broken|separat|fragment|split|two.*piec|crack/.test(visible)
        : scenario.scene === "scratched"
          ? /scratch|line|scuff/.test(visible)
          : scenario.scene === "ambiguous"
            ? a.uncertainty === "HIGH"
            : a.claimSupport === "UNSUPPORTED" || a.claimSupport === "UNCLEAR");
    reports.push({
      scenario: scenario.id,
      source: "SYNTHETIC VECTOR ILLUSTRATION",
      caseId: c.id,
      status: analysis.status,
      cached: result.cached,
      valid: parsed.success,
      observedAgreement,
      uncertainty: a?.uncertainty ?? null,
      injectionFlag: a?.injectionSuspected ?? null,
      assessment: a,
      errorCode: analysis.errorCode,
      attempts: analysis.attempts.map((t) => ({
        promptTokens: t.promptTokens,
        cachedTokens: t.cachedTokens,
        completionTokens: t.completionTokens,
        estimatedNano: t.estimatedNano?.toString(),
        latencyMs: t.latencyMs,
        providerModel: t.providerModel,
        costBasis: t.costBasis,
      })),
    });
    console.log(JSON.stringify(reports.at(-1)));
  }
  const report = {
    generatedAt: new Date().toISOString(),
    model: "deepseek-flash",
    endpoint: "https://api.deepseek.com/chat/completions",
    count: reports.length,
    valid: reports.filter((r) => r.valid).length,
    observableAgreement: reports.filter((r) => r.observedAgreement).length,
    estimatedNano: reports
      .reduce(
        (sum, r) =>
          sum +
          r.attempts.reduce((s, a) => s + BigInt(a.estimatedNano ?? "0"), 0n),
        0n,
      )
      .toString(),
    results: reports,
  };
  await mkdir(".local/evaluation", { recursive: true });
  await writeFile(
    ".local/evaluation/deepseek-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      report: ".local/evaluation/deepseek-report.json",
      count: report.count,
      valid: report.valid,
      observableAgreement: report.observableAgreement,
      estimatedNano: report.estimatedNano,
    }),
  );
} catch (error) {
  console.error(
    error instanceof Error && "code" in error
      ? String(error.code)
      : "Evaluation stopped; inspect configuration and persisted case status. No automatic retry was started.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
