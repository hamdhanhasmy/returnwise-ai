import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import type { Principal } from "./auth";
import { syncCaseRefunds } from "./case-refunds";

export async function listCases(
  db: PrismaClient,
  principal: Principal,
  page = 1,
) {
  return db.returnCase.findMany({
    where: { merchantId: principal.merchantId },
    include: { order: { include: { product: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 25,
    skip: (page - 1) * 25,
  });
}

export async function getCase(
  db: PrismaClient,
  principal: Principal,
  id: string,
) {
  if (!z.uuid().safeParse(id).success) return null;
  const linked = await db.refundApproval.findFirst({
    where: { caseId: id, merchantId: principal.merchantId },
    select: { paymentId: true },
  });
  if (linked) await syncCaseRefunds(db, linked.paymentId);
  return db.returnCase.findFirst({
    where: { id, merchantId: principal.merchantId },
    include: {
      order: { include: { product: true, payment: true } },
      policy: true,
      refundApproval: {
        include: { operation: { include: { providerRefund: true } } },
      },
      evaluations: { orderBy: { caseVersion: "desc" }, take: 1 },
      proposals: { orderBy: { createdAt: "desc" }, take: 1 },
      audit: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
}

export async function merchantOverview(db: PrismaClient, principal: Principal) {
  const where = { merchantId: principal.merchantId };
  const [caseCount, reviewCount, orderCount, latestCases] = await Promise.all([
    db.returnCase.count({ where }),
    db.returnCase.count({ where: { ...where, status: "MANUAL_REVIEW" } }),
    db.order.count({ where: { ...where, origin: "SIMULATED" } }),
    db.returnCase.findMany({
      where,
      include: { order: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
  ]);
  return { caseCount, reviewCount, orderCount, latestCases };
}

export function getMerchantSettings(db: PrismaClient, principal: Principal) {
  return db.merchant.findFirstOrThrow({
    where: { id: principal.merchantId },
    select: {
      name: true,
      sandboxAccountAlias: true,
      paymentsEnabled: true,
      policies: {
        where: { usage: "PAYMENT" },
        orderBy: { version: "desc" },
        take: 1,
      },
    },
  });
}
