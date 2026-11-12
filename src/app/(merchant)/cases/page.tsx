import { requirePrincipal } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { listCases } from "@/server/services/merchant";
import { PageHeading } from "@/components/page-heading";
import { CasesTable } from "@/components/cases-table";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const principal = await requirePrincipal();
  const page = Math.max(
    1,
    Math.min(100000, Math.floor(Number((await searchParams).page) || 1)),
  );
  const cases = await listCases(getDb(), principal, page);
  return (
    <>
      <PageHeading
        eyebrow="Return cases"
        title="Every return starts with a story."
        description="Review customer issues, policy eligibility and estimated outcomes. Case approval never sends a payment."
      />
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-sm">
            Case queue{" "}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {cases.length} shown · page {page}
            </span>
          </CardTitle>
        </CardHeader>
        <CasesTable cases={cases} />
      </Card>
      <nav aria-label="Case pages" className="mt-6 flex gap-6">
        {page > 1 && <Link href={`?page=${page - 1}`}>Previous</Link>}
        {cases.length === 25 && <Link href={`?page=${page + 1}`}>Next</Link>}
      </nav>
    </>
  );
}
