import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { resolutions } from "@/lib/returns/contracts";
import { ReturnService } from "@/server/services/returns";
import { returnActor, returnFailure } from "@/server/return-http";
import { json, readJson } from "@/server/payment-http";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const p = await returnActor(request);
    const body = z
      .object({
        action: z.enum([
          "evaluate",
          "manual-review",
          "request-information",
          "propose",
          "approve",
          "reject",
          "close",
        ]),
        version: z.number().int().nonnegative(),
        note: z.string().max(1500).default(""),
        resolution: z.enum(resolutions).optional(),
        rightsConfirmed: z.boolean().optional(),
      })
      .strict()
      .parse(await readJson(request));
    return json(
      await new ReturnService(getDb()).command(
        p,
        (await context.params).id,
        body,
      ),
    );
  } catch (e) {
    return returnFailure(e);
  }
}
