import type { PrismaClient } from "@/generated/prisma/client";
import {
  hashToken,
  newToken,
  opaqueTokenSchema,
  SESSION_SECONDS,
} from "@/lib/auth/tokens";

export class InvalidLoginError extends Error {
  constructor() {
    super("This sign-in link is invalid or expired");
  }
}

export async function issueLoginToken(
  db: PrismaClient,
  merchantId: string,
  email: string,
) {
  const user = await db.user.findFirst({
    where: { merchantId, email: email.toLowerCase(), disabledAt: null },
  });
  if (!user) throw new Error("No active user matches that merchant and email");
  const rawToken = newToken();
  await db.accessToken.create({
    data: {
      merchantId,
      userId: user.id,
      purpose: "MERCHANT_LOGIN",
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + 15 * 60_000),
    },
  });
  return rawToken;
}

export async function consumeLoginToken(db: PrismaClient, rawToken: string) {
  if (!opaqueTokenSchema.safeParse(rawToken).success)
    throw new InvalidLoginError();
  const now = new Date();
  const rawSession = newToken();
  await db.$transaction(async (tx) => {
    const token = await tx.accessToken.findFirst({
      where: {
        tokenHash: hashToken(rawToken),
        purpose: "MERCHANT_LOGIN",
        consumedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      include: { user: true },
    });
    if (!token?.user || token.user.disabledAt) throw new InvalidLoginError();
    // Compare-and-set means concurrent requests cannot both consume the token.
    const consumed = await tx.accessToken.updateMany({
      where: {
        id: token.id,
        merchantId: token.merchantId,
        consumedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) throw new InvalidLoginError();
    await tx.session.create({
      data: {
        merchantId: token.merchantId,
        userId: token.user.id,
        tokenHash: hashToken(rawSession),
        expiresAt: new Date(now.getTime() + SESSION_SECONDS * 1000),
      },
    });
    await tx.auditLog.create({
      data: {
        merchantId: token.merchantId,
        actorType: "USER",
        actorUserId: token.user.id,
        action: "AUTH_LOGIN",
        correlationId: crypto.randomUUID(),
        redactedMetadataJson: { method: "ONE_TIME_LINK" },
      },
    });
  });
  return rawSession;
}

export async function findPrincipal(
  db: PrismaClient,
  rawSession: string | undefined,
) {
  if (!rawSession || !opaqueTokenSchema.safeParse(rawSession).success)
    return null;
  const session = await db.session.findFirst({
    where: {
      tokenHash: hashToken(rawSession),
      expiresAt: { gt: new Date() },
      revokedAt: null,
    },
    include: { user: { include: { merchant: true } } },
  });
  if (!session || session.user.disabledAt) return null;
  return {
    userId: session.userId,
    merchantId: session.merchantId,
    role: session.user.role,
    email: session.user.email,
    merchantName: session.user.merchant.name,
  };
}

export type Principal = NonNullable<Awaited<ReturnType<typeof findPrincipal>>>;

export async function revokeSession(
  db: PrismaClient,
  rawSession: string | undefined,
) {
  if (!rawSession || !opaqueTokenSchema.safeParse(rawSession).success) return;
  await db.session.updateMany({
    where: { tokenHash: hashToken(rawSession), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function requireAdmin(principal: Principal) {
  if (principal.role !== "ADMIN")
    throw new Error("Administrator access required");
}
