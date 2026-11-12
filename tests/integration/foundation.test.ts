import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../../scripts/test-database";
import { seedDatabase } from "../../prisma/seed-data";
import { demoIds } from "../../prisma/fixtures";
import {
  consumeLoginToken,
  findPrincipal,
  issueLoginToken,
  requireAdmin,
  revokeSession,
} from "@/server/services/auth";
import { getCase, listCases } from "@/server/services/merchant";
import { hashToken, newToken } from "@/lib/auth/tokens";

// The factory also guards direct suite execution under a different runner/config.
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  db = await testDatabase();
  await seedDatabase(db);
});
afterAll(async () => {
  await db?.$disconnect();
});

async function adminPrincipal() {
  const token = await issueLoginToken(
    db,
    demoIds.merchant,
    "admin@oakandloom.example",
  );
  const session = await consumeLoginToken(db, token);
  return { session, principal: (await findPrincipal(db, session))! };
}

describe("PostgreSQL identity and tenant constraints", () => {
  it("stores actual UTC instants rather than only round-tripping local wall time", async () => {
    const instant = new Date("2026-11-09T16:30:00.123Z");
    const record = await db.auditLog.create({
      data: {
        merchantId: demoIds.merchant,
        actorType: "SYSTEM",
        action: "UTC_TIMESTAMP_REGRESSION",
        correlationId: randomUUID(),
        createdAt: instant,
        redactedMetadataJson: {},
      },
    });
    const [stored] = await db.$queryRaw<{ zone: string; epoch: number }[]>`
      SELECT current_setting('TimeZone') AS zone,
             (extract(epoch from "createdAt") * 1000)::double precision AS epoch
      FROM "AuditLog" WHERE id = ${record.id}::uuid
    `;
    expect(stored?.zone).toBe("UTC");
    expect(stored?.epoch).toBe(instant.getTime());
    expect(record.createdAt.toISOString()).toBe(instant.toISOString());
  });
  it("seeds idempotently and stores only token hashes", async () => {
    const before = await db.returnCase.count();
    await seedDatabase(db);
    expect(await db.returnCase.count()).toBe(before);
    const token = await issueLoginToken(
      db,
      demoIds.merchant,
      "admin@oakandloom.example",
    );
    const stored = await db.accessToken.findUniqueOrThrow({
      where: { tokenHash: hashToken(token) },
    });
    expect(stored.tokenHash).not.toBe(token);
    expect(stored.purpose).toBe("MERCHANT_LOGIN");
  });
  it("consumes one link exactly once even under concurrent requests", async () => {
    const token = await issueLoginToken(
      db,
      demoIds.merchant,
      "admin@oakandloom.example",
    );
    const outcomes = await Promise.allSettled([
      consumeLoginToken(db, token),
      consumeLoginToken(db, token),
    ]);
    expect(
      outcomes.filter((value) => value.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      outcomes.filter((value) => value.status === "rejected"),
    ).toHaveLength(1);
    await expect(consumeLoginToken(db, token)).rejects.toThrow(
      "invalid or expired",
    );
  });
  it("rejects expired, revoked, malformed and wrong-purpose links", async () => {
    for (const kind of ["expired", "revoked", "wrong-purpose"]) {
      const token = newToken();
      await db.accessToken.create({
        data: {
          merchantId: demoIds.merchant,
          tokenHash: hashToken(token),
          purpose:
            kind === "wrong-purpose" ? "CUSTOMER_INTAKE" : "MERCHANT_LOGIN",
          userId: kind === "wrong-purpose" ? null : demoIds.admin,
          orderId:
            kind === "wrong-purpose"
              ? "11111111-1111-4111-8111-111111111141"
              : null,
          createdAt: new Date(Date.now() - 120000),
          expiresAt: new Date(
            Date.now() + (kind === "expired" ? -60000 : 60000),
          ),
          revokedAt: kind === "revoked" ? new Date() : null,
        },
      });
      await expect(consumeLoginToken(db, token)).rejects.toThrow(
        "invalid or expired",
      );
    }
    await expect(consumeLoginToken(db, "bad")).rejects.toThrow();
  });
  it("revokes sessions and rejects missing, expired and disabled-user sessions", async () => {
    expect(await findPrincipal(db, undefined)).toBeNull();
    const { session } = await adminPrincipal();
    await revokeSession(db, session);
    expect(await findPrincipal(db, session)).toBeNull();
    const expired = await adminPrincipal();
    await db.session.updateMany({
      where: { tokenHash: hashToken(expired.session) },
      data: { expiresAt: new Date(0) },
    });
    expect(await findPrincipal(db, expired.session)).toBeNull();
    const disabledId = randomUUID();
    await db.user.create({
      data: {
        id: disabledId,
        merchantId: demoIds.merchant,
        email: `disabled-${disabledId}@example.invalid`,
        role: "STAFF",
        disabledAt: new Date(),
      },
    });
    const raw = newToken();
    await db.session.create({
      data: {
        merchantId: demoIds.merchant,
        userId: disabledId,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    expect(await findPrincipal(db, raw)).toBeNull();
  });
  it("keeps tenant B cases invisible to tenant A and denies staff admin access", async () => {
    const { principal } = await adminPrincipal();
    expect(await getCase(db, principal, demoIds.otherCase)).toBeNull();
    expect(await getCase(db, principal, "not-a-uuid")).toBeNull();
    const records = await listCases(db, principal);
    expect(records).toHaveLength(3);
    expect(
      records.every((record) => record.merchantId === demoIds.merchant),
    ).toBe(true);
    expect(() => requireAdmin({ ...principal, role: "STAFF" })).toThrow(
      "Administrator",
    );
  });
  it("rejects cross-tenant relationships in the database", async () => {
    await expect(
      db.session.create({
        data: {
          merchantId: demoIds.merchant,
          userId: demoIds.otherAdmin,
          tokenHash: hashToken(newToken()),
          expiresAt: new Date(Date.now() + 60000),
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.returnCase.create({
        data: {
          merchantId: demoIds.otherMerchant,
          orderId: "11111111-1111-4111-8111-111111111141",
          policyId: demoIds.otherPolicy,
          reason: "OTHER",
          description: "Forbidden tenant link",
          customerClaim: {},
        },
      }),
    ).rejects.toThrow();
  });
  it("enforces money, one active case per order, token targets and append-only audit", async () => {
    await expect(
      db.product.create({
        data: {
          merchantId: demoIds.merchant,
          sku: randomUUID(),
          name: "Invalid amount",
          category: "Home",
          currency: "USD",
          saleAmountMinor: -1n,
          recoveryValueMinor: 0n,
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.returnCase.create({
        data: {
          merchantId: demoIds.merchant,
          orderId: "11111111-1111-4111-8111-111111111141",
          policyId: demoIds.policy,
          reason: "OTHER",
          description: "Duplicate active case",
          customerClaim: {},
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.accessToken.create({
        data: {
          merchantId: demoIds.merchant,
          purpose: "MERCHANT_LOGIN",
          tokenHash: hashToken(newToken()),
          expiresAt: new Date(Date.now() + 60000),
        },
      }),
    ).rejects.toThrow();
    const event = await db.auditLog.create({
      data: {
        merchantId: demoIds.merchant,
        actorType: "SYSTEM",
        action: "TEST_APPEND_ONLY",
        correlationId: randomUUID(),
        redactedMetadataJson: {},
      },
    });
    await expect(
      db.auditLog.update({
        where: { id: event.id },
        data: { action: "REWRITE" },
      }),
    ).rejects.toThrow();
    await expect(
      db.auditLog.delete({ where: { id: event.id } }),
    ).rejects.toThrow();
  });
});
