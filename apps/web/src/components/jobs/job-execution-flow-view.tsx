"use client";

import { StatusBadge } from "@/components/ui/status-badge";
import { taskStateLabel, taskStateTone } from "@/lib/task-readiness";
import type { JobExecutionViewModel } from "@/lib/job-execution-view-model";
import { Zap } from "lucide-react";

export function JobExecutionFlowView({
  viewModel,
  onSelectTask,
}: {
  viewModel: JobExecutionViewModel;
  onSelectTask: (taskId: string) => void;
}) {
  const { flow, summary } = viewModel;

  const nodesByStage = flow.nodes.reduce<
    Record<string, typeof flow.nodes>
  >((acc, node) => {
    const key = node.stageTitle;
    acc[key] = acc[key] ?? [];
    acc[key]!.push(node);
    return acc;
  }, {});

  const stageOrder = [...viewModel.stages]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((stage) => stage.title);

  if (flow.nodes.length === 0) {
    return (
      <p className="text-xs text-foreground-muted">
        No tasks to map yet. Add work in the Work plan view first.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface/60 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-foreground-subtle">
            Dependencies
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
            {summary.handshakeCount}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface/60 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-foreground-subtle">
            Blocked
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
            {summary.blockedCount}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface/60 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-foreground-subtle">
            Ready
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
            {summary.readyCount}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface/60 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-foreground-subtle">
            Gaps
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
            {summary.orphanCount}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max gap-4">
          {stageOrder.map((stageTitle) => {
            const nodes = (nodesByStage[stageTitle] ?? []).sort(
              (a, b) => a.sortOrder - b.sortOrder,
            );
            if (nodes.length === 0) return null;
            return (
              <div
                key={stageTitle}
                className="w-56 shrink-0 rounded-xl border border-border bg-background p-3"
              >
                <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
                  {stageTitle}
                </p>
                <ul className="space-y-2">
                  {nodes.map((node) => (
                    <li key={node.taskId}>
                      <button
                        type="button"
                        onClick={() => onSelectTask(node.taskId)}
                        className="w-full rounded-lg border border-border bg-surface p-2.5 text-left transition-colors hover:border-border-strong hover:bg-foreground/[0.02]"
                      >
                        <div className="mb-1.5 flex items-start justify-between gap-2">
                          <span className="text-xs font-medium leading-snug text-foreground">
                            {node.title}
                          </span>
                          <StatusBadge
                            label={taskStateLabel(node.derivedState)}
                            tone={taskStateTone(node.derivedState)}
                          />
                        </div>
                        {node.isRecovery ? (
                          <p className="text-[10px] text-foreground-muted">Recovery task</p>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      {flow.edges.length > 0 ? (
        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
            Task dependencies
          </p>
          <ul className="space-y-2">
            {flow.edges.map((edge, index) => (
              <li
                key={`${edge.providerTaskId}-${edge.consumerTaskId}-${edge.signal}-${index}`}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs"
              >
                <button
                  type="button"
                  className="font-medium text-foreground underline-offset-2 hover:underline"
                  onClick={() => onSelectTask(edge.providerTaskId)}
                >
                  {edge.providerTaskTitle}
                </button>
                <span className="inline-flex items-center gap-1 font-mono text-[10px] text-accent">
                  <Zap className="size-3" />
                  {edge.signal}
                </span>
                <span className="text-foreground-subtle">→</span>
                <button
                  type="button"
                  className="font-medium text-foreground underline-offset-2 hover:underline"
                  onClick={() => onSelectTask(edge.consumerTaskId)}
                >
                  {edge.consumerTaskTitle}
                </button>
                <StatusBadge
                  label={edge.satisfied ? "Satisfied" : "Waiting"}
                  tone={edge.satisfied ? "neutral" : "warning"}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-foreground-muted">
          No signal dependencies between tasks. Tasks can proceed independently within their readiness rules.
        </p>
      )}

      {flow.orphans.length > 0 ? (
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-warning">
            Missing upstream work
          </p>
          <ul className="space-y-1.5 text-xs text-foreground-muted">
            {flow.orphans.map((orphan, index) => (
              <li key={`${orphan.consumerTaskId}-${orphan.signal}-${index}`}>
                <span className="font-medium text-foreground">{orphan.consumerTaskTitle}</span>
                {" needs "}
                <span className="font-mono text-accent">{orphan.signal}</span>
                {orphan.isHard ? " (required before activation)" : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
