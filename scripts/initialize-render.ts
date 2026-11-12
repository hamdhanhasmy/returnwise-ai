import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { z } from "zod";
import { scriptDatabase } from "./database";
import { renderOwnerUrl } from "./render-database";
// Purpose-built operator initialization, NOT the development/test fixture seed.
const source = renderOwnerUrl();
const db = scriptDatabase(source.toString());
let stage = "configuration";
try {
  stage = "explicit flag";
  if (!process.argv.includes("--initialize"))
    throw Error("Explicit initialization required");
  if (
    !source.hostname.endsWith(".render.com") ||
    source.pathname !== "/returnwise_hosted" ||
    source.protocol !== "postgresql:"
  )
    throw Error("Expected the dedicated hosted Render database");
  stage = "admin email validation";
  const email = z.email().parse(process.env.HOSTED_ADMIN_EMAIL).toLowerCase();
  stage = "internal owner URL validation";
  const internal = new URL(process.env.RENDER_INTERNAL_DATABASE_URL ?? "");
  if (
    internal.pathname !== source.pathname ||
    internal.username !== source.username ||
    internal.password !== source.password
  )
    throw Error("Internal/external owner connections must match");
  const password = randomBytes(32).toString("hex");
  const runtimeExternal = new URL(source),
    runtimeInternal = new URL(internal);
  for (const url of [runtimeExternal, runtimeInternal]) {
    url.username = "returnwise_runtime";
    url.password = password;
  }
  const result = await db.$transaction(
    async (tx) => {
      stage = "empty-database verification";
      const current = await tx.$queryRaw<
        { name: string }[]
      >`SELECT current_database() AS name`;
      if (
        current[0]?.name !== "returnwise_hosted" ||
        (await tx.merchant.count())
      )
        throw Error(
          "Initialization requires a migrated empty hosted database; no data will be reset",
        );
      const role = await tx.$queryRaw<
        { rolname: string }[]
      >`SELECT rolname FROM pg_roles WHERE rolname='returnwise_runtime'`;
      if (role.length)
        throw Error(
          "Runtime role already exists; do not replace credentials automatically",
        );
      stage = "runtime role creation";
      // Password is generated hexadecimal, never user/AI text; PostgreSQL role DDL cannot bind parameters.
      await tx.$executeRawUnsafe(
        `CREATE ROLE returnwise_runtime LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${password}'`,
      );
      stage = "runtime privilege grants";
      await tx.$executeRaw`GRANT CONNECT ON DATABASE returnwise_hosted TO returnwise_runtime`;
      await tx.$executeRaw`GRANT USAGE ON SCHEMA public TO returnwise_runtime`;
      await tx.$executeRaw`GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO returnwise_runtime`;
      await tx.$executeRaw`REVOKE UPDATE ON "AuditLog" FROM returnwise_runtime`;
      await tx.$executeRaw`REVOKE ALL ON "_prisma_migrations" FROM returnwise_runtime`;
      await tx.$executeRaw`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO returnwise_runtime`;
      await tx.$executeRaw`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO returnwise_runtime`;
      stage = "authorized merchant creation";
      const merchant = await tx.merchant.create({
        data: {
          name: "Oak & Loom — authorized Sandbox workspace",
          sandboxAccountAlias:
            "Sandbox only; public demo has no merchant access",
        },
      });
      await tx.user.create({
        data: { merchantId: merchant.id, email, role: "ADMIN" },
      });
      stage = "private runtime-file write and commit";
      // Save generated connections only to an ignored local operator file; never stdout.
      await mkdir(".local", { recursive: true });
      await writeFile(
        ".local/render-runtime.env",
        `DATABASE_URL=${runtimeExternal.toString()}\nRENDER_DATABASE_URL=${runtimeInternal.toString()}\n`,
        { flag: "wx", mode: 0o600 },
      );
      return merchant.id;
    },
    { timeout: 60000, maxWait: 30000 },
  );
  console.log(
    JSON.stringify({
      initialized: true,
      merchantId: result,
      paymentsEnabled: false,
      adminCreated: true,
      runtimeOwner: false,
      privateRuntimeConnectionsFile: ".local/render-runtime.env",
      providerCalls: 0,
      fixtureRows: 0,
    }),
  );
} catch (e) {
  const code =
    e &&
    typeof e === "object" &&
    "code" in e &&
    typeof e.code === "string" &&
    /^[A-Z0-9_]{2,12}$/.test(e.code)
      ? e.code
      : "WITHHELD";
  console.error(JSON.stringify({ stage, code }));
  console.error(
    "Hosted initialization stopped safely. Check the explicit flag, empty migrated Render database, matching internal/external owner URLs and private admin email. Existing data/roles were not reset; no provider call was made. If transaction commit is uncertain, inspect before retrying.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
