"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { QuoteExecutionReviewOrphan } from "@/lib/quote-execution-review-preview-model";
import { workspaceFormSecondaryButtonClass } from "@/components/line-item-templates/line-item-template-form-fields";
import {
  addQuotePlanDependencyProviderTaskAction,
  connectQuotePlanDependencyGapToTaskAction,
  relaxQuotePlanDependencyHardSignalAction,
  removeQuotePlanDependencyRequirementAction,
} from "@/app/(workspace)/quotes/quote-plan-actions";
import { buildMissingProviderGapCopy } from "@/lib/signal-display-copy";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";

const secondaryButtonClass = workspaceFormSecondaryButtonClass;
const primaryButtonClass =
  "inline-flex items-center justify-center rounded-md bg-accent px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-accent-contrast disabled:cursor-not-allowed disabled:opacity-60";
const dangerButtonClass =
  "inline-flex items-center justify-center rounded-md border border-danger/40 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-danger transition-colors hover:bg-danger/5 disabled:cursor-not-allowed disabled:opacity-60";

type PlanTaskChoice = {
  id: string;
  title: string;
  stageId: string | null;
  category: string;
};

function gapActionErrorMessage(message: string): string {
  const lowered = message.toLowerCase();
  if (lowered.includes("selected task") || lowered.includes("not found")) {
    return "Selected task is no longer available.";
  }
  if (lowered.includes("not editable") || lowered.includes("locked")) {
    return "This plan is no longer editable.";
  }
  return "Could not apply this fix. The quote may have changed. Refresh and try again.";
}

function scoreProviderCandidate(
  candidate: PlanTaskChoice,
  consumerLineId: string,
  candidateLineIds: string[],
  consumerStageId: string | null,
  signal: string,
): number {
  let score = 0;
  if (candidateLineIds.includes(consumerLineId)) {
    score += 100;
  }
  if (consumerStageId && candidate.stageId === consumerStageId) {
    score += 50;
  }
  const signalWords = signal
    .toLowerCase()
    .replace(/[\s._-]+/g, " ")
    .split(" ")
    .filter(Boolean);
  const titleLower = candidate.title.toLowerCase();
  for (const word of signalWords) {
    if (titleLower.includes(word)) {
      score += 10;
    }
  }
  if (
    (signal.toLowerCase().includes("weather") || signal.toLowerCase().includes("access")) &&
    candidate.category === "SCHEDULING"
  ) {
    score += 20;
  }
  return score;
}

