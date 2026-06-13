"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronRight, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";
import { workstationTelemetry } from "@/lib/workstation/telemetry";
import {
  parseWorkstationUrlState,
  buildWorkstationUrl,
} from "@/lib/workstation/url-state";
import {
  type WorkstationWorkItem,
  type WorkstationFilterCategory,
  type WorkstationLens,
} from "@/lib/workstation-query";

export function WorkstationFilterBar({ 
  currentFilter
}: { 
  currentFilter: WorkstationFilterCategory;
}) {
  const searchParams = useSearchParams();
  const urlState = parseWorkstationUrlState(searchParams);

  const filters: { id: WorkstationFilterCategory; label: string }[] = [
    { id: "all", label: "All" },
    { id: "leads", label: "Sales" },
    { id: "quotes", label: "Quotes" },
    { id: "jobs", label: "Jobs" },
    { id: "tasks", label: "Tasks" },
    { id: "issues", label: "Issues" },
    { id: "payments", label: "Payments" },
    { id: "logs", label: "Activity" },
  ];

  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
      {filters.map((f) => {
        const active = currentFilter === f.id;
        const href = buildWorkstationUrl(urlState, {
          filter: f.id,
          selected: undefined,
        });

        return (
          <Link
            key={f.id}
            href={href}
            className={[
              "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-foreground text-background"
                : "bg-foreground/[0.04] text-foreground-muted hover:bg-foreground/[0.08] hover:text-foreground",
            ].join(" ")}
          >
            {f.label}
          </Link>
        );
      })}
    </div>
  );
}

