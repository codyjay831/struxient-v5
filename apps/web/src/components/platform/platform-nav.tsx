"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, ClipboardList, KeyRound, LayoutDashboard, Users } from "lucide-react";

const navItems = [
  { href: "/platform", label: "Platform Home", icon: LayoutDashboard, exact: true },
  { href: "/platform/organizations", label: "Organizations", icon: Building2 },
  { href: "/platform/beta-access", label: "Beta access", icon: KeyRound },
  { href: "/platform/users", label: "Users", icon: Users },
  { href: "/platform/audit", label: "Audit", icon: ClipboardList },
];

export function PlatformNav({ onNavigate }: { onNavigate?: () => void } = {}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-1" aria-label="Platform">
      {navItems.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={[
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-foreground/[0.06] text-foreground"
                : "text-foreground-muted hover:bg-foreground/[0.03] hover:text-foreground",
            ].join(" ")}
          >
            <Icon className="size-4 shrink-0 opacity-70" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