function HardDependencyGapCard({
  quoteId,
  orphan,
  executionPlanningEditable,
  lineLabelById,
  planTasks,
  taskLineIdsByTaskId,
}: {
  quoteId: string;
  orphan: QuoteExecutionReviewOrphan;
  executionPlanningEditable: boolean;
  lineLabelById: Record<string, string>;
  planTasks: readonly PlanTaskChoice[];
  taskLineIdsByTaskId: Record<string, string[]>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedProviderTaskId, setSelectedProviderTaskId] = useState("");
  const [isConnectOpen, setIsConnectOpen] = useState(false);
  const copy = buildMissingProviderGapCopy(orphan.signal, orphan.consumerTaskTitle);
  const canRelaxBlocking = orphan.consumerTaskRequiresSignalCount === 1;

  const providerCandidates = useMemo(() => {
    const candidates: Array<{
      lineIds: string[];
      lineLabel: string;
      task: PlanTaskChoice;
      score: number;
    }> = [];
    for (const task of planTasks) {
      if (task.id === orphan.consumerTaskId) {
        continue;
      }
      const lineIds = taskLineIdsByTaskId[task.id] ?? [];
      candidates.push({
        lineIds,
        lineLabel: lineIds.map((id) => lineLabelById[id] ?? "Line").join(", "),
        task,
        score: scoreProviderCandidate(
          task,
          orphan.consumerLineId,
          lineIds,
          orphan.consumerStageId,
          orphan.signal,
        ),
      });
    }
    return candidates.sort((a, b) => b.score - a.score || a.task.title.localeCompare(b.task.title));
  }, [
    lineLabelById,
    orphan.consumerLineId,
    orphan.consumerStageId,
    orphan.consumerTaskId,
    orphan.signal,
    planTasks,
    taskLineIdsByTaskId,
  ]);

  const groupedCandidates = useMemo(() => {
    const groups = new Map<string, { lineLabel: string; options: typeof providerCandidates }>();
    for (const candidate of providerCandidates) {
      const key = candidate.lineIds.join("|") || "unscoped";
      const existing = groups.get(key);
      if (existing) {
        existing.options.push(candidate);
      } else {
        groups.set(key, {
          lineLabel: candidate.lineLabel,
          options: [candidate],
        });
      }
    }
    return Array.from(groups.entries());
  }, [providerCandidates]);

  const runGapAction = (run: () => Promise<{ ok: boolean; error?: string }>, successMessage: string) => {
    startTransition(async () => {
      try {
        const result = await run();
        if (!result.ok) {
          toast.error(gapActionErrorMessage(result.error ?? ""));
          return;
        }
        toast.success(successMessage);
        toast.success("Gap fixed. Re-checking job readiness...");
        router.refresh();
      } catch {
        toast.error("Could not apply this fix. The quote may have changed. Refresh and try again.");
      }
    });
  };

  return (
    <li className="rounded-lg border border-border bg-background/50 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-danger">
            Required before job creation
          </span>
          <p className="mt-2 text-sm font-semibold text-foreground">{copy.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-foreground-muted">{copy.explanation}</p>
          <div className="mt-2 space-y-1 text-[10px] text-foreground-muted">
            <p>
              Blocked task: <span className="font-semibold text-foreground">{orphan.consumerTaskTitle}</span>
            </p>
            <p>
              Line item:{" "}
              <span className="font-semibold text-foreground">{orphan.consumerLineDescription}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={primaryButtonClass}
          disabled={!executionPlanningEditable || isPending}
          onClick={() =>
            runGapAction(
              () =>
                addQuotePlanDependencyProviderTaskAction({
                  quoteId,
                  consumerTaskId: orphan.consumerTaskId,
                  signal: orphan.signal,
                }),
              "Provider task added to plan.",
            )
          }
        >
          Add provider task
        </button>
        <button
          type="button"
          className={secondaryButtonClass}
          disabled={!executionPlanningEditable || isPending || providerCandidates.length === 0}
          onClick={() => setIsConnectOpen((open) => !open)}
        >
          Connect to existing task
        </button>
        <button
          type="button"
          className={dangerButtonClass}
          disabled={!executionPlanningEditable || isPending}
          onClick={() => {
            const confirmed = window.confirm(
              `Remove ${orphan.signal} from this task's required signals? This may allow work to start without confirming ${copy.readableSignal}.`,
            );
            if (!confirmed) {
              return;
            }
            runGapAction(
              () =>
                removeQuotePlanDependencyRequirementAction({
                  quoteId,
                  consumerTaskId: orphan.consumerTaskId,
                  signal: orphan.signal,
                }),
              "Requirement removed from plan.",
            );
          }}
        >
          Remove requirement
        </button>
      </div>
      {!executionPlanningEditable ? (
        <p className="mt-2 text-[10px] text-foreground-subtle">This plan is no longer editable.</p>
      ) : null}
      {executionPlanningEditable && providerCandidates.length === 0 ? (
        <p className="mt-2 text-[10px] text-foreground-subtle">No suitable existing plan tasks found.</p>
      ) : null}

      {isConnectOpen ? (
        <div className="mt-3 rounded-md border border-border bg-surface p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
            Connect this gap to a provider task
          </p>
          <label className="mt-2 block">
            <span className="text-[10px] text-foreground-muted">Provider task</span>
            <select
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
              value={selectedProviderTaskId}
              onChange={(event) => setSelectedProviderTaskId(event.target.value)}
              disabled={isPending || !executionPlanningEditable}
            >
              <option value="">Select a task</option>
              {groupedCandidates.map(([key, group]) => (
                <optgroup key={key} label={group.lineLabel}>
                  {group.options.map((candidate) => (
                    <option key={candidate.task.id} value={candidate.task.id}>
                      {candidate.task.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className={primaryButtonClass}
              disabled={!executionPlanningEditable || isPending || !selectedProviderTaskId}
              onClick={() =>
                runGapAction(
                  () =>
                    connectQuotePlanDependencyGapToTaskAction({
                      quoteId,
                      consumerTaskId: orphan.consumerTaskId,
                      providerTaskId: selectedProviderTaskId,
                      signal: orphan.signal,
                    }),
                  "Connected to existing plan task.",
                )
              }
            >
              Connect task
            </button>
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => setIsConnectOpen(false)}
              disabled={isPending}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <details className="mt-3 rounded-md border border-border/70 bg-surface/70 p-2">
        <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
          Advanced details
        </summary>
        <div className="mt-2 space-y-1 text-[10px] text-foreground-muted">
          <p>
            Missing signal: <span className="font-mono text-foreground">{orphan.signal}</span>
          </p>
          <p>Rule type: hard dependency</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={!executionPlanningEditable || isPending || !canRelaxBlocking}
              onClick={() => {
                const confirmed = window.confirm(
                  "This changes this task from activation-blocking to non-blocking for all of its required signals.",
                );
                if (!confirmed) {
                  return;
                }
                runGapAction(
                  () =>
                    relaxQuotePlanDependencyHardSignalAction({
                      quoteId,
                      consumerTaskId: orphan.consumerTaskId,
                    }),
                  "Relaxed activation blocking for this plan task.",
                );
              }}
            >
              Relax activation blocking for this task
            </button>
            {!canRelaxBlocking ? (
              <p className="text-[10px] text-foreground-subtle">
                This task has multiple required signals. Relaxing would affect all of them.
              </p>
            ) : null}
          </div>
        </div>
      </details>
    </li>
  );
}

export function QuoteExecutionDependencyGapsPanel({
  quoteId,
  orphans,
  executionPlanningEditable,
  lineLabelById,
  planTasks,
  taskLineIdsByTaskId,
}: {
  quoteId: string;
  orphans: readonly QuoteExecutionReviewOrphan[];
  executionPlanningEditable: boolean;
  lineLabelById: Record<string, string>;
  planTasks: readonly PlanTaskChoice[];
  taskLineIdsByTaskId: Record<string, string[]>;
}) {
  if (orphans.length === 0) {
    return null;
  }

  return (
    <div id="execution-dependency-gaps" className="scroll-mt-20">
      <div className="flex gap-3">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">Dependency gaps</h3>
          <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
            These prerequisites are required but do not yet have an upstream task in the execution plan.
            <strong> Auto-resolved gaps</strong> are handled during job creation.
            <strong> Required gaps</strong> must be resolved before creating the job.
          </p>
          <ul className="mt-4 space-y-3">
            {orphans.map((orphan) =>
              orphan.isHard ? (
                <HardDependencyGapCard
                  key={`${orphan.consumerTaskId}:${orphan.signal}`}
                  quoteId={quoteId}
                  orphan={orphan}
                  executionPlanningEditable={executionPlanningEditable}
                  lineLabelById={lineLabelById}
                  planTasks={planTasks}
                  taskLineIdsByTaskId={taskLineIdsByTaskId}
                />
              ) : (
                <li
                  key={`${orphan.consumerTaskId}:${orphan.signal}`}
                  className="rounded-lg border border-border bg-background/50 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warning">
                      Auto-resolved gap
                    </span>
                    <p className="text-xs text-foreground-muted">
                      {orphan.consumerTaskTitle} can proceed because this dependency is auto-satisfied at job
                      creation.
                    </p>
                  </div>
                </li>
              ),
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
