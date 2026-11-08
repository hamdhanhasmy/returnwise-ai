import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import type { Principal } from "./auth";

export async function listCases(db: PrismaClient, principal: Principal) {
  return db.returnCase.findMany({
    where: { merchantId: principal.merchantId },
    include: { order: { include: { product: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function getCase(
  db: PrismaClient,
  principal: Principal,
  id: string,
) {
  if (!z.uuid().safeParse(id).success) return null;
  return db.returnCase.findFirst({
    where: { id, merchantId: principal.merchantId },
    include: { order: { include: { product: true } }, policy: true },
  });
}

export async function merchantOverview(db: PrismaClient, principal: Principal) {
  const where = { merchantId: principal.merchantId };
  const [caseCount, reviewCount, orderCount, latestCases] = await Promise.all([
    db.returnCase.count({ where }),
    db.returnCase.count({ where: { ...where, status: "MANUAL_REVIEW" } }),
    db.order.count({ where }),
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
      policies: { orderBy: { version: "desc" }, take: 1 },
    },
  });
}
