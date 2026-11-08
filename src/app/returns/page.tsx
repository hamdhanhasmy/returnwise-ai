import Link from "next/link";
import { ArrowLeft, PackageOpen } from "lucide-react";
import { Brand } from "@/components/brand";
import { Card, CardContent } from "@/components/ui/card";
export default function ReturnsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Brand />
      <Card className="mt-12">
        <CardContent className="p-8 sm:p-12">
          <PackageOpen className="mb-6 size-9 text-primary" />
          <p className="mb-3 text-[10px] font-semibold tracking-widest text-primary uppercase">
            Customer return portal
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            We’re making room for your story.
          </h1>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            Secure return intake is coming in Phase 3. Your merchant will
            provide a private link for your order when the portal is available.
          </p>
          <p className="mt-5 rounded-lg border bg-muted/50 p-4 text-xs leading-6 text-muted-foreground">
            This introduction does not accept return requests, look up orders,
            or issue refunds. Please contact your merchant directly about an
            existing purchase.
          </p>
          <Link
            href="/dashboard"
            className="mt-7 inline-flex items-center gap-2 text-xs font-medium text-primary"
          >
            <ArrowLeft className="size-3" /> Merchant workspace
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
