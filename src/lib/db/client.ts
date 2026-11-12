import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { requireDatabaseUrl } from "@/lib/validation/env";

const globalDb = globalThis as unknown as { returnwiseDb?: PrismaClient };

export function getDb() {
  if (!globalDb.returnwiseDb) {
    const adapter = new PrismaPg({
      connectionString: requireDatabaseUrl(),
      // Match adapter-pg's UTC date serialization/normalization, independently of host locale.
      options: "-c timezone=UTC",
      max: 5,
      connectionTimeoutMillis: 3000,
      statement_timeout: 5000,
    });
    globalDb.returnwiseDb = new PrismaClient({ adapter, log: [] });
  }
  return globalDb.returnwiseDb;
}
