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

const LENSES: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/workstation", label: "Today", icon: LayoutDashboard },
  { href: "/workstation/tasks", label: "Tasks", icon: ClipboardList },
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
          Role-aware action discovery across jobs, tasks, quotes, schedule, and
          payments—lenses below filter the same operational picture (data still
          stubbed).
        </p>
        <p className="mt-2 text-sm text-foreground-subtle">
          Preview role: <span className="font-medium text-foreground">Office</span>{" "}
          (field and owner views will narrow automatically when RBAC is wired).
        </p>
      </header>

      <section aria-label="Cross-record signals (preview)">
        <h2 className="mb-3 text-[0.65rem] font-medium uppercase tracking-[0.2em] text-foreground-subtle">
          Signals (placeholder)
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { k: "Ready", v: "—", hint: "Work you can start now" },
            { k: "Blocked", v: "—", hint: "Waiting on customer, parts, or permit" },
            { k: "Assigned to you", v: "—", hint: "Tasks with your name on them" },
            { k: "Needs review", v: "—", hint: "Quotes, COs, photos, completions" },
            { k: "Payment holds", v: "—", hint: "Money gating execution" },
            { k: "Schedule risk", v: "—", hint: "Conflicts, slips, missing crew" },
            { k: "Quote / customer", v: "—", hint: "Follow-ups and approvals" },
            { k: "Stale work", v: "—", hint: "No touch in N days" },
          ].map((row) => (
            <li
              key={row.k}
              className="rounded-lg border border-border bg-surface px-4 py-3 shadow-sm"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-foreground-subtle">
                {row.k}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {row.v}
              </p>
              <p className="mt-1 text-xs text-foreground-muted">{row.hint}</p>
            </li>
          ))}
        </ul>
      </section>

      <nav aria-label="Workstation lenses">
        <p className="mb-2 text-[0.65rem] font-medium uppercase tracking-[0.2em] text-foreground-subtle">
          Lenses
        </p>
        <ul className="flex flex-wrap gap-1 rounded-lg border border-border bg-foreground/[0.02] p-1">
          {LENSES.map(({ href, label, icon: Icon }) => {
            const active = lensActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
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
