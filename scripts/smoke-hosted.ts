export {};
const value = process.argv.find((a) => a.startsWith("--url="))?.slice(6);
try {
  const origin = new URL(value ?? "");
  if (
    origin.protocol !== "https:" ||
    !origin.hostname.endsWith(".onrender.com") ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw Error("Assigned Render HTTPS origin required");
  const results: { path: string; status: number }[] = [];
  for (const [path, expected] of [
    ["/", 200],
    ["/demo", 200],
    ["/demo/cases/verified-sandbox-bowl", 200],
    ["/demo/evidence", 200],
    ["/api/demo/analytics", 200],
    ["/api/health", 200],
    ["/api/analytics", 401],
    ["/api/payments", 405],
  ] as const) {
    const response = await fetch(new URL(path, origin), {
      signal: AbortSignal.timeout(90000),
    });
    results.push({ path, status: response.status });
    if (response.status !== expected) throw Error("Unexpected hosted response");
  }
  // Invalid empty input and no session: rejects before provider construction or operation validation.
  const denied = await fetch(new URL("/api/payments", origin), {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin.origin },
    body: "{}",
    signal: AbortSignal.timeout(15000),
  });
  if (denied.status !== 401)
    throw Error("Unauthenticated payment request not denied");
  console.log(
    JSON.stringify({
      origin: origin.origin,
      publicHttpsVerified: true,
      results,
      unauthenticatedPaymentStatus: denied.status,
      providerCalls: 0,
      authenticatedUploadVerified: false,
      restartPersistenceVerified: false,
    }),
  );
} catch {
  console.error(
    "Hosted HTTPS smoke failed or URL missing. No deployment success, authenticated storage, provider operation or restart persistence is claimed.",
  );
  process.exitCode = 1;
}
