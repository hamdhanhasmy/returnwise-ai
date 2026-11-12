import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { hashToken } from "@/lib/auth/tokens";
import { CustomerRateLimit } from "@/lib/returns/rate-limit";
import { EvidenceService } from "@/server/services/evidence";
import { invariant } from "@/server/services/payment-rules";
import { requireReturnOrigin, returnFailure } from "@/server/return-http";
import { readJson, json } from "@/server/payment-http";
import { imageResponse, readImage } from "@/server/evidence-http";
export const runtime = "nodejs";
const limit = new CustomerRateLimit();
let decoding = 0;
const schema = z
  .object({
    action: z.enum(["view", "consent", "remove", "image"]),
    enabled: z.boolean().optional(),
    noticeVersion: z.string().max(80).optional(),
    id: z.uuid().optional(),
    inference: z.boolean().optional(),
  })
  .strict();
export async function POST(request: Request) {
  try {
    requireReturnOrigin(request);
    const raw =
      request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    invariant(
      limit.allow(hashToken(raw)),
      "RATE_LIMITED",
      "Too many evidence requests; wait a minute",
      429,
    );
    const service = new EvidenceService(getDb());
    if (request.headers.get("content-type")?.startsWith("image/")) {
      await service.customerView(raw);
      invariant(
        decoding < 2,
        "RATE_LIMITED",
        "Image processor busy; try again shortly",
        429,
      );
      decoding++;
      try {
        return json(
          await service.upload(
            raw,
            await readImage(request),
            request.headers.get("content-type")!,
            request.headers.get("x-storage-consent") === "true",
          ),
          201,
        );
      } finally {
        decoding--;
      }
    }
    const body = schema.parse(await readJson(request, 1500));
    if (body.action === "view") return json(await service.customerView(raw));
    if (body.action === "consent") {
      invariant(
        body.enabled !== undefined && body.noticeVersion,
        "INVALID_INPUT",
        "Consent choice required",
        400,
      );
      return json(await service.consent(raw, body.enabled, body.noticeVersion));
    }
    invariant(body.id, "INVALID_INPUT", "Evidence ID required", 400);
    if (body.action === "image")
      return imageResponse(
        await service.customerImage(raw, body.id, body.inference),
      );
    return json(await service.remove(raw, body.id));
  } catch (e) {
    return returnFailure(e);
  }
}
