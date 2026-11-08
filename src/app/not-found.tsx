import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-6 py-20">
      <p className="text-xs text-primary">404</p>
      <h1 className="mt-3 text-3xl font-semibold">
        We couldn’t find that page.
      </h1>
      <p className="mt-4 text-sm text-muted-foreground">
        The page may not exist or may not be available in your workspace.
      </p>
      <Button asChild className="mt-6">
        <Link href="/dashboard">Back to workspace</Link>
      </Button>
    </main>
  );
}
