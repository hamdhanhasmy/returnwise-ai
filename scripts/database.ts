import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { requireDatabaseUrl } from "../src/lib/validation/env";
export function scriptDatabase(url = requireDatabaseUrl()) {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: url,
      // adapter-pg serializes UTC wall time and normalizes returned offsets to UTC.
      // The PostgreSQL session must therefore use UTC as well.
      options: "-c timezone=UTC",
      max: 3,
      connectionTimeoutMillis: 3000,
      statement_timeout: 5000,
    }),
    log: [],
  });
}
