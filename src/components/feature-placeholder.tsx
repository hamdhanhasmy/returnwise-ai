import { ArrowUpRight, Construction } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
export function FeaturePlaceholder({
  title,
  description,
  phase,
  children,
}: {
  title: string;
  description: string;
  phase: string;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex min-h-80 flex-col items-center justify-center p-8 text-center">
        <span className="mb-5 flex size-14 items-center justify-center rounded-2xl border bg-muted">
          <Construction className="size-6 text-primary" aria-hidden="true" />
        </span>
        <p className="mb-3 text-[10px] font-semibold tracking-widest text-primary uppercase">
          {phase}
        </p>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
          {description}
        </p>
        {children}
        <Button asChild variant="outline" className="mt-6">
          <Link href="/cases">
            Explore demonstration cases <ArrowUpRight />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
