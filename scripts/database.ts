import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { requireDatabaseUrl } from "../src/lib/validation/env";
export function scriptDatabase(url = requireDatabaseUrl()) {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: url,
      max: 3,
      connectionTimeoutMillis: 3000,
      statement_timeout: 5000,
    }),
    log: [],
  });
}
