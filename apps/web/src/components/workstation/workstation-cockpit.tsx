import Link from "next/link";
import type { ReactNode } from "react";
import { buttonClassName } from "@/components/ui/button";
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

const actionButtonClass = buttonClassName({ variant: "muted", size: "sm" });

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

        return (
          <div
            key={item.id}
            className={`min-w-[11rem] flex-1 px-4 py-2.5 ${index === 0 ? "pl-0" : ""} ${index < items.length - 1 ? "border-r border-border" : ""}`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-subtle">
              {item.label}
            </p>
            <p className="mt-0.5 text-sm text-foreground-muted">
              <span className={`mr-2 text-xl font-bold ${valueClass}`}>{item.value}</span>
              {item.context}
            </p>
          </div>
        );
      })}
    </section>
  );
}

type WorkstationRowProps = {
  title: string;
  meta?: string;
  reason?: string;
  tone?: WorkstationPresentationTone;
  categoryLabel?: string;
  actionLabel?: string;
  href?: string;
  children?: ReactNode;
};

export function WorkstationRow({
  title,
  meta,
  reason,
  tone = "neutral",
  categoryLabel,
  actionLabel,
  href,
  children,
}: WorkstationRowProps) {
  return (
    <div
      className={`relative border-t border-border py-3 pl-3 first:border-t-0 before:absolute before:bottom-3 before:left-0 before:top-3 before:w-0.5 before:rounded-full ${toneBorderClass(tone)}`}
    >
      <p className="truncate text-sm font-semibold text-foreground">{title}</p>
      {meta ? <p className="truncate text-xs text-foreground-muted">{meta}</p> : null}
      {reason ? <p className="text-xs text-foreground-muted">{reason}</p> : null}
      {(categoryLabel || actionLabel || children) && (
        <div className="mt-2 flex items-center justify-between gap-2">
          {categoryLabel ? (
            <span className="text-[11px] text-foreground-subtle">{categoryLabel}</span>
          ) : (
            <span />
          )}
          {children}
          {actionLabel && href ? (
            <Link href={href} scroll={false} className={actionButtonClass}>
              {actionLabel}
            </Link>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function WorkstationColumn({
  title,
  description,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 ${className}`}>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {description ? (
        <p className="mt-0.5 text-xs text-foreground-muted">{description}</p>
      ) : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function CriticalGroupsList({
  groups,
  buildHref,
}: {
  groups: CriticalGroup[];
  buildHref: (item: SelectableRow) => string;
}) {
  const nonEmpty = groups.filter((g) => g.items.length > 0);
  if (nonEmpty.length === 0) {
    return (
      <p className="text-sm text-foreground-muted">No critical risks blocking today.</p>
    );
  }

  return (
    <div className="space-y-4">
      {nonEmpty.map((group) => (
        <div key={group.category}>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-foreground-subtle">
            {group.label}
          </p>
          {group.items.map((item) => (
            <WorkstationRow
              key={item.id}
              title={item.title}
              reason={item.reason}
              tone={item.tone}
              categoryLabel={item.categoryLabel}
              actionLabel={item.nextAction}
              href={buildHref(item)}
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
}: {
  items: NeedsActionItem[];
  buildHref: (item: NeedsActionItem) => string;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-foreground-muted">
        No immediate actions. Check Today or browse a focused tab.
      </p>
    );
  }

  return (
    <div>
      {items.map((item) => (
        <WorkstationRow
          key={item.id}
          title={`${item.workItem} · ${item.identity}`}
          reason={item.reason}
          tone={item.tone}
          categoryLabel={item.categoryLabel}
          actionLabel={item.nextAction}
          href={buildHref(item)}
        />
      ))}
    </div>
  );
}

export function TodayAgendaList({
  items,
  buildHref,
}: {
  items: TodayAgendaItem[];
  buildHref: (item: TodayAgendaItem) => string;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-foreground-muted">Nothing scheduled or due today.</p>
    );
  }

  return (
    <div>
      {items.map((item) => (
        <WorkstationRow
          key={item.id}
          title={`${item.timeLabel} · ${item.title}`}
          meta={item.identity}
          tone={item.tone}
          categoryLabel={item.categoryLabel ?? item.ownerLabel}
          actionLabel="Open"
          href={buildHref(item)}
        />
      ))}
    </div>
  );
}

export function WeekStrip({ days }: { days: WeekDaySummary[] }) {
  if (days.length === 0) {
    return <p className="text-sm text-foreground-muted">No scheduled work this week.</p>;
  }

  return (
    <section className="border-t border-border pt-4">
      <h2 className="mb-3 text-sm font-semibold text-foreground">This week</h2>
      <div className="grid grid-cols-2 gap-0 sm:grid-cols-4 lg:grid-cols-7">
        {days.map((day) => (
          <div
            key={day.dayLabel + day.date.toISOString()}
            className={`min-h-[4.5rem] border-border px-3 py-2 first:pl-0 lg:border-r lg:last:border-r-0 ${day.isToday ? "bg-foreground/[0.03]" : ""}`}
          >
            <p className="text-xs text-foreground-subtle">{day.dayLabel}</p>
            <p className="mt-1 text-xs leading-relaxed text-foreground-muted">{day.summary}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function QueueRowList({
  items,
  buildHref,
  emptyMessage,
}: {
  items: QueueRowItem[];
  buildHref: (item: QueueRowItem) => string;
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-foreground-muted">{emptyMessage}</p>;
  }

  return (
    <div>
      {items.map((item) => (
        <WorkstationRow
          key={item.id}
          title={item.title}
          meta={item.subtitle}
          reason={item.reason}
          tone={item.tone}
          categoryLabel={item.statusLabel ?? item.categoryLabel}
          actionLabel={item.nextAction}
          href={buildHref(item)}
        />
      ))}
    </div>
  );
}

export function ActivityFeedList({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-foreground-muted">No recent activity.</p>;
  }

  return (
    <div>
      {items.map((item) => (
        <div key={item.id} className="border-t border-border py-3 first:border-t-0">
          <p className="truncate text-sm text-foreground">{item.title}</p>
          <p className="truncate text-xs text-foreground-muted">{item.subtitle}</p>
        </div>
      ))}
    </div>
  );
}

/** @deprecated Use WorkstationStatusBar */
export const WorkstationSignalStrip = WorkstationStatusBar;
