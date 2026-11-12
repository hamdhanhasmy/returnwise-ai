import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { hashToken } from "@/lib/auth/tokens";
import { CustomerRateLimit } from "@/lib/returns/rate-limit";
import { ReturnService } from "@/server/services/returns";
import { invariant } from "@/server/services/payment-rules";
import { requireReturnOrigin, returnFailure } from "@/server/return-http";
import { json, readJson } from "@/server/payment-http";
const limit = new CustomerRateLimit();
const schema = z
  .object({
    action: z.enum(["view", "submit", "accept", "decline", "information"]),
    token: z.string().max(256),
    submission: z.unknown().optional(),
    version: z.number().int().nonnegative().optional(),
    proposalId: z.uuid().optional(),
    termsHash: z.string().length(64).optional(),
    message: z.string().max(1500).optional(),
  })
  .strict();
export async function POST(request: Request) {
  try {
    requireReturnOrigin(request);
    const body = schema.parse(await readJson(request, 12000));
    invariant(
      limit.allow(hashToken(body.token)),
      "RATE_LIMITED",
      "Too many requests. Wait a minute and retry.",
      429,
    );
    const service = new ReturnService(getDb());
    if (body.action === "view")
      return json(await service.customerView(body.token));
    if (body.action === "submit")
      return json(await service.submit(body.token, body.submission), 201);
    invariant(
      body.version !== undefined,
      "INVALID_INPUT",
      "Case version is required",
      400,
    );
    return json(
      await service.customerRespond(body.token, {
        ...body,
        action: body.action,
        version: body.version,
      }),
    );
  } catch (e) {
    return returnFailure(e);
  }
}
