import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
// Read-only release check. Never print configured secret values.
async function files(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true });
  const results = await Promise.all(
    entries.map((e) =>
      e.isDirectory()
        ? files(join(path, e.name))
        : Promise.resolve([join(path, e.name)]),
    ),
  );
  return results.flat();
}
try {
  const paths = await files(".next/static");
  const secrets = ["PAYPAL_CLIENT_SECRET", "DEEPSEEK_API_KEY", "SUPABASE_SECRET_KEY"].filter(
    (name) => (process.env[name]?.length ?? 0) >= 8,
  );
  const leaked = new Set<string>();
  for (const path of paths) {
    if (!/\.(js|mjs|css|json|map)$/.test(path)) continue;
    const contents = await readFile(path, "utf8");
    for (const name of secrets)
      if (contents.includes(process.env[name]!)) leaked.add(name);
  }
  if (leaked.size) {
    console.error(
      `Client build contains configured secret(s): ${[...leaked].join(", ")}. Values are withheld.`,
    );
    process.exitCode = 1;
  } else
    console.log(
      JSON.stringify({
        scannedClientFiles: paths.length,
        configuredSecretNamesChecked: secrets,
        leakedSecrets: 0,
      }),
    );
} catch {
  console.error(
    "Client secret scan unavailable. Build the application first; no secret value was printed.",
  );
  process.exitCode = 1;
}
