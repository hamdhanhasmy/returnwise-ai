export function renderOwnerUrl(
  env: Record<string, string | undefined> = process.env,
) {
  try {
    const url = new URL(env.DATABASE_MIGRATION_URL ?? "");
    const runtime = new URL(env.DATABASE_URL ?? "");
    if (
      url.toString() !== runtime.toString() ||
      url.protocol !== "postgresql:" ||
      !url.hostname.endsWith(".render.com") ||
      url.pathname !== "/returnwise_hosted" ||
      !url.username ||
      url.username === "returnwise_runtime" ||
      !url.password ||
      url.hash
    )
      throw Error(
        "Expected matching external owner URLs for the dedicated hosted Render database",
      );
    if (!url.searchParams.has("sslmode"))
      url.searchParams.set("sslmode", "verify-full");
    if (!["verify-full", "require"].includes(url.searchParams.get("sslmode")!))
      throw Error("External hosted connections require TLS");
    return url;
  } catch {
    throw Error(
      "Invalid hosted Render owner connection configuration; values withheld",
    );
  }
}
