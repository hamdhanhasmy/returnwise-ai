import { publicDemoEnabled, publicAnalytics } from "@/lib/demo/analytics";
export async function GET(request: Request) {
  if (!publicDemoEnabled())
    return Response.json({ error: "Not found" }, { status: 404 });
  try {
    return Response.json(
      publicAnalytics(Object.fromEntries(new URL(request.url).searchParams)),
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  } catch {
    return Response.json(
      { error: "Invalid public analytics filter" },
      { status: 400 },
    );
  }
}
