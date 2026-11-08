import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  // Generate/validate/build work without a running DB; migrations require a real URL.
  datasource: {
    url:
      process.env.DATABASE_MIGRATION_URL ??
      process.env.DATABASE_URL ??
      "postgresql://unconfigured:unconfigured@127.0.0.1:5432/unconfigured",
  },
});
