import { randomUUID } from "node:crypto";
import type { PrismaClient, Prisma } from "@/generated/prisma/client";
import { aiConfig, type AiConfig } from "@/lib/ai/config";
import { estimatedCost, PRICING_VERSION } from "@/lib/ai/cost";
import {
  AGENT_PROMPT_VERSION,
  AGENT_SYSTEM,
  MAX_AGENT_OUTPUT,
  analyticsTools,
  answerTool,
  askSchema,
  assertReadOnlyQuestion,
} from "@/lib/analytics/agent";
import {
  DeepSeekAnalyticsProvider,
  type AnalyticsProvider,
  type ToolSelection,
} from "@/lib/analytics/deepseek-tools";
import { AnalyticsService } from "./analytics";
import type { Principal } from "./auth";
import { digest, invariant } from "./payment-rules";
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export class AnalyticsAgentService {
  constructor(
    readonly db: PrismaClient,
    readonly config: AiConfig = aiConfig(),
    private provider: AnalyticsProvider = new DeepSeekAnalyticsProvider(config),
    private budgetId = "deepseek-global-v1",
  ) {}
  async ask(p: Principal, raw: unknown) {
    const request = askSchema.parse(raw);
    try {
      assertReadOnlyQuestion(request.question);
    } catch {
      invariant(
        false,
        "READ_ONLY_ONLY",
        "Ask an aggregate analytics question without personal data or action requests.",
        400,
      );
    }
    invariant(
      this.config.enabled && this.config.apiKey,
      "AI_UNAVAILABLE",
      "Analytics assistant unavailable; use the Studio dashboard and manual exploration.",
      503,
    );
    invariant(
      await this.db.user.findFirst({
        where: {
          id: p.userId,
          merchantId: p.merchantId,
          role: "ADMIN",
          disabledAt: null,
        },
        select: { id: true },
      }),
      "FORBIDDEN",
      "Active merchant administrator required for paid analytics queries",
      403,
    );
    const snapshot = await new AnalyticsService(this.db).snapshot(
      p,
      request.filter,
    );
    // Hash source data for deduplication; descriptions, photographs and question text are never stored here.
    const snapshotHash = digest({
      filter: snapshot.filter,
      summary: snapshot.summary,
      economics: snapshot.economics,
      rows: snapshot.rows.map((r) => ({
        category: r.category,
        reason: r.reason,
        resolution: r.resolution,
        recoveryMinor: r.recoveryMinor,
      })),
    });
    const questionHash = digest(
      request.question.toLowerCase().replace(/\s+/g, " "),
    );
    const cacheKey = digest({
      merchant: p.merchantId,
      questionHash,
      snapshotHash,
      model: this.config.model,
      prompt: AGENT_PROMPT_VERSION,
    });
    const bound = estimatedCost({
      promptTokens:
        Buffer.byteLength(
          AGENT_SYSTEM + request.question + JSON.stringify(analyticsTools),
          "utf8",
        ) + 2048,
      cachedTokens: 0,
      completionTokens: MAX_AGENT_OUTPUT,
    });
    const claim = await this.db.$transaction(async (tx) => {
      await tx.aiBudget.upsert({
        where: { id: this.budgetId },
        create: { id: this.budgetId },
        update: {},
      });
      await tx.$queryRaw`SELECT id FROM "AiBudget" WHERE id=${this.budgetId} FOR UPDATE`;
      const prior = await tx.analyticsQuery.findUnique({ where: { cacheKey } });
      if (prior) return { record: prior, fresh: false };
      const budget = await tx.aiBudget.findUniqueOrThrow({
        where: { id: this.budgetId },
      });
      invariant(
        !budget.blocked &&
          budget.spentNano + budget.reservedNano + bound <= this.config.capNano,
        "BUDGET_EXHAUSTED",
        "Shared AI spending cap reached; use manual Studio exploration.",
        409,
      );
      invariant(
        (await tx.analyticsQuery.count({
          where: {
            merchantId: p.merchantId,
            createdAt: { gt: new Date(Date.now() - 300000) },
          },
        })) < 6,
        "RATE_LIMITED",
        "Limit of six new analytics questions per merchant per five minutes.",
        429,
      );
      const record = await tx.analyticsQuery.create({
        data: {
          merchantId: p.merchantId,
          requestedByUserId: p.userId,
          budgetId: this.budgetId,
          cacheKey,
          questionHash,
          snapshotHash,
          model: this.config.model,
          promptVersion: AGENT_PROMPT_VERSION,
          status: "RESERVED",
          reservationNano: bound,
          costBasis: "RESERVED_MAXIMUM",
          pricingVersion: PRICING_VERSION,
        },
      });
      await tx.aiBudget.update({
        where: { id: this.budgetId },
        data: { reservedNano: { increment: bound } },
      });
      await tx.auditLog.create({
        data: {
          merchantId: p.merchantId,
          actorType: "USER",
          actorUserId: p.userId,
          action: "ANALYTICS_AI_REQUEST_RESERVED",
          correlationId: randomUUID(),
          redactedMetadataJson: {
            queryId: record.id,
            promptVersion: AGENT_PROMPT_VERSION,
          },
        },
      });
      return { record, fresh: true };
    });
    if (!claim.fresh)
      return {
        status: claim.record.status,
        result: claim.record.result,
        cacheHit: true,
        estimatedNano: claim.record.estimatedNano?.toString() ?? null,
      };
    let response: ToolSelection;
    try {
      response = await this.provider.select(request.question);
    } catch {
      response = { errorCode: "NETWORK_OR_RESPONSE_UNKNOWN", latencyMs: 0 };
    }
    const charge = response.usage
      ? estimatedCost(response.usage)
      : response.definitelyUnbilled
        ? 0n
        : bound;
    const result =
      response.tool && !response.errorCode
        ? answerTool(response.tool, snapshot)
        : null;
    const status = result
      ? "SUCCEEDED"
      : response.definitelyUnbilled || response.usage
        ? "FAILED"
        : "UNKNOWN";
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "AiBudget" WHERE id=${this.budgetId} FOR UPDATE`;
      await tx.analyticsQuery.update({
        where: { id: claim.record.id },
        data: {
          status,
          result: result ? json(result) : undefined,
          toolName: response.tool,
          estimatedNano: charge,
          costBasis: response.usage
            ? "PROVIDER_USAGE_PEAK_ESTIMATE"
            : response.definitelyUnbilled
              ? "UNBILLED_REJECTION"
              : "CONSERVATIVE_UNKNOWN_MAXIMUM",
          promptTokens: response.usage?.promptTokens,
          cachedTokens: response.usage?.cachedTokens,
          completionTokens: response.usage?.completionTokens,
          latencyMs: response.latencyMs,
          errorCode: response.errorCode,
          completedAt: new Date(),
        },
      });
      await tx.aiBudget.update({
        where: { id: this.budgetId },
        data: {
          reservedNano: { decrement: bound },
          spentNano: { increment: charge },
          ...(charge > bound ? { blocked: true } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          merchantId: p.merchantId,
          actorType: "USER",
          actorUserId: p.userId,
          action: "ANALYTICS_AI_REQUEST_SETTLED",
          correlationId: randomUUID(),
          redactedMetadataJson: {
            queryId: claim.record.id,
            status,
            tool: response.tool ?? null,
            errorCode: response.errorCode ?? null,
          },
        },
      });
    });
    return {
      status,
      result,
      cacheHit: false,
      estimatedNano: charge.toString(),
    };
  }
}
