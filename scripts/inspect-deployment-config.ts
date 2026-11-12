import { readFile } from "node:fs/promises";
import { parse } from "dotenv";
for (const file of [".env", ".env.render"]) {
  try {
    const env = parse(await readFile(file));
    const urls: URL[] = [];
    for (const name of [
      "DATABASE_URL",
      ...(file === ".env"
        ? ["TEST_DATABASE_URL"]
        : ["DATABASE_MIGRATION_URL", "RENDER_INTERNAL_DATABASE_URL"]),
    ]) {
      try {
        const u = new URL(env[name]!);
        urls.push(u);
        console.log(
          JSON.stringify({
            file,
            name,
            present: !!env[name],
            postgres: ["postgresql:", "postgres:"].includes(u.protocol),
            local: ["127.0.0.1", "localhost"].includes(u.hostname),
            renderExternal: u.hostname.endsWith(".render.com"),
            expectedHostedName: u.pathname === "/returnwise_hosted",
            hasPassword: !!u.password,
          }),
        );
      } catch {
        console.log(
          JSON.stringify({ file, name, present: !!env[name], validUrl: false }),
        );
      }
    }
    if (file === ".env.render" && urls.length === 3)
      console.log(
        JSON.stringify({
          externalOwnerTargetsMatch:
            urls[0]!.hostname === urls[1]!.hostname &&
            urls[0]!.pathname === urls[1]!.pathname &&
            urls[0]!.username === urls[1]!.username &&
            urls[0]!.password === urls[1]!.password,
          internalOwnerMatches:
            urls[0]!.pathname === urls[2]!.pathname &&
            urls[0]!.username === urls[2]!.username &&
            urls[0]!.password === urls[2]!.password,
          adminEmailConfigured: !!env.HOSTED_ADMIN_EMAIL,
        }),
      );
    console.log(
      JSON.stringify({
        file,
        inheritedDatabaseSetting: !!process.env.DATABASE_URL,
        inheritedDatabaseMatchesFile: process.env.DATABASE_URL
          ? process.env.DATABASE_URL === env.DATABASE_URL
          : null,
      }),
    );
  } catch {
    console.log(JSON.stringify({ file, exists: false }));
  }
}
