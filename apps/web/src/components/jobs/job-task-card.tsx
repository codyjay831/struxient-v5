"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  deriveTaskState,
  taskStateLabel,
  taskStateTone,
} from "@/lib/task-readiness";
import { TaskWorkSurface } from "@/components/jobs/task-work-surface";
import type { JobTaskExecutionTask } from "@/components/jobs/job-task-execution-types";
import { ChevronRight, Lock, Zap } from "lucide-react";

type Task = JobTaskExecutionTask;

export function JobTaskCard({
  jobId,
  jobStageId,
  stageTitle,
  jobContextLabel,
  jobsiteAddressLine,
  customerId,
  leadEditHref,
  task,
  liveSignals,
}: {
  jobId: string;
  jobStageId: string;
  stageTitle: string;
  jobContextLabel: string;
  jobsiteAddressLine: string | null;
  customerId: string | null;
  leadEditHref: string | null;
  task: Task;
  liveSignals: string[];
}) {
  const router = useRouter();
  const [surfaceOpen, setSurfaceOpen] = useState(false);

  const derivedState = deriveTaskState(task as any, liveSignals, {
    recoveryFlowIssueId: task.recoveryFlow?.jobIssueId
  });
  const isCompleted = derivedState === "COMPLETED";
  const isBlockedByIssue = derivedState === "BLOCKED_BY_ISSUE";
  const isBlockedBySignal = derivedState === "BLOCKED_BY_SIGNAL";
  const isBlocked = isBlockedByIssue || isBlockedBySignal;
  
  const paymentBlocker = task.paymentBlockers.find((p) => p.status === "DUE");
  const missingSignals = task.requiresSignals.filter(s => !liveSignals.includes(s));

  const payload = {
    jobId,
    jobStageId,
    stageTitle,
    jobContextLabel,
    jobsiteAddressLine,
    customerId,
    leadEditHref,
    jobHref: `/jobs/${jobId}`,
    task,
    liveSignals,
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setSurfaceOpen(true)}
        className={[
          "group w-full rounded-lg border p-4 text-left transition-all",
          isCompleted ? "border-border bg-surface/40 opacity-90" : "",
          isBlocked ? "border-danger/30 bg-danger/5" : "",
          !isCompleted && !isBlocked ? "border-border bg-surface hover:border-border-strong" : "",
        ].join(" ")}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4
                className={`text-sm font-semibold ${
                  isCompleted ? "text-foreground-subtle line-through" : "text-foreground"
                }`}
              >
                {task.title}
              </h4>
              <StatusBadge label={taskStateLabel(derivedState)} tone={taskStateTone(derivedState)} />
            </div>
            <p className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
              {stageTitle}
            </p>
            {task.instructions && (
              <p className="line-clamp-2 text-xs text-foreground-muted">{task.instructions}</p>
            )}
            {isBlocked && (
              <div className="mt-1 space-y-1">
                {paymentBlocker && (
                  <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-danger-strong">
                    <Lock className="size-3 shrink-0" />
                    Payment: {paymentBlocker.title}
                  </p>
                )}
                {isBlockedByIssue && !paymentBlocker && (
                  <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-danger-strong">
                    <Lock className="size-3 shrink-0" />
                    Blocked by issue
                  </p>
                )}
                {isBlockedBySignal && (
                  <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-accent">
                    <Zap className="size-3 shrink-0" />
                    Waiting on: {missingSignals.join(", ")}
                  </p>
                )}
              </div>
            )}
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-foreground-muted group-hover:text-foreground">
            {isCompleted ? "View" : "Work task"}
            <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </button>

      {surfaceOpen ? (
        <div className="fixed inset-0 z-50 flex animate-in justify-end fade-in duration-200">
          <button
            type="button"
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            aria-label="Close task panel"
            onClick={() => {
              setSurfaceOpen(false);
              router.refresh();
            }}
          />
          <div
            className="relative z-10 flex h-full w-full max-w-lg border-l border-border-strong bg-surface shadow-2xl animate-in slide-in-from-right duration-300 sm:ring-1 sm:ring-ring/20"
            role="dialog"
            aria-modal="true"
            aria-label={`Task: ${task.title}`}
          >
            <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                <TaskWorkSurface
                  {...payload}
                  showCloseControl
                  onClose={() => {
                    setSurfaceOpen(false);
                    router.refresh();
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
