"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ClipboardList,
  CreditCard,
  FileText,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  Library,
  Settings2,
  UserCircle,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type NavItem = { href: string; label: string; icon: LucideIcon };

/** Primary unified work queue. */
const workstationEntry: NavItem[] = [
  { href: "/workstation", label: "Workstation", icon: LayoutDashboard },
];

/** Commercial pipeline: intake and working quotes (record routes). */
const salesNav: NavItem[] = [
  { href: "/leads/inbox", label: "Inbox", icon: Inbox },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/quotes", label: "Quotes", icon: FileText },
  { href: "/leads/intake-forms", label: "Intake Forms", icon: ClipboardList },
  { href: "/scope-library", label: "Scope Library", icon: Library },
];

/** Durable people/company records; Customers is the first surface—more types later. */
const relationshipsNav: NavItem[] = [
  { href: "/customers", label: "Customers", icon: UserCircle },
];

/** Reserved shells for job records and schedule planning—not live runtime execution yet. */
const workNav: NavItem[] = [
  { href: "/jobs", label: "Jobs", icon: FolderKanban },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
];

/** Money tracking shell only—no processor, ledger, or automatic quote linkage yet. */
const reservedPlanningNav: NavItem[] = [
  { href: "/payments", label: "Payments", icon: CreditCard },
];

const utilityNav: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings2 },
];

function itemActive(pathname: string, href: string) {
  if (href === "/workstation") {
    return pathname === "/workstation" || pathname.startsWith("/workstation/");
  }
  if (href === "/leads/inbox") {
    return pathname === "/leads/inbox" || pathname.startsWith("/leads/inbox/");
  }
  if (href === "/leads") {
    /**
     * Active for /leads (list), /leads/new, /leads/[id], /leads/[id]/edit.
     * NOT active for inbox, intake-forms, or public-request-settings.
     */
    const isLeadsRoot = pathname === "/leads" || pathname.startsWith("/leads/");
    const isInbox =
      pathname === "/leads/inbox" || pathname.startsWith("/leads/inbox/");
    const isIntakeForms =
      pathname === "/leads/intake-forms" ||
      pathname.startsWith("/leads/intake-forms/");
    const isPublicSettings =
      pathname === "/leads/public-request-settings" ||
      pathname.startsWith("/leads/public-request-settings/");

    return isLeadsRoot && !isInbox && !isIntakeForms && !isPublicSettings;
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
      <NavSection title="Sales Hub" items={salesNav} pathname={pathname} />
      <NavSection title="Relationships" items={relationshipsNav} pathname={pathname} />
      <NavSection title="Work" items={workNav} pathname={pathname} />
      <NavSection title="Reserved" items={reservedPlanningNav} pathname={pathname} />
      <div className="mt-auto">
        <NavSection title="" items={utilityNav} pathname={pathname} />
      </div>
    </nav>
  );
}
