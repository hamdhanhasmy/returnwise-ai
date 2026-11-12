import { requirePrincipal } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getMerchantSettings } from "@/server/services/merchant";
import { PageHeading } from "@/components/page-heading";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PolicyForm } from "@/components/returns/policy-form";
import {
  returnPolicySchema,
  conservativePolicy,
} from "@/lib/returns/contracts";
export default async function SettingsPage() {
  const principal = await requirePrincipal();
  const merchant = await getMerchantSettings(getDb(), principal);
  const policy = merchant.policies[0];
  const returns = await getDb().merchantPolicy.findFirst({
    where: { merchantId: principal.merchantId, usage: "RETURNS" },
    orderBy: { version: "desc" },
  });
  const parsed = returnPolicySchema.safeParse(returns?.returnRules);
  return (
    <>
      <PageHeading
        eyebrow="Settings"
        title="Your workspace, at a glance."
        description="Versioned return policies and merchant configuration. Sandbox account binding is managed by the local operator."
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Merchant workspace</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-5 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Merchant</dt>
                <dd className="mt-1 font-medium">{merchant.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Your role</dt>
                <dd className="mt-1">
                  {principal.role === "ADMIN" ? "Administrator" : "Staff"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Environment</dt>
                <dd className="mt-2">
                  <Badge>Sandbox only</Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  Payment authorization
                </dt>
                <dd className="mt-1">
                  {merchant.paymentsEnabled
                    ? "Sandbox merchant enabled; provider verification required"
                    : "Disabled — local Sandbox setup required"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Illustrative policy</CardTitle>
          </CardHeader>
          <CardContent>
            {policy ? (
              <dl className="space-y-5 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Policy version
                  </dt>
                  <dd className="mt-1">
                    {policy.version} · Synthetic demonstration
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Return window
                  </dt>
                  <dd className="mt-1">{policy.returnWindowDays} days</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Eligible categories
                  </dt>
                  <dd className="mt-1">
                    {policy.eligibleCategories.join(", ")}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">
                No policy configured.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="mt-8">
        <PolicyForm
          policy={parsed.success ? parsed.data : conservativePolicy}
          version={returns?.version}
          editable={principal.role === "ADMIN"}
        />
      </div>
      <p className="mt-6 text-xs leading-6 text-muted-foreground">
        PayPal operations require configured Sandbox credentials and an enabled
        merchant. AI requests remain disabled. Provider outcomes are shown only
        in Transactions.
      </p>
    </>
  );
}
