import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { StatusBadge, type StatusBadgeTone } from "@/components/ui/status-badge";
import type {
  WorkstationPresentationTone,
  WorkstationSignalItem,
  CriticalGroup,
  NeedsActionItem,
  TodayAgendaItem,
  WeekDaySummary,
  QueueRowItem,
  ActivityItem,
} from "@/lib/workstation-presentation";

type SelectableRow = {
  id: string;
  selectedId: string;
  selectedKind: string;
};

function toneBorderClass(tone: WorkstationPresentationTone): string {
  if (tone === "danger") return "before:bg-danger";
  if (tone === "warning") return "before:bg-warning";
  return "before:bg-border";
}

function presentationToneToBadge(tone: WorkstationPresentationTone): StatusBadgeTone {
  if (tone === "danger") return "danger";
  if (tone === "warning") return "warning";
  return "neutral";
}

export function WorkstationStatusBar({ items }: { items: WorkstationSignalItem[] }) {
  return (
    <section className="flex flex-wrap border-y border-border">
      {items.map((item, index) => {
        const valueClass =
          item.tone === "danger"
            ? "text-danger"
            : item.tone === "warning"
              ? "text-warning"
              : "text-foreground";

        const content = (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-subtle">
              {item.label}
            </p>
            <p className="mt-0.5 text-sm text-foreground-muted">
              <span className={`mr-2 text-xl font-bold tabular-nums ${valueClass}`}>
                {item.value}
              </span>
              {item.context}
            </p>
          </>
        );

        const className = `min-w-[11rem] flex-1 px-4 py-2.5 transition-colors ${index === 0 ? "pl-0" : ""} ${index < items.length - 1 ? "border-r border-border" : ""} ${item.href ? "hover:bg-foreground/[0.02]" : ""}`;

        if (item.href) {
          return (
            <Link key={item.id} href={item.href} scroll={false} className={className}>
              {content}
            </Link>
          );
        }

        return (
          <div key={item.id} className={className}>
            {content}
          </div>
        );
      })}
    </section>
  );
}

type WorkstationRowProps = {
  primary: string;
  secondary?: string;
  detail?: string;
  tone?: WorkstationPresentationTone;
  badgeLabel?: string;
  href: string;
  selected?: boolean;
  children?: ReactNode;
};

