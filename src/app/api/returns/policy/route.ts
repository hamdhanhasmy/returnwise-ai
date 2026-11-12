import { getDb } from "@/lib/db/client";
import { ReturnService } from "@/server/services/returns";
import { returnActor, returnFailure } from "@/server/return-http";
import { json, readJson } from "@/server/payment-http";
export async function POST(request: Request) {
  try {
    const p = await returnActor(request);
    const policy = await new ReturnService(getDb()).savePolicy(
      p,
      await readJson(request, 16000),
    );
    return json({ version: policy.version }, 201);
  } catch (e) {
    return returnFailure(e);
  }
}
