import "dotenv/config";
import { verifyTestDatabase } from "./test-database";
import { runLocal } from "./run-local";
// No migration process is spawned until configuration and live identity pass.
const url = await verifyTestDatabase();
runLocal("prisma/build/index.js", ["migrate", "deploy"], {
  ...process.env,
  DATABASE_URL: url,
  DATABASE_MIGRATION_URL: url,
});
