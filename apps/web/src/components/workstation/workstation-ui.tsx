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
              {item.isBlocked && (
                <span className="flex items-center gap-1 text-xs font-medium text-danger">
                  <AlertCircle className="size-3" />
                  {item.missingSignals ? "Waiting on info" : "Blocked"}
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

function isGenericWorkstationAction(label: string | undefined): boolean {
  return /^(Complete the task\.?|Resolve blocker\.?)$/i.test(label ?? "");
}

export function WorkstationQueueItem({ 
  item, 
  isSelected 
}: { 
  item: WorkstationWorkItem; 
  isSelected?: boolean;
}) {
  const isHighPriority = item.priority === "critical" || item.priority === "high";
  const contextLine = item.contextLine ?? item.parentLabel ?? item.subtitle;
  const actionLabel = item.actionLabel ?? item.nextStep;
  const showAction = Boolean(actionLabel) && !isGenericWorkstationAction(actionLabel);

  const itemClass = [
    "group relative flex items-center justify-between rounded-lg border border-border p-4 transition-all hover:bg-foreground/[0.02] hover:border-border-strong",
    isSelected ? "ring-2 ring-accent ring-offset-2" : "",
    isHighPriority ? "bg-danger/[0.005] border-danger/10" : "",
  ].filter(Boolean).join(" ");

  return (
    <Link 
      href={item.href || "#"}
      className={itemClass}
      scroll={false}
      onClick={() => workstationTelemetry.trackLaneClick(item.lane, item.id, item.kind)}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium capitalize text-foreground-subtle">
            {item.kind.replace("-", " ")}
          </span>
          {item.isBlocked && (
            <span className="flex items-center gap-1 text-xs font-medium text-danger">
              <AlertCircle className="size-2.5" />
              {item.missingSignals ? "Waiting" : "Blocked"}
            </span>
          )}
          {item.missingSignals && (
            <div className="flex flex-wrap gap-1">
              {item.missingSignals.map(s => (
                <span key={s} className="rounded-md bg-brand-muted px-1 py-0.5 text-[0.6rem] font-medium text-accent">
                  {s.replace(/_/g, " ").toLowerCase()}
                </span>
              ))}
            </div>
          )}
          {isHighPriority && !item.isBlocked && (
            <span className="inline-flex size-1.5 rounded-full bg-danger animate-pulse" />
          )}
        </div>
        <div className="flex items-baseline gap-3">
          <h4 className="truncate text-sm font-bold text-foreground">
            {item.title}
          </h4>
          {showAction ? (
            <span className="shrink-0 text-xs font-semibold text-foreground">
              {actionLabel}
            </span>
          ) : null}
        </div>
        {contextLine ? (
          <p
            className="truncate text-xs text-foreground-muted"
            title={contextLine}
          >
            {contextLine}
          </p>
        ) : null}
        <p className="truncate text-xs text-foreground-muted">
          {item.reason}
        </p>
      </div>
      <div className="ml-4 shrink-0 text-foreground-subtle group-hover:text-foreground transition-colors">
        <ChevronRight className="size-5" />
      </div>
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
              href="/leads" 
              className="text-sm font-medium text-foreground-muted hover:text-foreground"
            >
              Browse Sales
            </Link>
            <Link 
              href="/jobs" 
              className="text-sm font-medium text-foreground-muted hover:text-foreground"
            >
              Review Jobs
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
