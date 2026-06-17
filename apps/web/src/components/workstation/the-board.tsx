"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronRight,
  Clock,
  CalendarRange,
  AlertCircle,
  CreditCard,
  CheckCircle2,
} from "lucide-react";
import { workstationTelemetry } from "@/lib/workstation/telemetry";
import { formatTime } from "@/lib/scheduling/format-time";
import type { WorkstationWorkItem } from "@/lib/workstation-query";

export type BoardSectionIcon = "clock" | "alert" | "calendar";

const SECTION_ICONS: Record<
  BoardSectionIcon,
  ComponentType<{ className?: string }>
> = {
  clock: Clock,
  alert: AlertCircle,
  calendar: CalendarRange,
};

export function BoardSectionHeading({
  title,
  count,
  countTone = "neutral",
  icon,
}: {
  title: string;
  count?: number;
  countTone?: "neutral" | "danger" | "warning";
  icon?: BoardSectionIcon;
}) {
  const Icon = icon ? SECTION_ICONS[icon] : null;
  const toneClass =
    countTone === "danger"
      ? "bg-danger/10 text-danger"
      : countTone === "warning"
        ? "bg-warning/10 text-warning"
        : "bg-foreground/[0.06] text-foreground-muted";

  return (
    <div className="mb-4 flex items-center gap-2">
      {Icon && <Icon className="size-4 text-foreground-subtle" aria-hidden />}
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {typeof count === "number" && count > 0 && (
        <span
          className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold ${toneClass}`}
        >
          {count}
        </span>
      )}
    </div>
  );
}

// ─── Critical bar (top exception, conditional) ─────────────────────────────────

export function BoardCriticalBar({
  items,
}: {
  items: WorkstationWorkItem[];
}) {
  if (items.length === 0) return null;

  const shown = items.slice(0, 3);
  const remaining = items.length - shown.length;

  return (
    <section
      className="overflow-hidden rounded-[var(--radius-lg)] border border-danger/30 bg-danger/[0.06] shadow-[var(--shadow-soft)]"
      aria-label="Critical items"
    >
      <div className="flex items-center gap-2.5 border-b border-danger/15 px-5 py-3.5">
        <AlertTriangle className="size-5 text-danger" aria-hidden />
        <h2 className="text-base font-bold text-foreground">
          {items.length} {items.length === 1 ? "thing needs" : "things need"} fixing
        </h2>
      </div>
      <div className="divide-y divide-danger/10">
        {shown.map((item) => (
          <Link
            key={item.id}
            href={item.href || "#"}
            scroll={false}
            onClick={() => workstationTelemetry.trackLaneClick(item.lane, item.id, item.kind)}
            className="group flex items-center gap-4 px-5 py-3 transition-colors hover:bg-danger/[0.04]"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">
                {item.title}
              </p>
              <p className="truncate text-xs text-foreground-muted">{item.reason}</p>
            </div>
            <span className="hidden shrink-0 text-xs font-semibold text-danger sm:block">
              {item.actionLabel ?? item.nextStep}
            </span>
            <ChevronRight className="size-4 shrink-0 text-danger/60 transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
      {remaining > 0 && (
        <div className="border-t border-danger/15 px-5 py-2.5">
          <p className="text-xs font-medium text-foreground-muted">
            +{remaining} more in Needs attention below
          </p>
        </div>
      )}
    </section>
  );
}

// ─── Today list (my tasks + today's events, time ordered) ──────────────────────

export type BoardTodayEntry = {
  id: string;
  time: Date | null;
  timeLabel: string;
  title: string;
  context?: string;
  href: string;
  urgent?: boolean;
  scroll?: boolean;
};

export function BoardTodayList({ entries }: { entries: BoardTodayEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-foreground-muted">
        Nothing scheduled or due today.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border/50">
      {entries.map((entry) => (
        <Link
          key={entry.id}
          href={entry.href}
          scroll={entry.scroll ?? false}
          className="group flex items-center gap-4 py-3 first:pt-0 last:pb-0"
        >
          <div className="w-20 shrink-0 text-right">
            <span
              className={`text-xs font-bold tabular-nums ${
                entry.urgent ? "text-danger" : "text-foreground"
              }`}
            >
              {entry.timeLabel}
            </span>
          </div>
          <div
            className={`h-9 w-px shrink-0 ${entry.urgent ? "bg-danger/40" : "bg-border"}`}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {entry.title}
            </p>
            {entry.context && (
              <p className="truncate text-xs text-foreground-muted">{entry.context}</p>
            )}
          </div>
          <ChevronRight className="size-4 shrink-0 text-foreground-subtle opacity-0 transition-opacity group-hover:opacity-60" />
        </Link>
      ))}
    </div>
  );
}

// ─── Needs attention list (blocked / issues) ───────────────────────────────────

export function BoardSignalRow({
  item,
  isSelected,
}: {
  item: WorkstationWorkItem;
  isSelected?: boolean;
}) {
  const context = item.contextLine ?? item.parentLabel ?? item.subtitle;
  const isCritical = item.priority === "critical" || (item.isBlocked && !item.isWaitingOnSignals);
  const borderTone = isCritical ? "border-danger" : item.isWaitingOnSignals ? "border-accent/40" : "border-warning";
  const bgTone = isCritical ? "bg-danger/[0.03]" : item.isWaitingOnSignals ? "bg-accent/[0.03]" : "bg-warning/[0.03]";

  return (
    <Link
      href={item.href || "#"}
      scroll={false}
      onClick={() => workstationTelemetry.trackLaneClick(item.lane, item.id, item.kind)}
      className={[
        "group block rounded-lg border-l-2 py-2.5 pl-3 pr-2 transition-colors",
        borderTone,
        isSelected ? "bg-accent/[0.06] ring-1 ring-accent/30" : `${bgTone} hover:brightness-95`,
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        {item.isWaitingOnSignals && (
          <span className="inline-flex items-center gap-0.5 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
            Waiting
          </span>
        )}
        {item.isBlocked && !item.isWaitingOnSignals && (
          <span className="inline-flex items-center gap-0.5 rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-danger">
            Blocked
          </span>
        )}
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {item.title}
        </p>
      </div>
      <p className="mt-0.5 truncate text-xs text-foreground-muted">{item.reason}</p>
      {context && (
        <p className="truncate text-[11px] text-foreground-subtle">{context}</p>
      )}
    </Link>
  );
}

export function BoardAttentionList({
  items,
  selectedId,
}: {
  items: WorkstationWorkItem[];
  selectedId?: string;
}) {
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-foreground-muted">
        <CheckCircle2 className="size-4 text-success" aria-hidden />
        Nothing blocked right now.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <BoardSignalRow key={item.id} item={item} isSelected={selectedId === item.id} />
      ))}
    </div>
  );
}

// ─── Payments due panel ────────────────────────────────────────────────────────

export function BoardPaymentsPanel({
  items,
  selectedId,
}: {
  items: WorkstationWorkItem[];
  selectedId?: string;
}) {
  if (items.length === 0) return null;

  return (
    <div className="rounded-lg border border-warning/25 bg-warning/[0.04] p-3">
      <div className="mb-2 flex items-center gap-2">
        <CreditCard className="size-4 text-warning" aria-hidden />
        <h3 className="text-xs font-bold uppercase tracking-wide text-foreground">
          Payments due
        </h3>
        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-warning/15 px-1.5 py-0.5 text-[11px] font-bold text-warning">
          {items.length}
        </span>
      </div>
      <div className="space-y-1.5">
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href || "#"}
            scroll={false}
            onClick={() => workstationTelemetry.trackLaneClick(item.lane, item.id, item.kind)}
            className={[
              "group flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors",
              selectedId === item.id ? "bg-accent/[0.06]" : "hover:bg-warning/[0.06]",
            ].join(" ")}
          >
            <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">
              {item.subtitle ?? "Due"}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-foreground-muted">
              {item.reason}
            </span>
            <ChevronRight className="size-3.5 shrink-0 text-foreground-subtle opacity-0 transition-opacity group-hover:opacity-60" />
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─── Week calendar strip ───────────────────────────────────────────────────────

export type BoardWeekEvent = {
  id: string;
  title: string;
  timeLabel: string;
  href?: string;
  tone: "default" | "danger" | "accent";
};

export type BoardWeekDay = {
  iso: string;
  weekday: string;
  dayNumber: number;
  isToday: boolean;
  events: BoardWeekEvent[];
};

export function WorkstationWeekCalendar({ days }: { days: BoardWeekDay[] }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-foreground-subtle md:hidden">Swipe to see the full week.</p>
      <div className="-mx-4 overflow-x-auto px-4 scrollbar-hide sm:mx-0 sm:px-0">
        <div className="grid min-w-[640px] grid-cols-7 gap-2">
        {days.map((day) => (
          <div
            key={day.iso}
            className={[
              "flex min-h-32 flex-col rounded-lg border p-2",
              day.isToday
                ? "border-accent/40 bg-accent/[0.04] ring-1 ring-accent/30"
                : "border-border bg-surface",
            ].join(" ")}
          >
            <div className="mb-2 flex items-baseline justify-between">
              <span
                className={`text-[10px] font-bold uppercase tracking-wide ${
                  day.isToday ? "text-accent" : "text-foreground-subtle"
                }`}
              >
                {day.weekday}
              </span>
              <span
                className={`text-sm font-bold tabular-nums ${
                  day.isToday ? "text-accent" : "text-foreground"
                }`}
              >
                {day.dayNumber}
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-1">
              {day.events.slice(0, 3).map((event) => {
                const toneClass =
                  event.tone === "danger"
                    ? "bg-danger/10 text-danger"
                    : event.tone === "accent"
                      ? "bg-accent/10 text-accent"
                      : "bg-foreground/[0.05] text-foreground-muted";
                const content = (
                  <>
                    <span className="block truncate font-semibold">{event.title}</span>
                    {event.timeLabel && (
                      <span className="block truncate opacity-80">{event.timeLabel}</span>
                    )}
                  </>
                );

                if (event.href) {
                  return (
                    <Link
                      key={event.id}
                      href={event.href}
                      scroll={false}
                      className={[
                        "rounded px-1.5 py-1 text-[10px] font-medium leading-tight transition-opacity hover:opacity-90",
                        toneClass,
                      ].join(" ")}
                    >
                      {content}
                    </Link>
                  );
                }

                return (
                  <div
                    key={event.id}
                    className={[
                      "rounded px-1.5 py-1 text-[10px] font-medium leading-tight",
                      toneClass,
                    ].join(" ")}
                  >
                    {content}
                  </div>
                );
              })}
              {day.events.length > 3 && (
                <span className="px-1 text-[10px] font-medium text-foreground-subtle">
                  +{day.events.length - 3} more
                </span>
              )}
            </div>
          </div>
        ))}
        </div>
      </div>
    </div>
  );
}

// ─── Recent changes (quiet) ────────────────────────────────────────────────────

export function BoardRecentChangeRow({
  item,
}: {
  item: { id: string; title: string; subtitle: string };
}) {
  return (
    <div className="flex items-start gap-2.5 py-2">
      <span className="mt-1.5 inline-flex size-1.5 shrink-0 rounded-full bg-foreground/20" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground">{item.title}</p>
        <p className="truncate text-[11px] text-foreground-subtle">{item.subtitle}</p>
      </div>
    </div>
  );
}

// ─── Empty state ───────────────────────────────────────────────────────────────

export function BoardEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-border bg-surface py-16 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-success/10">
        <CheckCircle2 className="size-7 text-success" aria-hidden />
      </div>
      <h3 className="text-lg font-bold text-foreground">All clear</h3>
      <p className="mt-1.5 max-w-xs text-sm text-foreground-muted">
        Nothing due, scheduled, or blocked right now. Enjoy the quiet.
      </p>
    </div>
  );
}
