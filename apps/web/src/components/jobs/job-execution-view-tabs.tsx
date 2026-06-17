"use client";

import type { JobExecutionViewMode } from "@/lib/job-execution-view-model";

const tabClass =
  "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors";

function tabClasses(active: boolean): string {
  return active
    ? `${tabClass} border-accent bg-accent/10 text-accent`
    : `${tabClass} border-border bg-surface text-foreground-muted hover:border-border-strong hover:text-foreground`;
}

export function JobExecutionViewTabs({
  activeView,
  onViewChange,
  summary,
}: {
  activeView: JobExecutionViewMode;
  onViewChange: (view: JobExecutionViewMode) => void;
  summary: {
    totalTasks: number;
    blockedCount: number;
    needsSchedulingCount: number;
  };
}) {
  const tabs: Array<{ id: JobExecutionViewMode; label: string; hint?: string }> = [
    { id: "work", label: "Work plan" },
    {
      id: "flow",
      label: "Flow",
      hint: summary.blockedCount > 0 ? `${summary.blockedCount} blocked` : undefined,
    },
    {
      id: "timeline",
      label: "Timeline",
      hint:
        summary.needsSchedulingCount > 0
          ? `${summary.needsSchedulingCount} need schedule`
          : undefined,
    },
  ];

  return (
    <div
      className="mb-4 flex flex-wrap items-center gap-2"
      role="tablist"
      aria-label="Execution view"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeView === tab.id}
          onClick={() => onViewChange(tab.id)}
          className={tabClasses(activeView === tab.id)}
        >
          {tab.label}
          {tab.hint ? (
            <span className="ml-1.5 rounded bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground-subtle">
              {tab.hint}
            </span>
          ) : null}
        </button>
      ))}
      <span className="ml-auto text-[10px] uppercase tracking-wide text-foreground-subtle">
        {summary.totalTasks} task{summary.totalTasks === 1 ? "" : "s"}
      </span>
    </div>
  );
}