export function WorkstationRow({
  primary,
  secondary,
  detail,
  tone = "neutral",
  badgeLabel,
  href,
  selected = false,
  children,
}: WorkstationRowProps) {
  return (
    <Link
      href={href}
      scroll={false}
      className={[
        "group relative block border-t border-border py-3 pl-3 pr-2 transition-colors first:border-t-0",
        "before:absolute before:bottom-3 before:left-0 before:top-3 before:w-0.5 before:rounded-full",
        toneBorderClass(tone),
        selected ? "bg-accent/10" : "hover:bg-foreground/[0.03]",
      ].join(" ")}
      aria-current={selected ? "true" : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{primary}</p>
          {secondary ? (
            <p className="truncate text-sm text-foreground-muted">{secondary}</p>
          ) : null}
          {detail ? (
            <p className="mt-0.5 text-xs text-foreground-subtle">{detail}</p>
          ) : null}
          {badgeLabel ? (
            <div className="mt-2">
              <StatusBadge
                label={badgeLabel}
                tone={presentationToneToBadge(tone)}
              />
            </div>
          ) : null}
          {children}
        </div>
        <ChevronRight
          className="mt-0.5 size-4 shrink-0 text-foreground-subtle opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden
        />
      </div>
    </Link>
  );
}

export function WorkstationColumn({
  title,
  description,
  viewAllHref,
  viewAllLabel = "View all",
  children,
  className = "",
}: {
  title: string;
  description?: string;
  viewAllHref?: string;
  viewAllLabel?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-xs text-foreground-muted">{description}</p>
          ) : null}
        </div>
        {viewAllHref ? (
          <Link
            href={viewAllHref}
            scroll={false}
            className="shrink-0 text-xs font-medium text-accent hover:underline"
          >
            {viewAllLabel}
          </Link>
        ) : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function CriticalGroupsList({
  groups,
  buildHref,
  selectedId,
}: {
  groups: CriticalGroup[];
  buildHref: (item: SelectableRow) => string;
  selectedId?: string;
}) {
  const nonEmpty = groups.filter((g) => g.items.length > 0);
  if (nonEmpty.length === 0) {
    return (
      <p className="text-sm text-foreground-muted">
        No risks are blocking today&apos;s work.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {nonEmpty.map((group) => (
        <div key={group.category}>
          <p className="mb-1 text-xs font-medium text-foreground-subtle">
            {group.label}
          </p>
          {group.items.map((item) => (
            <WorkstationRow
              key={item.id}
              primary={item.title}
              detail={item.reason}
              tone={item.tone}
              badgeLabel={item.categoryLabel}
              href={buildHref(item)}
              selected={selectedId === item.id}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function NextActionsList({
  items,
  buildHref,
  selectedId,
}: {
  items: NeedsActionItem[];
  buildHref: (item: NeedsActionItem) => string;
  selectedId?: string;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-foreground-muted">
        Nothing urgent right now. Today&apos;s schedule is clear.
      </p>
    );
  }

  return (
    <div>
      {items.map((item) => (
        <WorkstationRow
          key={item.id}
          primary={item.identity}
          secondary={item.workItem}
          detail={item.reason}
          tone={item.tone}
          badgeLabel={item.categoryLabel}
          href={buildHref(item)}
          selected={selectedId === item.id}
        />
      ))}
    </div>
  );
}

export function TodayAgendaList({
  items,
  buildHref,
  selectedId,
}: {
  items: TodayAgendaItem[];
  buildHref: (item: TodayAgendaItem) => string;
  selectedId?: string;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-foreground-muted">
        Nothing scheduled or due today.
      </p>
    );
  }

  return (
    <div>
      {items.map((item) => {
        const ownerDetail = item.ownerLabel ? `${item.timeLabel} · ${item.ownerLabel}` : item.timeLabel;
        return (
          <WorkstationRow
            key={item.id}
            primary={item.identity}
            secondary={item.title}
            detail={ownerDetail}
            tone={item.tone}
            badgeLabel={item.categoryLabel}
            href={buildHref(item)}
            selected={selectedId === item.id}
          />
        );
      })}
    </div>
  );
}

export function WeekStrip({
  days,
  buildDayHref,
}: {
  days: WeekDaySummary[];
  buildDayHref?: (day: WeekDaySummary) => string;
}) {
  if (days.length === 0) {
    return <p className="text-sm text-foreground-muted">No scheduled work this week.</p>;
  }

  return (
    <section className="border-t border-border pt-4">
      <h2 className="mb-3 text-sm font-semibold text-foreground">This week</h2>
      <div className="grid grid-cols-2 gap-0 sm:grid-cols-4 lg:grid-cols-7">
        {days.map((day) => {
          const summary =
            day.eventCount === 0 && day.riskCount === 0 ? "Clear" : day.summary;
          const cell = (
            <>
              <p
                className={`text-xs ${day.isToday ? "font-semibold text-foreground" : "text-foreground-subtle"}`}
              >
                {day.dayLabel}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-foreground-muted">{summary}</p>
            </>
          );

          const className = `min-h-[4.5rem] border-border px-3 py-2 transition-colors first:pl-0 lg:border-r lg:last:border-r-0 ${day.isToday ? "bg-foreground/[0.04]" : ""} ${buildDayHref ? "hover:bg-foreground/[0.03]" : ""}`;

          if (buildDayHref) {
            return (
              <Link
                key={day.dayLabel + day.date.toISOString()}
                href={buildDayHref(day)}
                scroll={false}
                className={className}
              >
                {cell}
              </Link>
            );
          }

          return (
            <div key={day.dayLabel + day.date.toISOString()} className={className}>
              {cell}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function QueueRowList({
  items,
  buildHref,
  emptyMessage,
  selectedId,
}: {
  items: QueueRowItem[];
  buildHref: (item: QueueRowItem) => string;
  emptyMessage: string;
  selectedId?: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-foreground-muted">{emptyMessage}</p>;
  }

  return (
    <div>
      {items.map((item) => (
        <WorkstationRow
          key={item.id}
          primary={item.subtitle || item.title}
          secondary={item.subtitle ? item.title : undefined}
          detail={item.reason}
          tone={item.tone}
          badgeLabel={item.statusLabel ?? item.categoryLabel}
          href={buildHref(item)}
          selected={selectedId === item.id}
        />
      ))}
    </div>
  );
}

export function ActivityFeedList({
  items,
  buildHref,
  selectedId,
}: {
  items: ActivityItem[];
  buildHref?: (item: ActivityItem) => string | undefined;
  selectedId?: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-foreground-muted">No recent changes.</p>;
  }

  return (
    <div>
      {items.map((item) => {
        const href = buildHref?.(item) ?? item.fallbackHref;
        const content = (
          <>
            <p className="truncate text-sm text-foreground">{item.title}</p>
            <p className="truncate text-xs text-foreground-muted">{item.subtitle}</p>
          </>
        );
        const className = [
          "group relative block border-t border-border py-3 pl-3 pr-2 transition-colors first:border-t-0",
          href ? "hover:bg-foreground/[0.03]" : "",
          selectedId && item.selectedId === selectedId ? "bg-accent/10" : "",
        ].join(" ");

        if (href) {
          return (
            <Link
              key={item.id}
              href={href}
              scroll={false}
              className={className}
              aria-current={selectedId === item.selectedId ? "true" : undefined}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">{content}</div>
                <ChevronRight
                  className="mt-0.5 size-4 shrink-0 text-foreground-subtle opacity-0 transition-opacity group-hover:opacity-100"
                  aria-hidden
                />
              </div>
            </Link>
          );
        }

        return (
          <div key={item.id} className={className}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

/** @deprecated Use WorkstationStatusBar */
export const WorkstationSignalStrip = WorkstationStatusBar;
