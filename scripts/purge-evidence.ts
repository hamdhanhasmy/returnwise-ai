import { randomUUID } from "node:crypto";
import { scriptDatabase } from "./database";
import { purgeStoredEvidence } from "../src/server/services/evidence-retention";
const db = scriptDatabase(),
  apply = process.argv.includes("--apply");
try {
  const expired = await db.returnEvidence.findMany({
    where: {
      OR: [
        { expiresAt: { lte: new Date() }, deletedAt: null },
        {
          storageProvider: "SUPABASE",
          storageState: "DELETE_PENDING",
          deletedAt: { lte: new Date(Date.now() - 600000) },
        },
        {
          storageProvider: "SUPABASE",
          storageState: "UPLOADING",
          createdAt: { lte: new Date(Date.now() - 3600000) },
        },
      ],
    },
    select: { id: true, merchantId: true, caseId: true, storageProvider: true },
    take: 100,
  });
  if (apply)
    for (const e of expired) {
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "ReturnCase" WHERE id=${e.caseId}::uuid FOR UPDATE`;
        const removed = await tx.returnEvidence.updateMany({
          where: {
            id: e.id,
            deletedAt: null,
            OR: [
              { expiresAt: { lte: new Date() } },
              {
                storageProvider: "SUPABASE",
                storageState: "UPLOADING",
                createdAt: { lte: new Date(Date.now() - 3600000) },
              },
            ],
          },
          data: {
            image: null,
            inferenceImage: null,
            deletedAt: new Date(),
            storageState:
              e.storageProvider === "SUPABASE" ? "DELETE_PENDING" : "PURGED",
          },
        });
        if (removed.count) {
          const c = await tx.returnCase.findUniqueOrThrow({
            where: { id: e.caseId },
          });
          const open = [
            "SUBMITTED",
            "EVALUATED",
            "MANUAL_REVIEW",
            "AWAITING_CUSTOMER",
            "RESOLUTION_PROPOSED",
          ].includes(c.status);
          await tx.returnCase.update({
            where: { id: c.id },
            data: {
              evidenceRevision: { increment: 1 },
              version: { increment: 1 },
              aiReviewRequired: true,
              ...(open
                ? { status: "MANUAL_REVIEW", recommendation: null }
                : {}),
            },
          });
          if (open)
            await tx.returnProposal.updateMany({
              where: { caseId: c.id, status: { in: ["PROPOSED", "ACCEPTED"] } },
              data: { status: "WITHDRAWN" },
            });
          await tx.auditLog.create({
            data: {
              merchantId: e.merchantId,
              caseId: e.caseId,
              actorType: "SYSTEM",
              action: "EXPIRED_EVIDENCE_PURGED",
              correlationId: randomUUID(),
              redactedMetadataJson: { evidenceId: e.id },
            },
          });
        }
      });
      await purgeStoredEvidence(db, e.id);
    }
  console.log(
    JSON.stringify({
      mode: apply ? "applied" : "dry-run",
      expiredInBatch: expired.length,
      batchLimit: 100,
      notice:
        "Only expired evidence bytes are eligible; payment records and audit history are preserved.",
    }),
  );
} catch {
  console.error(
    "Evidence retention cleanup failed; no broad deletion attempted.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
