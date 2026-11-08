import { seedDatabase } from "../../prisma/seed-data";
import { testDatabase } from "../../scripts/test-database";
export default async function setup() {
  const db = await testDatabase();
  try {
    await seedDatabase(db);
  } finally {
    await db.$disconnect();
  }
}
