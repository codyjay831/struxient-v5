"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ClipboardList,
  FolderKanban,
  LayoutDashboard,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const LENSES: { href: string; label: string; icon: LucideIcon; title?: string }[] = [
  { href: "/workstation", label: "Today", icon: LayoutDashboard },
  {
    href: "/workstation/tasks",
    label: "Tasks",
    icon: ClipboardList,
    title:
      "Task attention lens only—no task board, no CRUD. Standalone /tasks is a deferred stub.",
  },
  { href: "/workstation/jobs", label: "Jobs", icon: FolderKanban },
  { href: "/workstation/schedule", label: "Schedule", icon: CalendarDays },
];

function lensActive(pathname: string, href: string) {
  if (href === "/workstation") {
    return pathname === "/workstation";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function WorkstationShell() {
  const pathname = usePathname();

  return (
    <div className="mb-10 space-y-8">
      <header className="border-b border-border pb-8">
        <p className="mb-2 text-[0.65rem] font-medium uppercase tracking-[0.2em] text-foreground-subtle">
          Workstation
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          What needs your attention?
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-foreground-muted">
          Role-aware action discovery across jobs, tasks, quotes, schedule, payments,
          and follow-ups—this is the cockpit, not the record catalog. Lenses below slice
          the same operational picture by kind of attention.
        </p>
        <p className="mt-2 text-sm text-foreground-subtle">
          Browse and maintain records under{" "}
          <span className="font-medium text-foreground">Sales</span>,{" "}
          <span className="font-medium text-foreground">Relationships</span>, and{" "}
          <span className="font-medium text-foreground">Work</span> in the sidebar—nothing
          here persists until data and queries ship.
        </p>
      </header>

      <nav aria-label="Workstation lenses">
        <p className="mb-2 text-[0.65rem] font-medium uppercase tracking-[0.2em] text-foreground-subtle">
          Lenses
        </p>
        <ul className="flex flex-wrap gap-1 rounded-lg border border-border bg-foreground/[0.02] p-1">
          {LENSES.map(({ href, label, icon: Icon, title }) => {
            const active = lensActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  title={title}
                  className={[
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-surface text-foreground shadow-sm"
                      : "text-foreground-muted hover:text-foreground",
                  ].join(" ")}
                >
                  <Icon className="size-4 shrink-0 opacity-80" strokeWidth={1.5} aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
