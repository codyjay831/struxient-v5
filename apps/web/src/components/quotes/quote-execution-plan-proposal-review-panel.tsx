"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, ClipboardList, Loader2, X } from "lucide-react";
import { TaskTemplateCategory } from "@prisma/client";
import type {
  QuotePlanProposal,
  QuotePlanProposalOperation,
} from "@/lib/quote-plan/quote-plan-proposal-schema";
import { getTaskTemplateCategoryLabel } from "@/lib/task-template-category";
import { analyzeExecutionSignals } from "@/lib/execution-signal-analysis";
import { normalizeSignalKey } from "@/lib/signal-key";
import {
  buildMissingProviderGapCopy,
  buildProviderTaskTitle,
  signalLooksSchedulingOrAccessRelated,
} from "@/lib/signal-display-copy";
import {
  workspaceFormFieldLabelClass,
  workspaceFormPrimaryButtonClass,
  workspaceFormSecondaryButtonClass,
} from "@/components/line-item-templates/line-item-template-form-fields";
import { shouldShowQuotePlanProposalApplyAction } from "@/lib/quote-plan/proposal-guards";

const fieldLabelClass = workspaceFormFieldLabelClass;
const primaryButtonClass = workspaceFormPrimaryButtonClass;
const secondaryButtonClass = workspaceFormSecondaryButtonClass;

function subscribeNoop() {
  return () => {};
}

