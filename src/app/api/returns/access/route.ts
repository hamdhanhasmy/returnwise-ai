import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { ReturnService } from "@/server/services/returns";
import { returnActor, returnFailure } from "@/server/return-http";
import { json, readJson } from "@/server/payment-http";
export async function POST(request: Request) {
  try {
    const p = await returnActor(request);
    const body = z
      .object({ action: z.enum(["issue", "revoke"]), orderId: z.uuid() })
      .strict()
      .parse(await readJson(request));
    const service = new ReturnService(getDb());
    return json(
      body.action === "issue"
        ? await service.issueAccess(p, body.orderId)
        : await service.revokeAccess(p, body.orderId),
    );
  } catch (e) {
    return returnFailure(e);
  }
}
