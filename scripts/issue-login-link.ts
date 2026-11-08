import { z } from "zod";
import { scriptDatabase } from "./database";
import { issueLoginToken } from "../src/server/services/auth";
import { parseEnvironment } from "../src/lib/validation/env";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const index = arg.indexOf("=");
    return [arg.slice(2, index), arg.slice(index + 1)];
  }),
);
const parsed = z
  .object({ email: z.email(), merchant: z.uuid() })
  .safeParse(args);
if (!parsed.success) {
  console.error(
    "Usage: npm run auth:link -- --email=admin@example.invalid --merchant=<merchant-uuid>",
  );
  process.exit(1);
}
const db = scriptDatabase();
try {
  const token = await issueLoginToken(
    db,
    parsed.data.merchant,
    parsed.data.email,
  );
  const origin = new URL(parseEnvironment(process.env).APP_BASE_URL).origin;
  // Explicit local CLI credential handoff; never invoke this from an HTTP handler or CI logs.
  console.log(
    "Private single-use sign-in link (15 minutes). Do not share or commit:",
  );
  console.log(`${origin}/login#token=${token}`);
} catch {
  console.error(
    "Could not issue a sign-in link. Verify the merchant/user and database setup.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
