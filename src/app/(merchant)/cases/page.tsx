import { requirePrincipal } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { listCases } from "@/server/services/merchant";
import { PageHeading } from "@/components/page-heading";
import { CasesTable } from "@/components/cases-table";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

export default async function CasesPage() {
  const principal = await requirePrincipal();
  const cases = await listCases(getDb(), principal);
  return (
    <>
      <PageHeading
        eyebrow="Return cases"
        title="Every return starts with a story."
        description="Explore your merchant’s illustrative cases. Decisions and payment execution will follow in later phases."
      />
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-sm">
            Case queue{" "}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {cases.length} shown · up to 50 newest
            </span>
          </CardTitle>
        </CardHeader>
        <CasesTable cases={cases} />
      </Card>
    </>
  );
}
