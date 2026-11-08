import { requirePrincipal } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getMerchantSettings } from "@/server/services/merchant";
import { PageHeading } from "@/components/page-heading";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
export default async function SettingsPage() {
  const principal = await requirePrincipal();
  const merchant = await getMerchantSettings(getDb(), principal);
  const policy = merchant.policies[0];
  return (
    <>
      <PageHeading
        eyebrow="Settings"
        title="Your workspace, at a glance."
        description="Read-only configuration for the foundation. Policy editing and provider setup are not enabled."
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
      <p className="mt-6 text-xs leading-6 text-muted-foreground">
        PayPal operations and AI requests are disabled in this version,
        regardless of environment credentials.
      </p>
    </>
  );
}
