import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  Prisma,
  type PrismaClient,
  type ReturnCase,
} from "@/generated/prisma/client";
import type { Principal } from "./auth";
import { hashToken, opaqueTokenSchema } from "@/lib/auth/tokens";
import { invariant, digest } from "./payment-rules";
import { normalizeEvidence } from "@/lib/ai/images";
import { aiConfig, type AiConfig } from "@/lib/ai/config";
import { storageConfig } from "@/lib/evidence/config";
import {
  configuredEvidenceStore,
  objectKeys,
  readStoredEvidence,
  type EvidenceStore,
} from "@/lib/evidence/storage";
import { purgeStoredEvidence } from "./evidence-retention";
import {
  CONSENT_VERSION,
  MODEL,
  MODEL_REVISION,
  PROMPT_VERSION,
} from "@/lib/ai/contracts";
import { estimatedCost, reservation, PRICING_VERSION } from "@/lib/ai/cost";
import {
  DeepSeekProvider,
  type EvidenceProvider,
  type ProviderResult,
} from "@/lib/ai/deepseek";
type Tx = Prisma.TransactionClient;
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const mutable = [
  "SUBMITTED",
  "EVALUATED",
  "MANUAL_REVIEW",
  "AWAITING_CUSTOMER",
  "RESOLUTION_PROPOSED",
];
const evidenceSelect = {
  id: true,
  contentHash: true,
  width: true,
  height: true,
  bytes: true,
  createdAt: true,
  expiresAt: true,
} as const;
export class EvidenceService {
  constructor(
    readonly db: PrismaClient,
    readonly config: AiConfig = aiConfig(),
    private provider: EvidenceProvider = new DeepSeekProvider(config),
    private budgetId = "deepseek-global-v1",
    private store: EvidenceStore | null = configuredEvidenceStore(),
  ) {}
  private async actor(tx: Tx, p: Principal) {
    invariant(
      await tx.user.findFirst({
        where: {
          id: p.userId,
          merchantId: p.merchantId,
          disabledAt: null,
          role: "ADMIN",
        },
      }),
      "FORBIDDEN",
      "Active merchant administrator required",
      403,
    );
  }
  private async customer(tx: Tx, raw: string) {
    invariant(
      opaqueTokenSchema.safeParse(raw).success,
      "INVALID_ACCESS",
      "Private case access required",
      404,
    );
    const token = await tx.accessToken.findFirst({
      where: {
        tokenHash: hashToken(raw),
        purpose: "CUSTOMER_TRACK",
        consumedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    invariant(
      token?.caseId && token.orderId,
      "INVALID_ACCESS",
      "Private case access is invalid or expired",
      404,
    );
    const c = await tx.returnCase.findFirst({
      where: {
        id: token.caseId,
        merchantId: token.merchantId,
        orderId: token.orderId,
      },
    });
    invariant(c, "NOT_FOUND", "Case not found", 404);
    return { c, token };
  }
  private async lock(tx: Tx, c: Pick<ReturnCase, "id" | "merchantId">) {
    await tx.$queryRaw`SELECT id FROM "ReturnCase" WHERE id=${c.id}::uuid AND "merchantId"=${c.merchantId}::uuid FOR UPDATE`;
    const record = await tx.returnCase.findFirst({
      where: { id: c.id, merchantId: c.merchantId },
    });
    invariant(record, "NOT_FOUND", "Case not found", 404);
    return record;
  }
  private audit(
    tx: Tx,
    c: Pick<ReturnCase, "id" | "merchantId">,
    action: string,
    data: unknown,
    p?: Principal,
  ) {
    return tx.auditLog.create({
      data: {
        merchantId: c.merchantId,
        caseId: c.id,
        actorType: p ? "USER" : "CUSTOMER",
        actorUserId: p?.userId,
        action,
        correlationId: randomUUID(),
        redactedMetadataJson: json(data),
      },
    });
  }
  private async invalidate(tx: Tx, c: ReturnCase) {
    invariant(
      c.workflowVersion === 1 && mutable.includes(c.status),
      "CASE_LOCKED",
      "Evidence changes require an open current return case",
      409,
    );
    await tx.returnProposal.updateMany({
      where: {
        merchantId: c.merchantId,
        caseId: c.id,
        status: { in: ["PROPOSED", "ACCEPTED"] },
      },
      data: { status: "WITHDRAWN" },
    });
    await tx.returnCase.update({
      where: { id: c.id },
      data: {
        evidenceRevision: { increment: 1 },
        version: { increment: 1 },
        aiReviewRequired: true,
        status: "MANUAL_REVIEW",
        recommendation: null,
        priority: "HIGH",
      },
    });
  }
  async customerView(raw: string) {
    return this.db.$transaction(async (tx) => {
      const { c } = await this.customer(tx, raw);
      return {
        consent: c.aiConsentVersion === CONSENT_VERSION && !!c.aiConsentAt,
        reviewRequired: c.aiReviewRequired,
        editable: c.workflowVersion === 1 && mutable.includes(c.status),
        images: await tx.returnEvidence.findMany({
          where: {
            merchantId: c.merchantId,
            caseId: c.id,
            deletedAt: null,
            storageState: "READY",
            expiresAt: { gt: new Date() },
          },
          select: evidenceSelect,
          orderBy: { createdAt: "asc" },
        }),
      };
    });
  }
  async upload(
    raw: string,
    bytes: Buffer,
    mime: string,
    storageConsent: boolean,
  ) {
    invariant(
      storageConsent === true,
      "CONSENT_REQUIRED",
      "Confirm private evidence storage before uploading",
      400,
    );
    await this.db.$transaction(async (tx) => {
      await this.customer(tx, raw);
    });
    const normalized = await normalizeEvidence(bytes, mime);
    const stored = await this.db.$transaction(async (tx) => {
      const { c: initial, token } = await this.customer(tx, raw),
        c = await this.lock(tx, initial);
      invariant(
        (
          await tx.accessToken.updateMany({
            where: {
              id: token.id,
              revokedAt: null,
              expiresAt: { gt: new Date() },
            },
            data: { updatedAt: new Date() },
          })
        ).count === 1,
        "INVALID_ACCESS",
        "Private case access expired",
        404,
      );
      const existing = await tx.returnEvidence.findUnique({
        where: {
          caseId_contentHash: {
            caseId: c.id,
            contentHash: normalized.contentHash,
          },
        },
      });
      if (
        existing &&
        !existing.deletedAt &&
        existing.expiresAt > new Date() &&
        existing.storageState === "READY"
      )
        return { id: existing.id, duplicate: true };
      invariant(
        !existing,
        "EVIDENCE_RETIRED",
        "This image was removed or expired. Use a new image or human review.",
        409,
      );
      invariant(
        (await tx.returnEvidence.count({ where: { caseId: c.id } })) < 6,
        "UPLOAD_LIMIT",
        "At most six image submissions per case, including removed images; ask for human review",
        409,
      );
      invariant(
        (await tx.returnEvidence.count({
          where: {
            caseId: c.id,
            deletedAt: null,
            expiresAt: { gt: new Date() },
          },
        })) < 3,
        "UPLOAD_LIMIT",
        "At most three active images per case",
        409,
      );
      await this.invalidate(tx, c);
      const id = randomUUID(),
        keys = objectKeys({ id, merchantId: c.merchantId, caseId: c.id });
      const storageBytes =
        normalized.image.length + normalized.inferenceImage.length;
      if (this.store) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(712001)`;
        const used = await tx.returnEvidence.aggregate({
          _sum: { storageBytes: true },
        });
        invariant(
          (used._sum.storageBytes ?? 0) + storageBytes <=
            storageConfig().capBytes,
          "STORAGE_QUOTA",
          "Private evidence storage cap reached; ask for manual review.",
          409,
        );
      }
      const image = await tx.returnEvidence.create({
        data: {
          id,
          merchantId: c.merchantId,
          caseId: c.id,
          ...normalized,
          ...(this.store
            ? {
                image: null,
                inferenceImage: null,
                storageProvider: "SUPABASE",
                storageState: "UPLOADING",
                ...keys,
                storageBytes,
              }
            : {}),
          expiresAt: new Date(Date.now() + 30 * 86400000),
        },
      });
      await this.audit(
        tx,
        c,
        this.store ? "EVIDENCE_STORAGE_RESERVED" : "EVIDENCE_UPLOADED",
        {
          evidenceId: image.id,
          contentHash: image.contentHash,
          storageConsent: true,
          accessTokenId: token.id,
        },
      );
      return {
        id: image.id,
        duplicate: false,
        remote: this.store ? image : undefined,
      };
    });
    if (!("remote" in stored) || !stored.remote)
      return { id: stored.id, duplicate: stored.duplicate };
    const remote = stored.remote;
    try {
      await this.store!.put(remote.storageKey!, normalized.image);
      await this.store!.put(
        remote.inferenceStorageKey!,
        normalized.inferenceImage,
      );
      await this.db.$transaction(async (tx) => {
        const { c: initial } = await this.customer(tx, raw),
          c = await this.lock(tx, initial);
        const pending = await tx.returnEvidence.findFirst({
          where: {
            id: remote.id,
            merchantId: c.merchantId,
            caseId: c.id,
            storageState: "UPLOADING",
            deletedAt: null,
          },
        });
        invariant(
          pending,
          "EVIDENCE_CHANGED",
          "Evidence upload is no longer current",
          409,
        );
        await this.invalidate(tx, c);
        await tx.returnEvidence.update({
          where: { id: remote.id },
          data: { storageState: "READY" },
        });
        await this.audit(tx, c, "EVIDENCE_UPLOADED", {
          evidenceId: remote.id,
          storageProvider: "SUPABASE",
          contentHash: remote.contentHash,
        });
      });
      return { id: remote.id, duplicate: false };
    } catch {
      // Unknown uploads continue consuming quota until both object deletions succeed.
      await this.db.returnEvidence.updateMany({
        where: { id: remote.id, storageState: "UPLOADING" },
        data: { storageState: "DELETE_PENDING", deletedAt: new Date() },
      });
      invariant(
        false,
        "STORAGE_UNAVAILABLE",
        "Private upload could not be confirmed; use manual review. Cleanup is tracked for retry.",
        503,
      );
    }
  }
  async consent(raw: string, enabled: boolean, version: string) {
    invariant(
      version === CONSENT_VERSION,
      "CONSENT_REQUIRED",
      "Read the current DeepSeek notice before choosing",
      400,
    );
    return this.db.$transaction(async (tx) => {
      const { c: initial, token } = await this.customer(tx, raw),
        c = await this.lock(tx, initial);
      invariant(
        (
          await tx.accessToken.updateMany({
            where: {
              id: token.id,
              revokedAt: null,
              expiresAt: { gt: new Date() },
            },
            data: { updatedAt: new Date() },
          })
        ).count === 1,
        "INVALID_ACCESS",
        "Private case access expired",
        404,
      );
      await this.invalidate(tx, c);
      await tx.returnCase.update({
        where: { id: c.id },
        data: {
          aiConsentVersion: enabled ? CONSENT_VERSION : null,
          aiConsentAt: enabled ? new Date() : null,
        },
      });
      await this.audit(
        tx,
        c,
        enabled ? "AI_CONSENT_GRANTED" : "AI_CONSENT_WITHDRAWN",
        { noticeVersion: version, accessTokenId: token.id },
      );
      return { consent: enabled };
    });
  }
  async remove(raw: string, id: string) {
    z.uuid().parse(id);
    const removed = await this.db.$transaction(async (tx) => {
      const { c: initial, token } = await this.customer(tx, raw),
        c = await this.lock(tx, initial);
      invariant(
        (
          await tx.accessToken.updateMany({
            where: {
              id: token.id,
              revokedAt: null,
              expiresAt: { gt: new Date() },
            },
            data: { updatedAt: new Date() },
          })
        ).count === 1,
        "INVALID_ACCESS",
        "Private case access expired",
        404,
      );
      const e = await tx.returnEvidence.findFirst({
        where: { id, merchantId: c.merchantId, caseId: c.id, deletedAt: null },
      });
      invariant(e, "NOT_FOUND", "Evidence not found", 404);
      await this.invalidate(tx, c);
      await tx.returnEvidence.update({
        where: { id },
        data: {
          image: null,
          inferenceImage: null,
          deletedAt: new Date(),
          storageState:
            e.storageProvider === "SUPABASE" ? "DELETE_PENDING" : "PURGED",
        },
      });
      await this.audit(tx, c, "EVIDENCE_REMOVED", { evidenceId: id });
      return { removed: true, remote: e.storageProvider === "SUPABASE" };
    });
    if (removed.remote) {
      try {
        await purgeStoredEvidence(this.db, id, this.store);
      } catch {
        return { removed: true, deletionPending: true };
      }
    }
    return { removed: true, deletionPending: false };
  }
  async customerImage(raw: string, id: string, inference = false) {
    z.uuid().parse(id);
    const record = await this.db.$transaction(async (tx) => {
      const { c } = await this.customer(tx, raw);
      return this.image(tx, c, id);
    });
    return readStoredEvidence(record, inference, this.store);
  }
  private async image(
    tx: Tx,
    c: Pick<ReturnCase, "id" | "merchantId">,
    id: string,
  ) {
    const image = await tx.returnEvidence.findFirst({
      where: {
        id,
        merchantId: c.merchantId,
        caseId: c.id,
        deletedAt: null,
        storageState: "READY",
        expiresAt: { gt: new Date() },
      },
    });
    invariant(image, "NOT_FOUND", "Image unavailable or expired", 404);
    return image;
  }
  async merchantImage(
    p: Principal,
    caseId: string,
    id: string,
    inference = false,
  ) {
    z.uuid().parse(caseId);
    z.uuid().parse(id);
    const record = await this.db.$transaction(async (tx) => {
      await this.actor(tx, p);
      return this.image(tx, { id: caseId, merchantId: p.merchantId }, id);
    });
    return readStoredEvidence(record, inference, this.store);
  }
  async view(p: Principal, caseId: string) {
    z.uuid().parse(caseId);
    return this.db.$transaction(async (tx) => {
      await this.actor(tx, p);
      const c = await tx.returnCase.findFirst({
        where: { id: caseId, merchantId: p.merchantId },
      });
      invariant(c, "NOT_FOUND", "Case not found", 404);
      const [images, analyses, usage, budget, held] = await Promise.all([
        tx.returnEvidence.findMany({
          where: {
            merchantId: c.merchantId,
            caseId,
            deletedAt: null,
            storageState: "READY",
            expiresAt: { gt: new Date() },
          },
          select: evidenceSelect,
          orderBy: { createdAt: "asc" },
        }),
        tx.evidenceAnalysis.findMany({
          where: { merchantId: c.merchantId, caseId },
          orderBy: { createdAt: "desc" },
          take: 5,
          include: { attempts: { orderBy: { sequence: "asc" } } },
        }),
        tx.analysisAttempt.aggregate({
          where: { merchantId: p.merchantId },
          _sum: {
            estimatedNano: true,
            promptTokens: true,
            completionTokens: true,
          },
        }),
        tx.aiBudget.findUnique({ where: { id: this.budgetId } }),
        tx.analysisAttempt.aggregate({
          where: { merchantId: p.merchantId, status: "RESERVED" },
          _sum: { reservationNano: true },
        }),
      ]);
      return {
        enabled: this.config.enabled && !!this.config.apiKey,
        editable: mutable.includes(c.status),
        consent: c.aiConsentVersion === CONSENT_VERSION && !!c.aiConsentAt,
        revision: c.evidenceRevision,
        reviewRequired: c.aiReviewRequired,
        images,
        analyses,
        usage: usage._sum,
        budget: {
          capNano: this.config.capNano,
          spentNano: usage._sum.estimatedNano ?? 0n,
          reservedNano: held._sum.reservationNano ?? 0n,
          blocked: budget?.blocked ?? false,
        },
      };
    });
  }
  async review(p: Principal, caseId: string, revision: number, note: string) {
    z.uuid().parse(caseId);
    z.string().trim().min(10).max(1500).parse(note);
    return this.db.$transaction(async (tx) => {
      await this.actor(tx, p);
      const c = await this.lock(tx, { id: caseId, merchantId: p.merchantId });
      invariant(
        c.evidenceRevision === revision,
        "STALE_CASE",
        "Evidence changed; refresh before review",
        409,
      );
      invariant(
        mutable.includes(c.status),
        "CASE_LOCKED",
        "Case is closed for evidence review",
        409,
      );
      invariant(
        !(await tx.evidenceAnalysis.findFirst({
          where: {
            caseId,
            status: "RUNNING",
            createdAt: { gt: new Date(Date.now() - 120000) },
          },
        })),
        "ANALYSIS_RUNNING",
        "Wait for the in-flight analysis",
        409,
      );
      await tx.returnCase.update({
        where: { id: c.id },
        data: { aiReviewRequired: false, version: { increment: 1 } },
      });
      await tx.evidenceAnalysis.updateMany({
        where: {
          caseId,
          merchantId: p.merchantId,
          evidenceRevision: revision,
          status: { not: "RUNNING" },
        },
        data: {
          reviewedAt: new Date(),
          reviewedBy: p.userId,
          reviewNote: note,
        },
      });
      await this.audit(
        tx,
        c,
        "EVIDENCE_HUMAN_REVIEWED",
        { evidenceRevision: revision, note },
        p,
      );
      return { reviewed: true };
    });
  }
  async analyze(p: Principal, caseId: string) {
    z.uuid().parse(caseId);
    const prepared = await this.db.$transaction(async (tx) => {
      await this.actor(tx, p);
      const c = await this.lock(tx, { id: caseId, merchantId: p.merchantId });
      invariant(
        c.workflowVersion === 1 && mutable.includes(c.status),
        "CASE_LOCKED",
        "Analyze an open current case",
        409,
      );
      invariant(
        c.aiConsentVersion === CONSENT_VERSION && c.aiConsentAt,
        "CONSENT_REQUIRED",
        "Customer permission to transmit evidence to DeepSeek is required",
        409,
      );
      const images = await tx.returnEvidence.findMany({
        where: {
          caseId,
          merchantId: p.merchantId,
          deletedAt: null,
          storageState: "READY",
          expiresAt: { gt: new Date() },
        },
        orderBy: { id: "asc" },
      });
      invariant(
        images.length > 0 &&
          images.every(
            (e) =>
              e.inferenceImage ||
              (e.storageProvider === "SUPABASE" && e.inferenceStorageKey),
          ),
        "EVIDENCE_REQUIRED",
        "Upload at least one current product image",
        409,
      );
      const additions = await tx.auditLog.findMany({
        where: {
          caseId: c.id,
          merchantId: c.merchantId,
          action: "CUSTOMER_INFORMATION_ADDED",
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      });
      const messages = additions
        .reverse()
        .map((a) =>
          z
            .object({ message: z.string().max(1500) })
            .safeParse(a.redactedMetadataJson),
        )
        .filter((a) => a.success)
        .map((a) => a.data!.message);
      const description = messages.length
        ? `${c.description}\nAdditional customer information (untrusted):\n${messages.join("\n")}`
        : c.description;
      const evidenceHash = digest({
          description,
          images: images.map((e) => e.contentHash),
        }),
        cacheKey = digest({
          caseId,
          evidenceHash,
          model: MODEL,
          modelRevision: MODEL_REVISION,
          prompt: PROMPT_VERSION,
          detail: this.config.detail,
          maxTokens: this.config.maxTokens,
        });
      const cached = await tx.evidenceAnalysis.findUnique({
        where: { cacheKey },
      });
      if (cached) return { analysis: cached, input: null };
      invariant(
        this.config.enabled && this.config.apiKey,
        "AI_UNAVAILABLE",
        "AI is not configured. Record human evidence review instead.",
        409,
      );
      const analysis = await tx.evidenceAnalysis.create({
        data: {
          merchantId: p.merchantId,
          caseId,
          evidenceRevision: c.evidenceRevision,
          evidenceHash,
          cacheKey,
          model: MODEL,
          promptVersion: PROMPT_VERSION,
          detail: this.config.detail,
          status: "RUNNING",
        },
      });
      await tx.returnProposal.updateMany({
        where: { caseId, status: { in: ["PROPOSED", "ACCEPTED"] } },
        data: { status: "WITHDRAWN" },
      });
      await tx.returnCase.update({
        where: { id: caseId },
        data: {
          aiReviewRequired: true,
          status: "MANUAL_REVIEW",
          recommendation: null,
          version: { increment: 1 },
          priority: "HIGH",
        },
      });
      await this.audit(
        tx,
        c,
        "AI_ANALYSIS_REQUESTED",
        {
          analysisId: analysis.id,
          evidenceHash,
          model: MODEL,
          consentVersion: CONSENT_VERSION,
        },
        p,
      );
      return {
        analysis,
        input: {
          description,
          images,
        },
        expiresAt: Math.min(...images.map((e) => e.expiresAt.getTime())),
      };
    });
    if (!prepared.input)
      return {
        analysisId: prepared.analysis.id,
        status: prepared.analysis.status,
        cached: true,
      };
    const analysis = prepared.analysis;
    let imageBytes: Buffer[];
    try {
      imageBytes = await Promise.all(
        prepared.input.images.map((e) =>
          readStoredEvidence(e, true, this.store),
        ),
      );
    } catch {
      await this.db.evidenceAnalysis.update({
        where: { id: analysis.id },
        data: {
          status: "FAILED",
          errorCode: "STORAGE_UNAVAILABLE",
          completedAt: new Date(),
        },
      });
      return { analysisId: analysis.id, status: "FAILED", cached: false };
    }
    const input = {
        description: prepared.input.description,
        images: imageBytes,
      },
      bound = reservation(
        input.description,
        input.images.length,
        this.config.maxTokens,
      );
    for (let sequence = 1; sequence <= 2; sequence++) {
      const attempt = await this.db.$transaction(async (tx) => {
        await this.actor(tx, p);
        const c = await this.lock(tx, { id: caseId, merchantId: p.merchantId });
        if (
          c.evidenceRevision !== analysis.evidenceRevision ||
          c.aiConsentVersion !== CONSENT_VERSION ||
          !c.aiReviewRequired ||
          !mutable.includes(c.status) ||
          prepared.expiresAt! <= Date.now()
        ) {
          await tx.evidenceAnalysis.update({
            where: { id: analysis.id },
            data: {
              status: "STALE",
              errorCode: "EVIDENCE_CHANGED",
              completedAt: new Date(),
            },
          });
          return null;
        }
        await tx.aiBudget.upsert({
          where: { id: this.budgetId },
          create: { id: this.budgetId },
          update: {},
        });
        await tx.$queryRaw`SELECT id FROM "AiBudget" WHERE id=${this.budgetId} FOR UPDATE`;
        const budget = await tx.aiBudget.findUniqueOrThrow({
          where: { id: this.budgetId },
        });
        if (
          budget.blocked ||
          budget.spentNano + budget.reservedNano + bound > this.config.capNano
        ) {
          await tx.evidenceAnalysis.update({
            where: { id: analysis.id },
            data: {
              status: "FAILED",
              errorCode: "BUDGET_EXHAUSTED",
              completedAt: new Date(),
            },
          });
          await this.audit(
            tx,
            c,
            "AI_BUDGET_BLOCKED",
            { analysisId: analysis.id },
            p,
          );
          return null;
        }
        await tx.aiBudget.update({
          where: { id: this.budgetId },
          data: { reservedNano: { increment: bound } },
        });
        return tx.analysisAttempt.create({
          data: {
            merchantId: p.merchantId,
            analysisId: analysis.id,
            budgetId: this.budgetId,
            sequence,
            status: "RESERVED",
            reservationNano: bound,
            costBasis: "RESERVED_MAXIMUM",
            pricingVersion: PRICING_VERSION,
          },
        });
      });
      if (!attempt) break;
      let response: ProviderResult;
      const started = Date.now();
      try {
        response = await this.provider.analyze(input);
      } catch {
        response = {
          errorCode: "NETWORK_UNKNOWN",
          latencyMs: Date.now() - started,
        };
      }
      const charge = response.usage
        ? estimatedCost(response.usage)
        : response.definitelyUnbilled
          ? 0n
          : bound;
      const retry = response.errorCode === "RATE_LIMITED" && sequence === 1;
      await this.db.$transaction(async (tx) => {
        const c = await this.lock(tx, { id: caseId, merchantId: p.merchantId });
        await tx.$queryRaw`SELECT id FROM "AiBudget" WHERE id=${this.budgetId} FOR UPDATE`;
        const changed =
          c.evidenceRevision !== analysis.evidenceRevision ||
          c.aiConsentVersion !== CONSENT_VERSION ||
          !c.aiReviewRequired ||
          !mutable.includes(c.status) ||
          prepared.expiresAt! <= Date.now();
        await tx.aiBudget.update({
          where: { id: this.budgetId },
          data: {
            reservedNano: { decrement: bound },
            spentNano: { increment: charge },
            ...(charge > bound ? { blocked: true } : {}),
          },
        });
        await tx.analysisAttempt.update({
          where: { id: attempt.id },
          data: {
            status: response.assessment ? "SUCCEEDED" : "FAILED",
            estimatedNano: charge,
            costBasis: response.usage
              ? "PROVIDER_USAGE_PEAK_ESTIMATE"
              : response.definitelyUnbilled
                ? "REJECTED_BEFORE_INFERENCE"
                : "UNKNOWN_MAXIMUM",
            promptTokens: response.usage?.promptTokens,
            cachedTokens: response.usage?.cachedTokens,
            completionTokens: response.usage?.completionTokens,
            providerModel: response.model,
            providerRequestId: response.requestId,
            latencyMs: response.latencyMs,
            errorCode: response.errorCode,
            completedAt: new Date(),
          },
        });
        const status = changed
          ? "STALE"
          : retry
            ? "RUNNING"
            : response.assessment
              ? "SUCCEEDED"
              : "FAILED";
        await tx.evidenceAnalysis.update({
          where: { id: analysis.id },
          data: {
            status,
            result:
              !changed && response.assessment
                ? json(response.assessment)
                : Prisma.DbNull,
            errorCode: changed
              ? "EVIDENCE_CHANGED"
              : (response.errorCode ?? null),
            completedAt: retry ? null : new Date(),
          },
        });
        await this.audit(
          tx,
          c,
          "AI_ATTEMPT_RECORDED",
          {
            analysisId: analysis.id,
            attempt: sequence,
            status,
            errorCode: response.errorCode ?? null,
            estimatedNano: charge.toString(),
            humanReviewRequired: true,
          },
          p,
        );
      });
      if (!retry) break;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    const done = await this.db.evidenceAnalysis.findUniqueOrThrow({
      where: { id: analysis.id },
    });
    return { analysisId: done.id, status: done.status, cached: false };
  }
}
