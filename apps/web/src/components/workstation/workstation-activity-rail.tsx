"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, History, X, Zap } from "lucide-react";

export type WorkstationActivityItem = {
  id: string;
  title: string;
  subtitle: string;
};

const activityItemClass =
  "flex items-start gap-3 rounded-lg border border-transparent p-2 transition-colors hover:bg-foreground/[0.02]";

export function WorkstationActivityRail({
  items,
}: {
  items: WorkstationActivityItem[];
}) {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  return (
    <div
      className="pointer-events-none fixed top-14 bottom-0 right-0 z-50 flex items-center justify-end"
      aria-label="Recent activity"
    >
      <div
        className={[
          "pointer-events-auto flex items-stretch",
          open ? "max-h-[75vh]" : "",
        ].join(" ")}
      >
        <div
          className={[
            "flex flex-col overflow-hidden rounded-l-xl border border-r-0 border-border bg-surface shadow-2xl transition-[width,opacity] duration-300 ease-out",
            open ? "max-h-[75vh] w-80 opacity-100" : "w-0 opacity-0 pointer-events-none",
          ].join(" ")}
        >
          <aside
            id="workstation-activity-panel"
            aria-hidden={!open}
            className="flex h-full max-h-[75vh] w-80 flex-col"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <History className="size-4 text-foreground-subtle" />
                <h3 className="text-sm font-semibold text-foreground">
                  Recent activity
                </h3>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close recent activity"
                className="rounded-lg p-1.5 text-foreground-subtle transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {items.length > 0 ? (
                <div className="space-y-4">
                  {items.map((activity) => (
                    <div key={activity.id} className={activityItemClass}>
                      <div className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground/5">
                        <Zap className="size-3 text-foreground-subtle" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium leading-snug text-foreground">
                          {activity.title}
                        </p>
                        <p className="mt-0.5 truncate text-[10px] text-foreground-subtle">
                          {activity.subtitle}
                        </p>
                      </div>
                    </div>
                  ))}
                  <Link
                    href="/jobs"
                    className="mt-2 block text-center text-sm font-medium text-accent hover:underline"
                  >
                    Browse jobs
                  </Link>
                </div>
              ) : (
                <p className="text-sm text-foreground-muted">No recent activity.</p>
              )}
            </div>
          </aside>
        </div>

        <button
          type="button"
          aria-expanded={open}
          aria-controls="workstation-activity-panel"
          onClick={() => setOpen((prev) => !prev)}
          className={[
            "flex w-10 shrink-0 flex-col items-center justify-center gap-3 border-l border-border bg-surface text-foreground-subtle transition-colors hover:bg-foreground/[0.02] hover:text-foreground",
            open ? "self-stretch rounded-l-none" : "rounded-l-xl py-4",
            open ? "text-foreground" : "",
          ].join(" ")}
        >
          {open ? (
            <ChevronRight className="size-4" />
          ) : (
            <History className="size-4" />
          )}
          <span
            className="text-[10px] font-bold uppercase tracking-widest [writing-mode:vertical-rl]"
            style={{ textOrientation: "mixed" }}
          >
            Activity
          </span>
          {!open && items.length > 0 ? (
            <span className="flex size-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-contrast">
              {items.length > 9 ? "9+" : items.length}
            </span>
          ) : null}
        </button>
      </div>
    </div>
  );
}