export function WorkstationFocusCard({ 
  item, 
  isSelected 
}: { 
  item: WorkstationWorkItem; 
  isSelected?: boolean;
}) {
  const isHighPriority = item.priority === "critical" || item.priority === "high";

  const cardClass = [
    "group relative block overflow-hidden rounded-xl border transition-all duration-200",
    isHighPriority 
      ? "border-danger/20 bg-danger/[0.01] shadow-md hover:border-danger/40" 
      : "border-border-strong bg-surface shadow-sm hover:border-accent/40",
    isSelected ? "ring-2 ring-accent ring-offset-2" : "",
  ].filter(Boolean).join(" ");

  const badgeClass = [
    "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
    isHighPriority ? "bg-danger/10 text-danger" : "bg-brand-muted text-accent",
  ].filter(Boolean).join(" ");

  return (
    <Link 
      href={item.href || "#"} 
      className={cardClass}
      aria-label={`Open ${item.kind}: ${item.title}`}
      scroll={false}
      onClick={() => workstationTelemetry.trackLaneClick(item.lane, item.id, item.kind)}
    >
      <div className="p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1 space-y-4">
            <div className="flex items-center gap-3">
              <span className={badgeClass}>
                {isHighPriority ? "Urgent Action" : "Next Action"}
              </span>
              {item.isWaitingOnSignals && (
                <span className="flex items-center gap-1 text-xs font-medium text-accent">
                  <AlertCircle className="size-3" />
                  Waiting on prior work
                </span>
              )}
              {item.isBlocked && !item.isWaitingOnSignals && (
                <span className="flex items-center gap-1 text-xs font-medium text-danger">
                  <AlertCircle className="size-3" />
                  Blocked
                </span>
              )}
              {item.missingSignals && (
                <div className="flex flex-wrap gap-1">
                  {item.missingSignals.map(s => (
                    <span key={s} className="rounded-md bg-brand-muted px-1.5 py-0.5 text-[0.65rem] font-medium text-accent">
                      {s.replace(/_/g, " ").toLowerCase()}
                    </span>
                  ))}
                </div>
              )}
              {item.status && (
                <span className="text-xs font-medium text-foreground-subtle">
                  {item.status}
                </span>
              )}
            </div>

            <div className="space-y-1">
              <h3 className="text-2xl font-bold tracking-tight text-foreground sm:text-4xl">
                {item.title}
              </h3>
              {(item.contextLine ?? item.parentLabel ?? item.subtitle) && (
                <p
                  className="truncate text-sm font-semibold text-foreground-muted"
                  title={item.contextLine ?? item.parentLabel ?? item.subtitle}
                >
                  {item.contextLine ?? item.parentLabel ?? item.subtitle}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-6 pt-2 sm:flex-row sm:gap-12">
              <div className="space-y-1">
                <p className="text-xs font-medium text-foreground-subtle">
                  Why it is here
                </p>
                <p className="text-base leading-relaxed text-foreground-muted">
                  {item.reason}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-foreground-subtle">
                  Next step
                </p>
                <p className="text-base font-bold leading-relaxed text-foreground">
                  {item.actionLabel ?? item.nextStep}
                </p>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-end sm:pt-2">
            <div className="rounded-full bg-accent p-3 text-accent-contrast shadow-md transition-transform group-hover:scale-105">
              <ArrowRight className="size-6" />
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

function isGenericAction(label: string | undefined): boolean {
  return /^(Complete the task\.?|Resolve blocker\.?|Wait for prerequisites\.?)$/i.test(label ?? "");
}

export function WorkstationQueueItem({
  item,
  isSelected,
}: {
  item: WorkstationWorkItem;
  isSelected?: boolean;
}) {
  const isCritical = item.priority === "critical" || (item.isBlocked && !item.isWaitingOnSignals);
  const isHigh = item.priority === "high";
  const contextLine = item.contextLine ?? item.parentLabel ?? item.subtitle;
  const actionLabel = item.actionLabel ?? item.nextStep;
  const showAction = Boolean(actionLabel) && !isGenericAction(actionLabel);

  const stripClass = isCritical
    ? "bg-danger"
    : isHigh
      ? "bg-danger/40"
      : item.filterCategory === "payments"
        ? "bg-amber-500"
        : "bg-foreground/10";

  return (
    <Link
      href={item.href || "#"}
      scroll={false}
      onClick={() => workstationTelemetry.trackLaneClick(item.lane, item.id, item.kind)}
      className={[
        "group flex items-center gap-3 rounded-lg border border-border px-4 py-3.5 transition-all hover:border-border-strong hover:bg-foreground/[0.015]",
        isSelected ? "ring-2 ring-accent ring-offset-1 border-accent/30" : "",
        isCritical ? "border-danger/15 bg-danger/[0.005]" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Priority strip */}
      <div
        className={`h-8 w-0.5 shrink-0 rounded-full ${stripClass}`}
        aria-hidden
      />

      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wide text-foreground-subtle">
            {item.kind.replace("-", " ")}
          </span>
          {item.isWaitingOnSignals && (
            <span className="flex items-center gap-0.5 text-[10px] font-semibold text-accent">
              <AlertCircle className="size-2.5" aria-hidden />
              Waiting
            </span>
          )}
          {item.isBlocked && !item.isWaitingOnSignals && (
            <span className="flex items-center gap-0.5 text-[10px] font-semibold text-danger">
              <AlertCircle className="size-2.5" aria-hidden />
              Blocked
            </span>
          )}
        </div>

        <h4 className="truncate text-sm font-semibold text-foreground">
          {item.title}
        </h4>

        {contextLine && (
          <p className="truncate text-xs text-foreground-muted" title={contextLine}>
            {contextLine}
          </p>
        )}

        {showAction && (
          <p className="truncate text-xs font-medium text-foreground-subtle">
            {actionLabel}
          </p>
        )}
      </div>

      <ChevronRight className="ml-2 size-4 shrink-0 text-foreground-subtle opacity-0 transition-opacity group-hover:opacity-60" />
    </Link>
  );
}

export function WorkstationClearedState({ 
  lens, 
  filter 
}: { 
  lens?: WorkstationLens; 
  filter?: WorkstationFilterCategory;
}) {
  const searchParams = useSearchParams();
  const urlState = parseWorkstationUrlState(searchParams);
  const isFiltered = filter && filter !== "all";
  
  let title = "Today is clear";
  let description = "No urgent sales, quote, payment, job, task, or activity reviews need action right now.";

  if (lens === "waiting") {
    title = "Nothing waiting";
    description = "You don't have any items waiting on external actions right now.";
  } else if (lens === "upcoming") {
    title = "Schedule is clear";
    description = "No upcoming tasks or follow-ups are scheduled for the near future.";
  } else if (isFiltered) {
    title = "No matches found";
    description = `No items match the selected filter in this view.`;
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
      <div className="mb-4 rounded-full bg-foreground/[0.03] p-4">
        <CheckCircle2 className="size-10 text-foreground-subtle" />
      </div>
      <h3 className="text-xl font-bold text-foreground">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-foreground-muted">
        {description}
      </p>
      <div className="mt-8 flex gap-4">
        {isFiltered ? (
          <Link 
            href={buildWorkstationUrl(urlState, {
              filter: "all",
              selected: undefined,
            })}
            className="text-sm font-medium text-accent hover:underline"
          >
            Clear Filters
          </Link>
        ) : (
          <>
            <Link
              href={buildWorkstationUrl(urlState, { lens: "all", filter: "tasks", selected: undefined })}
              className="text-sm font-medium text-foreground-muted hover:text-foreground"
            >
              Browse tasks
            </Link>
            <Link
              href="/workstation/jobs"
              className="text-sm font-medium text-foreground-muted hover:text-foreground"
            >
              Browse jobs
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
