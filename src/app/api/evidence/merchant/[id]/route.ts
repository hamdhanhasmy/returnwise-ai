import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { CustomerRateLimit } from "@/lib/returns/rate-limit";
import { EvidenceService } from "@/server/services/evidence";
import { invariant } from "@/server/services/payment-rules";
import { returnActor, returnFailure } from "@/server/return-http";
import { json, readJson } from "@/server/payment-http";
import { imageResponse } from "@/server/evidence-http";
export const runtime = "nodejs";
const limit = new CustomerRateLimit();
const schema = z
  .object({
    action: z.enum(["view", "analyze", "review", "image"]),
    revision: z.number().int().nonnegative().optional(),
    note: z.string().max(1500).optional(),
    imageId: z.uuid().optional(),
    inference: z.boolean().optional(),
  })
  .strict();
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const p = await returnActor(request);
    invariant(
      limit.allow(p.userId),
      "RATE_LIMITED",
      "Too many analysis requests; wait a minute",
      429,
    );
    const id = z.uuid().parse((await params).id),
      body = schema.parse(await readJson(request, 3000)),
      service = new EvidenceService(getDb());
    if (body.action === "view") return json(await service.view(p, id));
    if (body.action === "analyze") return json(await service.analyze(p, id));
    if (body.action === "image") {
      invariant(body.imageId, "INVALID_INPUT", "Image ID required", 400);
      return imageResponse(
        await service.merchantImage(p, id, body.imageId, body.inference),
      );
    }
    invariant(
      body.revision !== undefined && body.note,
      "INVALID_INPUT",
      "Review note and current revision required",
      400,
    );
    return json(await service.review(p, id, body.revision, body.note));
  } catch (e) {
    return returnFailure(e);
  }
}
