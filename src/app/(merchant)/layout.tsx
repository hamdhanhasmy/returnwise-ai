import { requirePrincipal } from "@/lib/auth/session";
import { AppShell } from "@/components/shell/app-shell";

export const dynamic = "force-dynamic";
export default async function MerchantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const principal = await requirePrincipal();
  return <AppShell principal={principal}>{children}</AppShell>;
}
