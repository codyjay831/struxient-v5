"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Settings2,
  UserCircle,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type NavItem = { href: string; label: string; icon: LucideIcon };

/** Single destination for the role-aware action-discovery surface (canon). */
const workstationEntry: NavItem[] = [
  { href: "/workstation", label: "Workstation", icon: LayoutDashboard },
];

/** Quick entry to lenses that double as job/schedule record hubs for now. */
const browseNav: NavItem[] = [
  { href: "/workstation/jobs", label: "Jobs", icon: FolderKanban },
  { href: "/workstation/schedule", label: "Schedule", icon: CalendarDays },
];

const commercialNav: NavItem[] = [
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/quotes", label: "Quotes", icon: FileText },
  { href: "/customers", label: "Customers", icon: UserCircle },
];

const utilityNav: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings2 },
];

function itemActive(pathname: string, href: string) {
  if (href === "/workstation") {
    return pathname === "/workstation" || pathname.startsWith("/workstation/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavSection({
  title,
  items,
  pathname,
}: {
  title: string;
  items: NavItem[];
  pathname: string;
}) {
  return (
    <div className="mb-8">
      {title ? (
        <p className="mb-3 px-3 text-[0.65rem] font-medium uppercase tracking-[0.2em] text-foreground-subtle">
          {title}
        </p>
      ) : null}
      <ul className="flex flex-col gap-0.5">
        {items.map(({ href, label, icon: Icon }) => {
          const active = itemActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                className={[
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-foreground/5 text-foreground"
                    : "text-foreground-muted hover:bg-foreground/[0.03] hover:text-foreground",
                ].join(" ")}
              >
                <Icon
                  className="size-[18px] shrink-0 opacity-80"
                  strokeWidth={1.5}
                  aria-hidden
                />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col" aria-label="Main">
      <NavSection title="" items={workstationEntry} pathname={pathname} />
      <NavSection title="Browse" items={browseNav} pathname={pathname} />
      <NavSection title="Commercial" items={commercialNav} pathname={pathname} />
      <div className="mt-auto">
        <NavSection title="" items={utilityNav} pathname={pathname} />
      </div>
    </nav>
  );
}
