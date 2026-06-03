"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  ClipboardList,
  FolderKanban,
  LayoutDashboard,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  parseWorkstationUrlState,
  buildWorkstationUrl,
} from "@/lib/workstation/url-state";
import { WORKSTATION_LENS_LABELS } from "@/lib/workstation-copy";
import { WorkstationLens } from "@/lib/workstation-query";

const LENSES: { href: string; label: string; icon: LucideIcon; lens: WorkstationLens }[] = [
  { href: "/workstation", label: WORKSTATION_LENS_LABELS.attention, icon: LayoutDashboard, lens: "attention" },
  { href: "/workstation?lens=today", label: WORKSTATION_LENS_LABELS.today, icon: ClipboardList, lens: "today" },
  { href: "/workstation?lens=waiting", label: WORKSTATION_LENS_LABELS.waiting, icon: FolderKanban, lens: "waiting" },
  { href: "/workstation?lens=upcoming", label: WORKSTATION_LENS_LABELS.upcoming, icon: CalendarDays, lens: "upcoming" },
  { href: "/workstation?lens=all", label: WORKSTATION_LENS_LABELS.all, icon: LayoutDashboard, lens: "all" },
];

function lensActive(pathname: string, currentLens: string, targetLens: string) {
  if (pathname !== "/workstation") return false;
  return currentLens === targetLens;
}

export function WorkstationShell() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlState = parseWorkstationUrlState(searchParams);
  const activeLens = LENSES.find(l => lensActive(pathname, urlState.lens, l.lens)) || LENSES[0];
  const isMainWorkstation = pathname === "/workstation";

  const subrouteLabels: Record<string, string> = {
    "/workstation/tasks": "Tasks",
    "/workstation/jobs": "Jobs",
    "/workstation/schedule": "Schedule",
  };
  const activeSubrouteLabel = subrouteLabels[pathname] ?? null;

  return (
    <div className="mb-8 space-y-6">
      <header className="border-b border-border pb-6">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="mb-1 text-sm font-medium text-foreground-subtle">
              Workstation
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {isMainWorkstation ? activeLens.label : activeSubrouteLabel ?? "Workstation"}
            </h1>
          </div>
          {isMainWorkstation ? (
            <nav aria-label="Workstation lenses">
              <ul className="flex items-center gap-1 rounded-lg border border-border bg-foreground/[0.02] p-1">
                {LENSES.map(({ label, icon: Icon, lens }) => {
                  const active = lensActive(pathname, urlState.lens, lens);
                  const finalHref = buildWorkstationUrl(urlState, {
                    lens,
                    selected: undefined,
                  });

                  return (
                    <li key={lens}>
                      <Link
                        href={finalHref}
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
          ) : (
            <nav aria-label="Workstation sections">
              <ul className="flex items-center gap-1 rounded-lg border border-border bg-foreground/[0.02] p-1">
                {Object.entries(subrouteLabels).map(([href, label]) => {
                  const active = pathname === href;
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        className={[
                          "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                          active
                            ? "bg-surface text-foreground shadow-sm ring-1 ring-border"
                            : "text-foreground-muted hover:text-foreground",
                        ].join(" ")}
                      >
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          )}
        </div>
      </header>
    </div>
  );
}
