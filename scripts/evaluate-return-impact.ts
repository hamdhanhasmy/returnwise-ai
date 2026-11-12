import { scriptDatabase } from "./database";
import { demoIds } from "../prisma/fixtures";
import { modeledImpact } from "../src/lib/returns/impact";
import type { Evaluation } from "../src/lib/returns/engine";
const db = scriptDatabase();
try {
  const cases = await db.returnCase.findMany({
    where: {
      merchantId: demoIds.merchant,
      order: {
        publicOrderNumber: { in: ["RW-DEMO-A", "RW-DEMO-B", "RW-DEMO-C"] },
        origin: "SIMULATED",
      },
    },
    include: {
      order: { select: { publicOrderNumber: true } },
      evaluations: { orderBy: { caseVersion: "desc" }, take: 1 },
    },
  });
  if (cases.length !== 3 || cases.some((c) => !c.evaluations.length))
    throw Error("missing scenarios");
  console.log(
    JSON.stringify(
      {
        cases: cases.map((c) => ({
          order: c.order.publicOrderNumber,
          result: c.evaluations[0]!.result,
        })),
        summary: modeledImpact(
          cases.map((c) => c.evaluations[0]!.result as unknown as Evaluation),
        ),
        notice:
          "Synthetic modeled costs, not measured merchant savings. No provider requests.",
      },
      null,
      2,
    ),
  );
} catch {
  console.error(
    "Impact evaluation requires the three existing returns:seed scenarios. Nothing was changed.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
