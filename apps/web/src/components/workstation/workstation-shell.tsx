"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  parseWorkstationUrlState,
  buildWorkstationUrl,
  WORKSTATION_TABS,
  type WorkstationTab,
} from "@/lib/workstation/url-state";

export type WorkstationTabCounts = Partial<Record<WorkstationTab, number>>;

/**
 * Workstation page chrome inside the existing app shell.
 * Preserves global sidebar/logo; only owns Workstation domain tabs.
 */
export function WorkstationShell({ tabCounts }: { tabCounts?: WorkstationTabCounts }) {
  const searchParams = useSearchParams();
  const urlState = parseWorkstationUrlState(searchParams);
  const { tab } = urlState;

  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const showDate = tab === "overview";

  return (
    <div className="mb-6">
      <header className="border-b border-border pb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Workstation
            </h1>
            {showDate ? (
              <p className="mt-0.5 text-sm text-foreground-muted">
                {todayLabel} · Operations cockpit
              </p>
            ) : (
              <p className="mt-0.5 text-sm text-foreground-muted">
                {WORKSTATION_TABS.find((t) => t.tab === tab)?.description ??
                  "Operations cockpit"}
              </p>
            )}
          </div>

          <nav
            aria-label="Workstation navigation"
            className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium"
          >
            {WORKSTATION_TABS.map(({ tab: tabKey, label }) => {
              const count = tabCounts?.[tabKey];
              return (
                <Link
                  key={tabKey}
                  href={buildWorkstationUrl(urlState, {
                    tab: tabKey,
                    selected: undefined,
                    filter: "all",
                  })}
                  scroll={false}
                  className={
                    tab === tabKey
                      ? "inline-flex items-center gap-1.5 text-foreground underline decoration-accent underline-offset-4"
                      : "inline-flex items-center gap-1.5 text-foreground-muted transition-colors hover:text-foreground"
                  }
                  aria-current={tab === tabKey ? "page" : undefined}
                >
                  {label}
                  {typeof count === "number" && count > 0 && tabKey !== "overview" ? (
                    <span className="rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-foreground-subtle">
                      {count}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
    </div>
  );
}

export function isWorkstationTab(value: string): value is WorkstationTab {
  return WORKSTATION_TABS.some((t) => t.tab === value);
}
