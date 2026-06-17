"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  CreditCard,
  FolderKanban,
  LayoutDashboard,
  Settings2,
  UserCircle,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { StaffRole } from "@prisma/client";
import { canReadCommercial } from "@/lib/authz/capabilities";

type NavItem = { href: string; label: string; icon: LucideIcon; soon?: boolean };

/** Primary unified work queue. */
const workstationEntry: NavItem[] = [
  { href: "/workstation", label: "Workstation", icon: LayoutDashboard },
];

/** Commercial pipeline: opportunities and working quotes. */
const salesNav: NavItem[] = [
  { href: "/leads", label: "Sales", icon: Users },
];

/** Durable people/company records; Customers is the first surface—more types later. */
const relationshipsNav: NavItem[] = [
  { href: "/customers", label: "Customers", icon: UserCircle },
];

/** Work records and scheduling views. */
const workNav: NavItem[] = [
  { href: "/jobs", label: "Jobs", icon: FolderKanban },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
];

/** Money tracking — coming soon. */
const financeNav: NavItem[] = [
  { href: "/payments", label: "Payments", icon: CreditCard, soon: true },
];

const utilityNav: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings2 },
];

function itemActive(pathname: string, href: string) {
  if (href === "/workstation") {
    return pathname === "/workstation" || pathname.startsWith("/workstation/");
  }
  if (href === "/leads") {
    /**
     * Active for /leads (list), /leads/new, /leads/[id], /leads/[id]/edit.
     */
    return pathname === "/leads" || pathname.startsWith("/leads/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavSection({
  title,
  items,
  pathname,
  onNavigate,
}: {
  title: string;
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="mb-8">
      {title ? (
        <p className="mb-3 px-3 text-xs font-medium text-foreground-subtle">
          {title}
        </p>
      ) : null}
      <ul className="flex flex-col gap-0.5">
        {items.map(({ href, label, icon: Icon, soon }) => {
          const active = itemActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                onClick={onNavigate}
                className={[
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-brand-muted text-accent ring-1 ring-accent/15"
                    : "text-foreground-muted hover:bg-foreground/[0.03] hover:text-foreground",
                ].join(" ")}
              >
                <Icon
                  className="size-[18px] shrink-0 opacity-80"
                  strokeWidth={1.5}
                  aria-hidden
                />
                <span>{label}</span>
                {soon ? (
                  <span className="ml-auto rounded bg-brand-muted px-1.5 py-0.5 text-[0.6rem] font-semibold text-accent">
                    Soon
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SidebarNav({
  role,
  onNavigate,
}: {
  role: StaffRole;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const showCommercial = canReadCommercial(role);
  const salesItems = showCommercial ? salesNav : [];
  const relationshipItems = showCommercial ? relationshipsNav : [];
  const financeItems = showCommercial ? financeNav : [];

  return (
    <nav className="flex flex-1 flex-col" aria-label="Main">
      <NavSection title="" items={workstationEntry} pathname={pathname} onNavigate={onNavigate} />
      <NavSection title="Sales" items={salesItems} pathname={pathname} onNavigate={onNavigate} />
      <NavSection title="Relationships" items={relationshipItems} pathname={pathname} onNavigate={onNavigate} />
      <NavSection title="Work" items={workNav} pathname={pathname} onNavigate={onNavigate} />
      <NavSection title="Finance" items={financeItems} pathname={pathname} onNavigate={onNavigate} />
      <div className="mt-auto">
        <NavSection title="" items={utilityNav} pathname={pathname} onNavigate={onNavigate} />
      </div>
    </nav>
  );
}
