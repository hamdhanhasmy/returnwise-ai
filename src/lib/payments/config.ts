import { z } from "zod";

export const PAYPAL_SANDBOX_ORIGIN = "https://api-m.sandbox.paypal.com";
const credential = z
  .string()
  .min(10)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/)
  .refine((value) => !/replace|placeholder/i.test(value));
const credentialsSchema = z.object({
  PAYPAL_ENV: z.literal("sandbox"),
  PAYPAL_CLIENT_ID: credential,
  PAYPAL_CLIENT_SECRET: credential,
});
const configSchema = credentialsSchema.extend({
  PAYPAL_MERCHANT_ID: z.string().regex(/^[A-Z0-9]{8,32}$/),
  PAYPAL_WEBHOOK_ID: z
    .string()
    .regex(/^[A-Za-z0-9-]{5,100}$/)
    .optional(),
});

/** OAuth readiness may be checked before merchant binding; it cannot execute payments. */
export function paypalCredentials(
  input: Record<string, string | undefined> = process.env,
) {
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success)
    throw new Error(
      "PayPal Sandbox OAuth credentials are missing or invalid; configure them locally",
    );
  return {
    clientId: parsed.data.PAYPAL_CLIENT_ID,
    clientSecret: parsed.data.PAYPAL_CLIENT_SECRET,
  };
}

export function paypalConfig(
  input: Record<string, string | undefined> = process.env,
) {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success)
    throw new Error(
      "PayPal sandbox configuration is missing or invalid; configure server credentials locally",
    );
  return {
    clientId: parsed.data.PAYPAL_CLIENT_ID,
    clientSecret: parsed.data.PAYPAL_CLIENT_SECRET,
    merchantId: parsed.data.PAYPAL_MERCHANT_ID,
    webhookId: parsed.data.PAYPAL_WEBHOOK_ID,
  };
}
export type PayPalConfig = ReturnType<typeof paypalConfig>;
