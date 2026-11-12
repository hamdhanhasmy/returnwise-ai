import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parse } from "dotenv";

// Read-only release audit. No matched value or source line is ever printed.
const secretName =
  /^(?:PAYPAL_CLIENT_SECRET|DEEPSEEK_API_KEY|SUPABASE_SECRET_KEY|RENDER_API_KEY|DATABASE_URL|DATABASE_MIGRATION_URL|TEST_DATABASE_URL|RENDER_DATABASE_URL|RENDER_INTERNAL_DATABASE_URL|NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY)$/;
const known = new Map<string, Set<string>>();
function remember(name: string, value: string) {
  if (
    value.length < 12 ||
    /REPLACE_ME|replace_with|your-project|ci_only_not_a_real_secret/.test(value)
  )
    return;
  const names = known.get(value) ?? new Set<string>();
  names.add(name);
  known.set(value, names);
}
for (const file of [
  ".env",
  ".env.render",
  ".local/render-runtime.env",
  ".local/env-before-7a-repair.env",
  ".local/env-before-render-key-move.env",
]) {
  const bytes = await readFile(file).catch(() => null);
  if (!bytes) continue;
  for (const [name, value] of Object.entries(parse(bytes))) {
    if (!secretName.test(name)) continue;
    remember(name, value);
    if (/DATABASE_URL|DATABASE_MIGRATION_URL/.test(name)) {
      try {
        const url = new URL(value);
        remember(`${name}_PASSWORD`, decodeURIComponent(url.password));
      } catch {
        /* Invalid private input is not logged. */
      }
    }
  }
}
const git = (args: string[], input?: string) =>
  execFileSync("git", args, {
    ...(input === undefined ? {} : { input }),
    maxBuffer: 128 * 1024 * 1024,
  });
try {
  const tracked = git(["ls-files", "-z"])
    .toString()
    .split("\0")
    .filter(Boolean);
  const forbiddenTracked = tracked.filter(
    (p) =>
      (/(?:^|\/)\.env(?:\.|$)/.test(p) && p !== ".env.example") ||
      /^(?:\.local|artifacts|test-results|playwright-report)\//.test(p),
  );
  const findings: { location: string; names: string[] }[] = [];
  function scan(bytes: Buffer, location: string) {
    const names = new Set<string>();
    for (const [value, labels] of known)
      if (bytes.includes(Buffer.from(value)))
        for (const label of labels) names.add(label);
    // High-confidence real credential formats; generic fixture tokens are deliberately not asserted as secrets.
    const text = bytes.toString("utf8");
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text))
      names.add("PRIVATE_KEY_PATTERN");
    if (
      /\b(?:sb_secret_[A-Za-z0-9_-]{24,}|rnd_[A-Za-z0-9]{24,}|sk-proj-[A-Za-z0-9_-]{40,})\b/.test(
        text,
      )
    )
      names.add("PROVIDER_KEY_PATTERN");
    if (names.size) findings.push({ location, names: [...names] });
  }
  for (const path of tracked) scan(await readFile(path), path);
  const ids = [
    ...new Set(
      git(["rev-list", "--objects", "--all"])
        .toString()
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => line.split(" ")[0]!),
    ),
  ];
  const batch = git(["cat-file", "--batch"], ids.join("\n") + "\n");
  let offset = 0,
    blobs = 0;
  while (offset < batch.length) {
    const newline = batch.indexOf(10, offset);
    if (newline < 0) throw Error("Invalid object stream");
    const [id, type, sizeText] = batch
      .subarray(offset, newline)
      .toString()
      .split(" ");
    const size = Number(sizeText);
    if (!Number.isSafeInteger(size) || size < 0)
      throw Error("Invalid object size");
    const start = newline + 1,
      end = start + size;
    if (end >= batch.length) throw Error("Truncated object stream");
    if (type === "blob") {
      scan(batch.subarray(start, end), `git-blob:${id}`);
      blobs++;
    }
    offset = end + 1;
  }
  const report = {
    trackedFiles: tracked.length,
    reachableHistoryBlobs: blobs,
    knownValuesChecked: known.size,
    forbiddenTracked,
    findings,
    scope:
      "Current tracked files and all reachable local Git history; configured current/retired secrets plus selected key patterns. Not a proof of absence of every unknown secret.",
  };
  await mkdir(".local/evaluation", { recursive: true });
  await writeFile(
    ".local/evaluation/release-secret-scan.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
  if (findings.length || forbiddenTracked.length) process.exitCode = 1;
} catch {
  console.error(
    "Release secret audit unavailable; matched values/source lines withheld. No clean-history claim is made.",
  );
  process.exitCode = 1;
}
