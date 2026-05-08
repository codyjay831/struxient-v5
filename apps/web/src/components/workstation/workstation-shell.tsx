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
  const activeLens = LENSES.find(l => lensActive(pathname, l.href));

  return (
    <div className="mb-8 space-y-6">
      <header className="border-b border-border pb-6">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="mb-1 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-foreground-subtle">
              Workstation
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {activeLens && activeLens.label !== "Today" ? `Review: ${activeLens.label}` : "Operational Review"}
            </h1>
          </div>
          <nav aria-label="Workstation lenses">
            <ul className="flex items-center gap-1 rounded-lg border border-border bg-foreground/[0.02] p-1">
              {LENSES.map(({ href, label, icon: Icon, title }) => {
                const active = lensActive(pathname, href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      title={title}
                      className={[
                        "flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                        active
                          ? "bg-surface text-foreground shadow-sm ring-1 ring-border"
                          : "text-foreground-muted hover:text-foreground",
                      ].join(" ")}
                    >
                      <Icon className="size-3.5 shrink-0 opacity-80" strokeWidth={2} aria-hidden />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </header>
    </div>
  );
}
