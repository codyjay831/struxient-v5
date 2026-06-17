"use client";

import { ChevronRight, X } from "lucide-react";
import type { UnscheduledScheduleItem } from "@/lib/schedule-query";

export function ScheduleUnscheduledTray({
  items,
  onClose,
  className = "",
}: {
  items: UnscheduledScheduleItem[];
  onClose?: () => void;
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <aside
      className={[
        "flex min-h-0 flex-col border-border bg-surface lg:max-w-xs lg:border-l",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label="Unscheduled work"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
          Needs scheduling
          <span className="ml-1.5 rounded-full bg-foreground/10 px-1.5 py-px text-[10px] font-bold text-foreground">
            {items.length}
          </span>
        </h3>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-foreground-subtle hover:bg-foreground/[0.06] hover:text-foreground lg:hidden"
            aria-label="Close unscheduled tray"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-md border border-border bg-background px-3 py-2.5"
          >
            <p className="text-sm font-medium leading-snug text-foreground">{item.title}</p>
            {item.subtitle ? (
              <p className="mt-0.5 truncate text-xs text-foreground-muted">{item.subtitle}</p>
            ) : null}
            <p className="mt-1 text-[11px] leading-relaxed text-foreground-subtle">{item.reason}</p>
            {item.recordHref ? (
              <a
                className="mt-2 inline-flex items-center gap-0.5 text-xs font-medium text-accent hover:underline"
                href={item.recordHref}
              >
                {item.actionLabel}
                <ChevronRight className="size-3" aria-hidden />
              </a>
            ) : null}
          </div>
        ))}
      </div>
    </aside>
  );
}
