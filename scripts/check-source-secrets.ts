import "dotenv/config";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
const names = [
  "PAYPAL_CLIENT_SECRET",
  "DEEPSEEK_API_KEY",
  "SUPABASE_SECRET_KEY",
  "NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY",
  "DATABASE_URL",
  "DATABASE_MIGRATION_URL",
  "RENDER_API_KEY",
];
try {
  const paths = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean);
  const checked = names.filter(
      (name) => (process.env[name]?.length ?? 0) >= 12,
    ),
    leaked = new Set<string>();
  for (const path of paths) {
    const bytes = await readFile(path);
    for (const name of checked)
      if (bytes.includes(Buffer.from(process.env[name]!))) leaked.add(name);
  }
  console.log(
    JSON.stringify({
      sourceFilesScanned: paths.length,
      configuredSecretNamesChecked: checked,
      leakedSecretNames: [...leaked],
    }),
  );
  if (leaked.size) process.exitCode = 1;
} catch {
  console.error("Source secret scan unavailable; credentials withheld.");
  process.exitCode = 1;
}
