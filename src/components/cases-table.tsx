import Link from "next/link";
import { ArrowUpRight, Package } from "lucide-react";
import type { listCases } from "@/server/services/merchant";
import { formatUsd } from "@/lib/money";
import { Badge } from "@/components/ui/badge";

type CaseRow = Awaited<ReturnType<typeof listCases>>[number];
export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      className={
        status === "MANUAL_REVIEW"
          ? "border-[#edd9ac] bg-[#fcf5e7] text-[#805d17]"
          : "border-border bg-muted text-muted-foreground"
      }
    >
      <span className="size-1 rounded-full bg-current" />
      {status.toLowerCase().replaceAll("_", " ")}
    </Badge>
  );
}

export function CasesTable({ cases }: { cases: CaseRow[] }) {
  if (!cases.length)
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        No return cases yet. Your workspace is ready for its first case.
      </div>
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-150 text-left text-xs">
        <caption className="sr-only">
          Return cases from this merchant&apos;s synthetic seed data
        </caption>
        <thead className="border-y bg-muted/40 text-[10px] tracking-wide text-muted-foreground uppercase">
          <tr>
            <th className="px-6 py-3 font-medium" scope="col">
              Product / order
            </th>
            <th className="px-4 py-3 font-medium" scope="col">
              Reason
            </th>
            <th className="px-4 py-3 font-medium" scope="col">
              Order value
            </th>
            <th className="px-4 py-3 font-medium" scope="col">
              Status
            </th>
            <th className="px-6 py-3 text-right font-medium" scope="col">
              Case
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {cases.map((item) => (
            <tr key={item.id} className="transition-colors hover:bg-muted/40">
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#f0eee8]">
                    <Package
                      className="size-4 text-[#7d8174]"
                      aria-hidden="true"
                    />
                  </span>
                  <div>
                    <p className="font-medium">{item.order.product.name}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {item.order.publicOrderNumber}{" "}
                      <span aria-hidden="true">·</span> Synthetic
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-4 text-muted-foreground">
                {item.reason.toLowerCase().replaceAll("_", " ")}
              </td>
              <td className="px-4 py-4 font-medium tabular-nums">
                {formatUsd(item.order.totalMinor)}
              </td>
              <td className="px-4 py-4">
                <StatusBadge status={item.status} />
              </td>
              <td className="px-6 py-4 text-right">
                <Link
                  href={`/cases/${item.id}`}
                  className="inline-flex items-center gap-1 rounded p-1 font-medium text-primary focus-visible:outline-2 focus-visible:outline-ring"
                  aria-label={`View case for ${item.order.publicOrderNumber}`}
                >
                  View <ArrowUpRight className="size-3" aria-hidden="true" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
