"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartNoAxesCombined,
  LayoutDashboard,
  PackageOpen,
  Settings2,
  UsersRound,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/cases", label: "Return cases", icon: PackageOpen },
  { href: "/portal", label: "Customer portal", icon: UsersRound },
  { href: "/analytics", label: "Analytics", icon: ChartNoAxesCombined },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

export function Navigation() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main navigation"
      className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible"
    >
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-muted",
              active
                ? "bg-accent font-semibold text-primary"
                : "text-muted-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            <span>{label}</span>
            {active && (
              <span className="ml-auto hidden size-1.5 rounded-full bg-primary lg:block" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
