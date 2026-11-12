import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { publicDemoEnabled } from "@/lib/demo/analytics";
export const runtime = "nodejs";
export async function GET() {
  if (!publicDemoEnabled()) return new Response(null, { status: 404 });
  // Fixed committed synthetic asset only. No user path, database evidence or storage key.
  const bytes = await readFile(
    join(process.cwd(), "assets/demo/synthetic-broken-bowl.png"),
  );
  return new Response(bytes, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
