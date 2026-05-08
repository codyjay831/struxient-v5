"use client";

import Link from "next/link";
import { ChevronRight, ArrowRight, CheckCircle2 } from "lucide-react";
import { type WorkstationWorkItem } from "@/lib/workstation-query";

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
    "inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider",
    isHighPriority ? "bg-danger/10 text-danger" : "bg-foreground/10 text-foreground",
  ].filter(Boolean).join(" ");

  return (
    <Link 
      href={item.href || "#"} 
      className={cardClass}
      aria-label={`Open ${item.kind}: ${item.title}`}
      scroll={false}
    >
      <div className="p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1 space-y-4">
            <div className="flex items-center gap-3">
              <span className={badgeClass}>
                Primary Focus
              </span>
              {item.status && (
                <span className="text-[0.65rem] font-bold uppercase tracking-wider text-foreground-subtle">
                  {item.status}
                </span>
              )}
            </div>

            <div className="space-y-1">
              <h3 className="text-2xl font-bold tracking-tight text-foreground sm:text-4xl">
                {item.title}
              </h3>
              {item.subtitle && (
                <p className="text-sm font-semibold text-foreground-muted">
                  {item.subtitle}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-6 pt-2 sm:flex-row sm:gap-12">
              <div className="space-y-1">
                <p className="text-[0.65rem] font-bold uppercase tracking-wider text-foreground-subtle">
                  Reason
                </p>
                <p className="text-base italic leading-relaxed text-foreground-muted">
                  {item.reason}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[0.65rem] font-bold uppercase tracking-wider text-foreground-subtle">
                  Next step
                </p>
                <p className="text-base font-bold leading-relaxed text-foreground">
                  {item.nextStep}
                </p>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-end sm:pt-2">
            <div className="rounded-full bg-foreground p-3 text-background shadow-lg transition-transform group-hover:scale-105">
              <ArrowRight className="size-6" />
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function WorkstationQueueItem({ 
  item, 
  isSelected 
}: { 
  item: WorkstationWorkItem; 
  isSelected?: boolean;
}) {
  const isHighPriority = item.priority === "critical" || item.priority === "high";

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
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-[0.6rem] font-bold uppercase tracking-wider text-foreground-subtle">
            {item.kind}
          </span>
          {isHighPriority && (
            <span className="inline-flex size-1.5 rounded-full bg-danger animate-pulse" />
          )}
        </div>
        <div className="flex items-baseline gap-3">
          <h4 className="truncate text-sm font-bold text-foreground">
            {item.title}
          </h4>
          <span className="shrink-0 text-xs text-foreground-muted">
            {item.nextStep}
          </span>
        </div>
        <p className="truncate text-xs italic text-foreground-muted">
          {item.reason}
        </p>
      </div>
      <div className="ml-4 shrink-0 text-foreground-subtle group-hover:text-foreground transition-colors">
        <ChevronRight className="size-5" />
      </div>
    </Link>
  );
}

export function WorkstationClearedState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
      <div className="mb-4 rounded-full bg-foreground/[0.03] p-4">
        <CheckCircle2 className="size-10 text-foreground-subtle" />
      </div>
      <h3 className="text-xl font-bold text-foreground">Today is clear</h3>
      <p className="mt-2 max-w-sm text-sm text-foreground-muted">
        No urgent lead, quote, payment, job, task, or activity reviews need action right now.
      </p>
      <div className="mt-8 flex gap-4">
        <Link 
          href="/leads" 
          className="text-xs font-semibold uppercase tracking-wider text-foreground-muted hover:text-foreground"
        >
          Browse Leads
        </Link>
        <Link 
          href="/jobs" 
          className="text-xs font-semibold uppercase tracking-wider text-foreground-muted hover:text-foreground"
        >
          Review Jobs
        </Link>
      </div>
    </div>
  );
}
