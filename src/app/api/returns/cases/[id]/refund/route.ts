import { z } from "zod";
import { returnActor } from "@/server/return-http";
import { json, readJson, paymentFailure } from "@/server/payment-http";
import { paymentService } from "@/server/paypal";
import { CaseRefundService } from "@/server/services/case-refunds";
export const runtime = "nodejs";
const schema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("execute"),
      version: z.number().int().nonnegative(),
      proposalId: z.uuid(),
      termsHash: z.string().regex(/^[a-f0-9]{64}$/),
      confirmed: z.literal(true),
      eligibilityConfirmed: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.literal("receipt"),
      version: z.number().int().nonnegative(),
      note: z.string().trim().min(10).max(1500),
    })
    .strict(),
  z
    .object({
      action: z.literal("reconcile"),
      retry: z.boolean().default(false),
    })
    .strict(),
]);
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const p = await returnActor(request),
      body = schema.parse(await readJson(request)),
      id = z.uuid().parse((await context.params).id),
      service = new CaseRefundService(paymentService());
    if (body.action === "receipt")
      return json(await service.receipt(p, id, body.version, body.note));
    if (body.action === "reconcile")
      return json(await service.reconcile(p, id, body.retry));
    return json(await service.execute(p, id, body));
  } catch (e) {
    return paymentFailure(e);
  }
}
