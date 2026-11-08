import { scriptDatabase } from "../scripts/database";
import { seedDatabase } from "./seed-data";
const db = scriptDatabase();
try {
  await seedDatabase(db);
  console.log(
    "Seed complete: two merchants and four synthetic cases. No payment records created.",
  );
} catch {
  console.error(
    "Seed failed. Check database connectivity and migrations; existing data was not reset.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