function useIsClientMounted() {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

function operationLabel(operation: QuotePlanProposalOperation): string {
  switch (operation.type) {
    case "ADD_TASK":
      return operation.task.title;
    case "UPDATE_TASK":
      return `Update task ${operation.taskId.slice(0, 8)}…`;
    case "CANCEL_TASK":
      return `Remove task ${operation.taskId.slice(0, 8)}…`;
    case "RELINK_TASK_SCOPE":
      return `Relink scope for task ${operation.taskId.slice(0, 8)}…`;
  }
}

type AddTaskOperation = Extract<QuotePlanProposalOperation, { type: "ADD_TASK" }>;
type StageRow = { id: string; name: string };

function partitionProposalOperations(operations: QuotePlanProposalOperation[]) {
  const addTasks: AddTaskOperation[] = [];
  const other: QuotePlanProposalOperation[] = [];
  for (const operation of operations) {
    if (operation.type === "ADD_TASK") {
      addTasks.push(operation);
    } else {
      other.push(operation);
    }
  }
  return { addTasks, other };
}

function groupAddTaskOperationsByStage(
  addTasks: AddTaskOperation[],
  stages: readonly StageRow[],
  stageNameById: Record<string, string>,
): Array<{ stageKey: string; stageName: string; operations: AddTaskOperation[] }> {
  const byStageKey = new Map<string, AddTaskOperation[]>();
  for (const operation of addTasks) {
    const stageKey = operation.task.stageId ?? "";
    const existing = byStageKey.get(stageKey);
    if (existing) {
      existing.push(operation);
    } else {
      byStageKey.set(stageKey, [operation]);
    }
  }

  const groups: Array<{ stageKey: string; stageName: string; operations: AddTaskOperation[] }> =
    [];
  const seen = new Set<string>();

  for (const stage of stages) {
    const operations = byStageKey.get(stage.id);
    if (!operations?.length) continue;
    groups.push({
      stageKey: stage.id,
      stageName: stage.name,
      operations,
    });
    seen.add(stage.id);
  }

  const noStageOps = byStageKey.get("");
  if (noStageOps?.length) {
    groups.push({ stageKey: "", stageName: "No stage", operations: noStageOps });
    seen.add("");
  }

  for (const [stageKey, operations] of byStageKey) {
    if (seen.has(stageKey) || operations.length === 0) continue;
    groups.push({
      stageKey,
      stageName: stageNameById[stageKey] ?? "Unknown stage",
      operations,
    });
  }

  return groups;
}

function removeSignalByEquivalence(signals: string[], signal: string): string[] {
  const target = normalizeSignalKey(signal);
  return signals.filter((entry) => normalizeSignalKey(entry) !== target);
}

function nextProposalOpId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${random}`;
}

function withProposalSelection(proposal: QuotePlanProposal | null): Set<string> {
  if (!proposal) return new Set();
  return new Set(proposal.operations.map((operation) => operation.opId));
}

function buildProposalSignalAnalysis(proposal: QuotePlanProposal | null) {
  if (!proposal) {
    return { addTasks: [] as AddTaskOperation[], analysis: null as null | ReturnType<typeof analyzeExecutionSignals> };
  }
  const addTasks = proposal.operations.filter(
    (operation): operation is AddTaskOperation => operation.type === "ADD_TASK",
  );
  const analysis = analyzeExecutionSignals(
    addTasks.map((operation) => ({
      id: operation.opId,
      title: operation.task.title,
      stageId: operation.task.stageId ?? null,
      requiresSignals: operation.task.requiresSignals,
      providesSignals: operation.task.providesSignals,
      hardSignal: operation.task.hardSignal,
    })),
  );
  return { addTasks, analysis };
}

const operationRowClass = (selected: boolean) =>
  `flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
    selected
      ? "border-accent/40 bg-accent/[0.03]"
      : "border-border bg-surface hover:border-border-strong"
  }`;

function OperationRow({
  operation,
  selected,
  lineLabelById,
  showStage = false,
  stageNameById,
  onToggle,
}: {
  operation: QuotePlanProposalOperation;
  selected: boolean;
  lineLabelById: Record<string, string>;
  showStage?: boolean;
  stageNameById: Record<string, string>;
  onToggle: () => void;
}) {
  return (
    <label className={operationRowClass(selected)}>
      <input type="checkbox" checked={selected} onChange={onToggle} className="mt-1" />
      <OperationDetail
        operation={operation}
        stageNameById={stageNameById}
        lineLabelById={lineLabelById}
        showStage={showStage}
      />
    </label>
  );
}

function OperationDetail({
  operation,
  stageNameById,
  lineLabelById,
  showStage = false,
}: {
  operation: QuotePlanProposalOperation;
  stageNameById: Record<string, string>;
  lineLabelById: Record<string, string>;
  showStage?: boolean;
}) {
  if (operation.type === "ADD_TASK") {
    const task = operation.task;
    const stageName = task.stageId ? (stageNameById[task.stageId] ?? "Unknown stage") : "No stage";
    const categoryLabel = getTaskTemplateCategoryLabel(task.category);
    return (
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{task.title}</p>
        <p className="mt-0.5 text-xs text-foreground-muted">
          {showStage ? `${stageName} · ${categoryLabel}` : categoryLabel}
        </p>
        {task.lineItemIds.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {task.lineItemIds.map((lineId) => (
              <span
                key={lineId}
                className="rounded bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] text-foreground-muted"
              >
                {lineLabelById[lineId] ?? "Unknown scope"}
              </span>
            ))}
          </div>
        ) : null}
        {(task.requiresSignals.length > 0 || task.providesSignals.length > 0) && (
          <div className="mt-1.5 flex flex-wrap gap-2 text-[10px] text-foreground-subtle">
            {task.requiresSignals.length > 0 ? (
              <span>Needs: {task.requiresSignals.join(", ")}</span>
            ) : null}
            {task.providesSignals.length > 0 ? (
              <span>Provides: {task.providesSignals.join(", ")}</span>
            ) : null}
          </div>
        )}
        {operation.reason ? (
          <p className="mt-1 text-[11px] text-foreground-subtle">{operation.reason}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="min-w-0 flex-1">
      <p className="text-sm font-semibold text-foreground">{operationLabel(operation)}</p>
      {operation.reason ? (
        <p className="mt-1 text-xs text-foreground-muted">{operation.reason}</p>
      ) : null}
    </div>
  );
}

export type QuoteExecutionPlanProposalReviewPanelProps = {
  open: boolean;
  onClose: () => void;
  proposal: QuotePlanProposal | null;
  stages: readonly StageRow[];
  stageNameById: Record<string, string>;
  lineLabelById: Record<string, string>;
  hasExistingPlan: boolean;
  isApplying: boolean;
  proposalSource?: "ai" | "drafts";
  usedFallback?: boolean;
  fallbackReason?: string | null;
  onApply: (
    proposal: QuotePlanProposal,
    selectedOpIds: string[],
    replaceConfirmed: boolean,
  ) => Promise<void>;
};

export function QuoteExecutionPlanProposalReviewPanel({
  open,
  onClose,
  proposal,
  stages,
  stageNameById,
  lineLabelById,
  hasExistingPlan,
  isApplying,
  proposalSource = "ai",
  usedFallback = false,
  fallbackReason = null,
  onApply,
}: QuoteExecutionPlanProposalReviewPanelProps) {
  const mounted = useIsClientMounted();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selectedOpIds, setSelectedOpIds] = useState<Set<string>>(new Set());
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [prevProposal, setPrevProposal] = useState(proposal);
  const [workingProposal, setWorkingProposal] = useState<QuotePlanProposal | null>(proposal);

  const hasProposalOperations = shouldShowQuotePlanProposalApplyAction(workingProposal);
  const allAddOnly =
    workingProposal !== null &&
    workingProposal.operations.length > 0 &&
    workingProposal.operations.every((operation) => operation.type === "ADD_TASK");
  const needsReplaceConfirm = hasExistingPlan && allAddOnly;
  const canClose = !isApplying;

  if (proposal !== prevProposal) {
    setPrevProposal(proposal);
    setWorkingProposal(proposal);
    if (!proposal) {
      setSelectedOpIds(new Set());
      setReplaceConfirmed(false);
    } else {
      setSelectedOpIds(withProposalSelection(proposal));
      setReplaceConfirmed(false);
    }
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    function handleCancel(event: Event) {
      if (!canClose) {
        event.preventDefault();
        return;
      }
      onClose();
    }

    function handleClose() {
      if (open) onClose();
    }

    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("close", handleClose);
    return () => {
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("close", handleClose);
    };
  }, [canClose, onClose, open]);

  const toggleOperation = (opId: string) => {
    setSelectedOpIds((prev) => {
      const next = new Set(prev);
      if (next.has(opId)) next.delete(opId);
      else next.add(opId);
      return next;
    });
  };

  const applyDisabled =
    isApplying ||
    !hasProposalOperations ||
    selectedOpIds.size === 0 ||
    (needsReplaceConfirm && !replaceConfirmed) ||
    !workingProposal;

  const { addTasks, other } = workingProposal
    ? partitionProposalOperations(workingProposal.operations)
    : { addTasks: [], other: [] };
  const tasksByStage = groupAddTaskOperationsByStage(addTasks, stages, stageNameById);
  const signalAnalysis = buildProposalSignalAnalysis(workingProposal).analysis;
  const hardGaps = signalAnalysis?.hardMissingRequirements ?? [];
  const softGaps = signalAnalysis?.softMissingRequirements ?? [];

  const addTaskOperationById = new Map(addTasks.map((operation) => [operation.opId, operation]));

  function updateAddTaskOperation(opId: string, updater: (task: AddTaskOperation["task"]) => AddTaskOperation["task"]) {
    setWorkingProposal((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        operations: prev.operations.map((operation) => {
          if (operation.type !== "ADD_TASK" || operation.opId !== opId) return operation;
          return {
            ...operation,
            task: updater(operation.task),
          };
        }),
      };
    });
  }

  function handleRemoveRequirement(opId: string, signal: string) {
    updateAddTaskOperation(opId, (task) => ({
      ...task,
      requiresSignals: removeSignalByEquivalence(task.requiresSignals, signal),
    }));
  }

  function handleMarkAsSoft(opId: string) {
    updateAddTaskOperation(opId, (task) => ({
      ...task,
      hardSignal: false,
    }));
  }

  function handleAddProvider(opId: string, signal: string) {
    const consumer = addTaskOperationById.get(opId);
    if (!consumer) return;
    const providerOp: AddTaskOperation = {
      opId: nextProposalOpId("manual-provider"),
      type: "ADD_TASK",
      reason: "Manual dependency fix in proposal review.",
      task: {
        title: buildProviderTaskTitle(signal, consumer.task.title),
        category: signalLooksSchedulingOrAccessRelated(signal)
          ? TaskTemplateCategory.SCHEDULING
          : TaskTemplateCategory.GENERAL,
        stageId: consumer.task.stageId,
        instructions: null,
        requiresSignals: [],
        providesSignals: [signal],
        hardSignal: false,
        sourceTaskTemplateId: null,
        sourceType: "CUSTOM",
        origin: "MANUAL",
        planningTags: [],
        lineItemIds: consumer.task.lineItemIds,
      },
    };
    setWorkingProposal((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        operations: [...prev.operations, providerOp],
      };
    });
    setSelectedOpIds((prev) => {
      const next = new Set(prev);
      next.add(providerOp.opId);
      return next;
    });
  }

  const dialogNode = (
    <dialog
      ref={dialogRef}
      data-workspace-child-dialog="true"
      aria-labelledby="execution-plan-proposal-title"
      aria-busy={isApplying}
      className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-border bg-surface p-0 text-foreground shadow-2xl outline-none [&::backdrop]:bg-black/40 [&:not([open])]:hidden"
      onClick={(e) => {
        if (!canClose) return;
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 id="execution-plan-proposal-title" className="text-base font-semibold text-foreground">
              Review execution plan proposal
            </h2>
            <p className="mt-1 text-xs text-foreground-muted">
              {proposalSource === "drafts"
                ? "Per-line draft tasks copied into a whole-quote plan. Select what to apply."
                : "Review proposed tasks, scope links, and signals before applying to the quote-wide plan."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={!canClose}
            className="rounded-lg border border-border p-2 text-foreground-subtle hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {usedFallback && fallbackReason ? (
            <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>AI unavailable — seeded from per-line tasks. {fallbackReason}</span>
            </div>
          ) : null}

          {workingProposal?.summary ? (
            <div className="rounded-lg border border-border bg-foreground/[0.02] p-3">
              <p className={fieldLabelClass}>Summary</p>
              <p className="mt-1 text-sm text-foreground-muted">{workingProposal.summary}</p>
            </div>
          ) : null}

          {workingProposal?.assumptions && workingProposal.assumptions.length > 0 ? (
            <div className="space-y-1">
              <p className={fieldLabelClass}>Assumptions</p>
              <ul className="space-y-1 text-xs text-foreground-muted">
                {workingProposal.assumptions.map((item) => (
                  <li key={item}>· {item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {workingProposal?.warnings && workingProposal.warnings.length > 0 ? (
            <div className="space-y-1">
              <p className={fieldLabelClass}>Warnings</p>
              <ul className="space-y-1 text-xs text-warning">
                {workingProposal.warnings.map((item) => (
                  <li key={item} className="flex gap-2">
                    <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {signalAnalysis && (hardGaps.length > 0 || softGaps.length > 0) ? (
            <div className="space-y-2 rounded-lg border border-border bg-foreground/[0.02] p-3">
              <p className={fieldLabelClass}>Dependency review</p>
              {hardGaps.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-danger">Hard dependency gaps</p>
                  {hardGaps.map((gap) => {
                    const copy = buildMissingProviderGapCopy(gap.signal, gap.consumerTaskTitle);
                    return (
                      <div key={`${gap.consumerTaskId}-${gap.normalizedSignal}`} className="rounded border border-danger/30 bg-danger/5 p-2">
                        <p className="text-xs font-medium text-danger">{copy.title}</p>
                        <p className="mt-0.5 text-xs text-foreground-muted">
                          {copy.explanation} This must be fixed before activation.
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <button
                            type="button"
                            className="rounded border border-border px-2 py-0.5 text-[10px] text-foreground-muted hover:border-border-strong hover:text-foreground"
                            onClick={() => handleAddProvider(gap.consumerTaskId, gap.signal)}
                          >
                            Add provider task
                          </button>
                          <button
                            type="button"
                            className="rounded border border-border px-2 py-0.5 text-[10px] text-foreground-muted hover:border-border-strong hover:text-foreground"
                            onClick={() => handleMarkAsSoft(gap.consumerTaskId)}
                          >
                            Mark dependency soft
                          </button>
                          <button
                            type="button"
                            className="rounded border border-border px-2 py-0.5 text-[10px] text-foreground-muted hover:border-border-strong hover:text-foreground"
                            onClick={() => handleRemoveRequirement(gap.consumerTaskId, gap.signal)}
                          >
                            Remove requirement
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {softGaps.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-warning">Soft dependency gaps</p>
                  {softGaps.map((gap) => {
                    const copy = buildMissingProviderGapCopy(gap.signal, gap.consumerTaskTitle);
                    return (
                      <div key={`${gap.consumerTaskId}-${gap.normalizedSignal}`} className="rounded border border-warning/30 bg-warning/5 p-2">
                        <p className="text-xs font-medium text-warning">{copy.title}</p>
                        <p className="mt-0.5 text-xs text-foreground-muted">
                          {copy.explanation} This can be fixed after apply and does not block saving.
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <button
                            type="button"
                            className="rounded border border-border px-2 py-0.5 text-[10px] text-foreground-muted hover:border-border-strong hover:text-foreground"
                            onClick={() => handleAddProvider(gap.consumerTaskId, gap.signal)}
                          >
                            Add provider task
                          </button>
                          <button
                            type="button"
                            className="rounded border border-border px-2 py-0.5 text-[10px] text-foreground-muted hover:border-border-strong hover:text-foreground"
                            onClick={() => handleRemoveRequirement(gap.consumerTaskId, gap.signal)}
                          >
                            Remove requirement
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

          {hasProposalOperations && workingProposal ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className={fieldLabelClass}>
                  Proposed changes ({selectedOpIds.size} of {workingProposal.operations.length} selected)
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-[11px] font-medium text-accent hover:underline"
                    onClick={() =>
                      setSelectedOpIds(new Set(workingProposal.operations.map((operation) => operation.opId)))
                    }
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    className="text-[11px] font-medium text-foreground-muted hover:underline"
                    onClick={() => setSelectedOpIds(new Set())}
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="space-y-4">
                {tasksByStage.map((group) => (
                  <div key={group.stageKey || "__no_stage__"}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
                      {group.stageName}
                    </p>
                    <div className="mt-2 space-y-2">
                      {group.operations.map((operation) => (
                        <OperationRow
                          key={operation.opId}
                          operation={operation}
                          selected={selectedOpIds.has(operation.opId)}
                          lineLabelById={lineLabelById}
                          stageNameById={stageNameById}
                          onToggle={() => toggleOperation(operation.opId)}
                        />
                      ))}
                    </div>
                  </div>
                ))}

                {other.length > 0 ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
                      Other changes
                    </p>
                    <div className="mt-2 space-y-2">
                      {other.map((operation) => (
                        <OperationRow
                          key={operation.opId}
                          operation={operation}
                          selected={selectedOpIds.has(operation.opId)}
                          lineLabelById={lineLabelById}
                          stageNameById={stageNameById}
                          showStage
                          onToggle={() => toggleOperation(operation.opId)}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-foreground-muted">
              <ClipboardList className="mx-auto mb-2 size-5 text-foreground-subtle" />
              No operations in this proposal.
            </div>
          )}

          {needsReplaceConfirm ? (
            <label className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-foreground">
              <input
                type="checkbox"
                checked={replaceConfirmed}
                onChange={(e) => setReplaceConfirmed(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Replace unprotected plan tasks — applying will remove existing unprotected tasks and
                add the selected proposal tasks.
              </span>
            </label>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={!canClose}
            className={secondaryButtonClass}
          >
            Cancel
          </button>
          {hasProposalOperations ? (
            <button
              type="button"
              onClick={() => {
                if (!workingProposal || workingProposal.operations.length === 0) return;
                onApply(workingProposal, [...selectedOpIds], replaceConfirmed);
              }}
              disabled={applyDisabled}
              className={`${primaryButtonClass} inline-flex items-center gap-2`}
            >
              {isApplying ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Apply selected
            </button>
          ) : null}
        </div>
      </div>
    </dialog>
  );

  if (!mounted) return null;
  return createPortal(dialogNode, document.body);
}
