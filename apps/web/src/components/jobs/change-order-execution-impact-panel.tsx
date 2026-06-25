"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Plus, RefreshCw, Save, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChangeOrderButtonState } from "@/lib/change-order-flow";
import type {
  ChangeOrderExecutionImpactView,
  ChangeOrderExecutionTaskOpView,
} from "@/lib/change-order/change-order-execution-projection";
import type { ChangeOrderExecutionDeltaProposal } from "@/lib/change-order/execution-delta-schema";
import {
  addManualAddTaskToProposal,
  addManualCancelTaskToProposal,
  addManualModifyTaskToProposal,
  canSelectTaskForCancel,
  canSelectTaskForModify,
  ensureProposalForComposer,
  getTargetedTaskIds,
  removeTaskOperationFromProposal,
  updateTaskOperationInProposal,
  type ChangeOrderComposerTaskSnapshot,
} from "@/lib/change-order/change-order-execution-task-composer";
import { formatCents } from "@/lib/job-payment-display";

type ComposerForm = "cancel" | "modify" | "add" | null;

function OperationTypeBadge({ type }: { type: ChangeOrderExecutionTaskOpView["type"] }) {
  const label =
    type === "ADD_TASK" ? "Add task" : type === "CANCEL_TASK" ? "Cancel task" : "Modify task";
  return (
    <span className="inline-flex rounded-md bg-foreground/5 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
      {label}
    </span>
  );
}

function SourceBadge({ task }: { task: ChangeOrderExecutionTaskOpView }) {
  if (task.isGenerated) {
    return (
      <p className="inline-flex items-center gap-1 rounded-md bg-warning/10 px-2 py-1 text-xs text-warning">
        <Sparkles className="size-3 shrink-0" />
        {task.sourceLabel}
      </p>
    );
  }
  return <p className="text-xs font-medium text-foreground-muted">{task.sourceLabel}</p>;
}

function TaskOperationEditForm({
  task,
  onSave,
  onCancel,
}: {
  task: ChangeOrderExecutionTaskOpView;
  onSave: (patch: {
    title?: string;
    instructions?: string;
    reason?: string;
    internalNote?: string;
  }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(task.taskTitle);
  const [instructions, setInstructions] = useState(task.instructions ?? "");
  const [reason, setReason] = useState(task.reason);
  const [internalNote, setInternalNote] = useState(task.internalNote ?? "");

  return (
    <>
      {(task.type === "ADD_TASK" || task.type === "MODIFY_TASK") && (
        <label className="block space-y-1">
          <span className="text-xs text-foreground-muted">Task title</span>
          <input
            className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
      )}
      {(task.type === "ADD_TASK" || task.type === "MODIFY_TASK") && (
        <label className="block space-y-1">
          <span className="text-xs text-foreground-muted">Instructions</span>
          <textarea
            className="min-h-16 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
          />
        </label>
      )}
      <label className="block space-y-1">
        <span className="text-xs text-foreground-muted">Reason</span>
        <textarea
          className="min-h-16 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-foreground-muted">Internal note</span>
        <textarea
          className="min-h-16 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"
          value={internalNote}
          onChange={(event) => setInternalNote(event.target.value)}
        />
      </label>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() =>
            onSave({
              title,
              instructions,
              reason,
              internalNote,
            })
          }
        >
          Save op
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </>
  );
}

function TaskOperationCard({
  task,
  editable,
  editingOpId,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onRemove,
}: {
  task: ChangeOrderExecutionTaskOpView;
  editable: boolean;
  editingOpId: string | null;
  onStartEdit: (opId: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (
    opId: string,
    patch: { title?: string; instructions?: string; reason?: string; internalNote?: string },
  ) => void;
  onRemove: (opId: string) => void;
}) {
  const isEditing = editingOpId === task.opId;

  return (
    <li className="rounded-lg border border-border bg-background px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <OperationTypeBadge type={task.type} />
            <SourceBadge task={task} />
          </div>

          {isEditing ? (
            <TaskOperationEditForm
              key={task.opId}
              task={task}
              onSave={(patch) => onSaveEdit(task.opId, patch)}
              onCancel={onCancelEdit}
            />
          ) : (
            <>
              <p className="text-sm font-medium text-foreground">{task.taskTitle}</p>
              {task.instructions ? (
                <p className="text-xs text-foreground-muted">{task.instructions}</p>
              ) : null}
            </>
          )}

          {task.affectedScopeLabels.length > 0 ? (
            <p className="text-xs text-foreground-muted">
              Scope: {task.affectedScopeLabels.join(", ")}
            </p>
          ) : null}

          {task.existingTaskStatus ? (
            <p className="text-xs text-foreground-muted">Task status: {task.existingTaskStatus}</p>
          ) : null}

          {!isEditing ? (
            <>
              <p className="text-xs text-foreground-muted">{task.reason}</p>
              {task.internalNote ? (
                <p className="text-xs text-foreground-subtle">Note: {task.internalNote}</p>
              ) : null}
            </>
          ) : null}

          {task.validationErrors.length > 0 ? (
            <ul className="space-y-1 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-2 text-xs text-destructive">
              {task.validationErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
        </div>

        {editable && !isEditing ? (
          <div className="flex shrink-0 flex-col gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => onStartEdit(task.opId)}>
              Edit
            </Button>
            {task.canRemove ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onRemove(task.opId)}
              >
                <Trash2 className="size-4" />
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function TaskPicker({
  tasks,
  value,
  onChange,
  disabledIds,
}: {
  tasks: Array<ChangeOrderComposerTaskSnapshot & { disabledReason?: string }>;
  value: string;
  onChange: (taskId: string) => void;
  disabledIds?: Set<string>;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-foreground-muted">Job task</span>
      <select
        className="w-full rounded-md border border-border bg-surface px-2 py-2 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Select a task…</option>
        {tasks.map((task) => (
          <option
            key={task.id}
            value={task.id}
            disabled={disabledIds?.has(task.id)}
          >
            {task.title} ({task.status})
            {task.disabledReason ? ` — ${task.disabledReason}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ChangeOrderExecutionImpactPanel({
  impact,
  editable,
  executionChanged,
  mixedEditBlocked,
  mixedEditMessage,
  saveExecutionImpact,
  onSaveExecutionImpact,
  isSaving,
  unsavedBannerMessage,
  jobTasks,
  scopeItems,
  proposal,
  baseJobPlanVersion,
  onProposalChange,
  composerError,
  onComposerError,
  showConfirmNoWorkImpact,
  onConfirmNoWorkImpact,
}: {
  impact: ChangeOrderExecutionImpactView;
  editable: boolean;
  executionChanged?: boolean;
  mixedEditBlocked?: boolean;
  mixedEditMessage?: string | null;
  saveExecutionImpact?: ChangeOrderButtonState;
  onSaveExecutionImpact?: () => void;
  isSaving?: boolean;
  unsavedBannerMessage?: string;
  jobTasks: ChangeOrderComposerTaskSnapshot[];
  scopeItems: Array<{ id: string; description: string }>;
  proposal: ChangeOrderExecutionDeltaProposal | null;
  baseJobPlanVersion: number;
  onProposalChange: (proposal: ChangeOrderExecutionDeltaProposal) => void;
  composerError?: string | null;
  onComposerError?: (error: string | null) => void;
  showConfirmNoWorkImpact?: boolean;
  onConfirmNoWorkImpact?: () => void;
}) {
  const [activeForm, setActiveForm] = useState<ComposerForm>(null);
  const [editingOpId, setEditingOpId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [reason, setReason] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [selectedScopeIds, setSelectedScopeIds] = useState<string[]>([]);

  const targeted = useMemo(
    () => getTargetedTaskIds(ensureProposalForComposer(proposal, baseJobPlanVersion)),
    [proposal, baseJobPlanVersion],
  );

  const cancelCandidates = useMemo(
    () =>
      jobTasks.map((task) => {
        const allowed = canSelectTaskForCancel(task, targeted.cancelTaskIds);
        return {
          ...task,
          disabledReason: allowed.ok ? undefined : allowed.reason,
        };
      }),
    [jobTasks, targeted.cancelTaskIds],
  );

  const modifyCandidates = useMemo(
    () =>
      jobTasks.map((task) => {
        const allowed = canSelectTaskForModify(task, targeted.modifyTaskIds);
        return {
          ...task,
          disabledReason: allowed.ok ? undefined : allowed.reason,
        };
      }),
    [jobTasks, targeted.modifyTaskIds],
  );

  const disabledCancelIds = useMemo(
    () =>
      new Set(
        cancelCandidates
          .filter((task) => task.disabledReason)
          .map((task) => task.id),
      ),
    [cancelCandidates],
  );

  const disabledModifyIds = useMemo(
    () =>
      new Set(
        modifyCandidates
          .filter((task) => task.disabledReason)
          .map((task) => task.id),
      ),
    [modifyCandidates],
  );

  const allTaskOps = [...impact.addedTasks, ...impact.canceledTasks, ...impact.modifiedTasks];

  function renderTaskSection(title: string, tasks: ChangeOrderExecutionTaskOpView[]) {
    if (tasks.length === 0) {
      return null;
    }
    return (
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
          {title} ({tasks.length})
        </h4>
        <ul className="space-y-3">
          {tasks.map((task) => (
            <TaskOperationCard
              key={task.opId}
              task={task}
              editable={editable}
              editingOpId={editingOpId}
              onStartEdit={setEditingOpId}
              onCancelEdit={() => setEditingOpId(null)}
              onSaveEdit={handleSaveEdit}
              onRemove={handleRemove}
            />
          ))}
        </ul>
      </div>
    );
  }

  function resetForm() {
    setActiveForm(null);
    setSelectedTaskId("");
    setTitle("");
    setInstructions("");
    setReason("");
    setInternalNote("");
    setSelectedScopeIds([]);
    onComposerError?.(null);
  }

  function withProposal(
    updater: (
      current: ChangeOrderExecutionDeltaProposal,
    ) => { ok: true; proposal: ChangeOrderExecutionDeltaProposal } | { ok: false; error: string },
  ) {
    const current = ensureProposalForComposer(proposal, baseJobPlanVersion);
    const result = updater(current);
    if (!result.ok) {
      onComposerError?.(result.error);
      return;
    }
    onComposerError?.(null);
    onProposalChange(result.proposal);
    resetForm();
    setEditingOpId(null);
  }

  function handleAddCancel() {
    const task = jobTasks.find((row) => row.id === selectedTaskId);
    if (!task) {
      onComposerError?.("Select a task to cancel.");
      return;
    }
    withProposal((current) =>
      addManualCancelTaskToProposal({
        proposal: current,
        task,
        reason,
        internalNote,
      }),
    );
  }

  function handleAddModify() {
    const task = jobTasks.find((row) => row.id === selectedTaskId);
    if (!task) {
      onComposerError?.("Select a task to modify.");
      return;
    }
    withProposal((current) =>
      addManualModifyTaskToProposal({
        proposal: current,
        task,
        title,
        instructions,
        jobScopeItemIds: selectedScopeIds,
        reason,
        internalNote,
      }),
    );
  }

  function handleAddTask() {
    withProposal((current) =>
      addManualAddTaskToProposal({
        proposal: current,
        title,
        instructions,
        jobScopeItemIds: selectedScopeIds,
        reason,
        internalNote,
      }),
    );
  }

  function handleRemove(opId: string) {
    const current = ensureProposalForComposer(proposal, baseJobPlanVersion);
    onProposalChange(removeTaskOperationFromProposal(current, opId));
    onComposerError?.(null);
  }

  function handleSaveEdit(
    opId: string,
    patch: { title?: string; instructions?: string; reason?: string; internalNote?: string },
  ) {
    const current = ensureProposalForComposer(proposal, baseJobPlanVersion);
    onProposalChange(updateTaskOperationInProposal(current, opId, patch));
    setEditingOpId(null);
    onComposerError?.(null);
  }

  if (!impact.parsed) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        <p className="font-medium">Execution impact could not be loaded.</p>
        <ul className="mt-2 list-disc pl-5">
          {impact.parseErrors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Work impact</h3>
        <p className="mt-1 text-xs text-foreground-muted">
          Tasks to add, cancel, or change on the job after this Change Order is applied.
        </p>
      </div>

      {!editable ? (
        <div className="rounded-lg border border-border bg-foreground/[0.02] px-3 py-2 text-sm text-foreground-muted">
          Work impact is read-only at this stage. Review the proposed changes below.
        </div>
      ) : null}

      {impact.noWorkImpactConfirmed ? (
        <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">No work impact confirmed</p>
            <p className="mt-1 text-success/90">
              This Change Order changes commercial terms only. No job tasks will be added, changed,
              or canceled.
            </p>
          </div>
        </div>
      ) : editable && showConfirmNoWorkImpact && onConfirmNoWorkImpact ? (
        <div className="rounded-lg border border-border bg-foreground/[0.02] p-3 space-y-3">
          <div>
            <p className="text-sm font-medium text-foreground">Price-only Change Order</p>
            <p className="mt-1 text-xs text-foreground-muted">
              This Change Order changes price only. Confirm it does not change the work plan before
              sending.
            </p>
          </div>
          <Button type="button" size="sm" variant="secondary" onClick={onConfirmNoWorkImpact}>
            Mark as price-only / no work impact
          </Button>
        </div>
      ) : null}

      {editable && executionChanged && unsavedBannerMessage ? (
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-2">
            <p>{unsavedBannerMessage}</p>
            {saveExecutionImpact && onSaveExecutionImpact ? (
              <Button
                type="button"
                size="sm"
                variant="primary"
                disabled={saveExecutionImpact.disabled}
                title={saveExecutionImpact.reason ?? undefined}
                onClick={onSaveExecutionImpact}
              >
                {isSaving ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Save execution impact
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {editable && mixedEditBlocked && mixedEditMessage ? (
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{mixedEditMessage}</p>
        </div>
      ) : null}

      {editable ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={activeForm === "cancel" ? "primary" : "secondary"}
            onClick={() => setActiveForm(activeForm === "cancel" ? null : "cancel")}
          >
            <Plus className="size-4" />
            Add task cancellation
          </Button>
          <Button
            type="button"
            size="sm"
            variant={activeForm === "modify" ? "primary" : "secondary"}
            onClick={() => setActiveForm(activeForm === "modify" ? null : "modify")}
          >
            <Plus className="size-4" />
            Add task change
          </Button>
          <Button
            type="button"
            size="sm"
            variant={activeForm === "add" ? "primary" : "secondary"}
            onClick={() => setActiveForm(activeForm === "add" ? null : "add")}
          >
            <Plus className="size-4" />
            Add task
          </Button>
        </div>
      ) : null}

      {composerError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {composerError}
        </div>
      ) : null}

      {editable && activeForm === "cancel" ? (
        <div className="space-y-3 rounded-lg border border-border bg-foreground/[0.02] p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">Add task cancellation</p>
            <button type="button" onClick={resetForm} aria-label="Close form">
              <X className="size-4 text-foreground-muted" />
            </button>
          </div>
          <TaskPicker
            tasks={cancelCandidates}
            value={selectedTaskId}
            onChange={setSelectedTaskId}
            disabledIds={disabledCancelIds}
          />
          <label className="block space-y-1">
            <span className="text-xs text-foreground-muted">Reason</span>
            <textarea
              className="min-h-16 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-foreground-muted">Internal note</span>
            <textarea
              className="min-h-16 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"
              value={internalNote}
              onChange={(event) => setInternalNote(event.target.value)}
            />
          </label>
          <Button type="button" size="sm" variant="primary" onClick={handleAddCancel}>
            Add cancellation to draft
          </Button>
        </div>
      ) : null}

      {editable && activeForm === "modify" ? (
        <div className="space-y-3 rounded-lg border border-border bg-foreground/[0.02] p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">Add task change</p>
            <button type="button" onClick={resetForm} aria-label="Close form">
              <X className="size-4 text-foreground-muted" />
            </button>
          </div>
          <TaskPicker
            tasks={modifyCandidates}
            value={selectedTaskId}
            onChange={(taskId) => {
              setSelectedTaskId(taskId);
              const task = jobTasks.find((row) => row.id === taskId);
              if (task) {
                setTitle(task.title);
                setInstructions(task.instructions ?? "");
                setSelectedScopeIds(task.scopeItemIds);
              }
            }}
            disabledIds={disabledModifyIds}
          />
          <label className="block space-y-1">
            <span className="text-xs text-foreground-muted">New title</span>
            <input
              className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-foreground-muted">New instructions</span>
            <textarea
              className="min-h-16 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
            />
          </label>
          <fieldset className="space-y-2">
            <legend className="text-xs text-foreground-muted">Linked scope items</legend>
            {scopeItems.map((scope) => (
              <label key={scope.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedScopeIds.includes(scope.id)}
                  onChange={(event) => {
                    setSelectedScopeIds((current) =>
                      event.target.checked
                        ? [...current, scope.id]
                        : current.filter((id) => id !== scope.id),
                    );
                  }}
                />
                {scope.description}
              </label>
            ))}
          </fieldset>
          <label className="block space-y-1">
            <span className="text-xs text-foreground-muted">Reason</span>
            <textarea
              className="min-h-16 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-foreground-muted">Internal note</span>
            <textarea
              className="min-h-16 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"
              value={internalNote}
              onChange={(event) => setInternalNote(event.target.value)}
            />
          </label>
          <Button type="button" size="sm" variant="primary" onClick={handleAddModify}>
            Add task change to draft
          </Button>
        </div>
      ) : null}

      {editable && activeForm === "add" ? (
        <div className="space-y-3 rounded-lg border border-border bg-foreground/[0.02] p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">Add task</p>
            <button type="button" onClick={resetForm} aria-label="Close form">
              <X className="size-4 text-foreground-muted" />
            </button>
          </div>
          <label className="block space-y-1">
            <span className="text-xs text-foreground-muted">Task title</span>
            <input
              className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-foreground-muted">Instructions</span>
            <textarea
              className="min-h-16 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
            />
          </label>
          <fieldset className="space-y-2">
            <legend className="text-xs text-foreground-muted">Linked scope item</legend>
            {scopeItems.map((scope) => (
              <label key={scope.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedScopeIds.includes(scope.id)}
                  onChange={(event) => {
                    setSelectedScopeIds((current) =>
                      event.target.checked
                        ? [...current, scope.id]
                        : current.filter((id) => id !== scope.id),
                    );
                  }}
                />
                {scope.description}
              </label>
            ))}
          </fieldset>
          <label className="block space-y-1">
            <span className="text-xs text-foreground-muted">Reason</span>
            <textarea
              className="min-h-16 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-foreground-muted">Internal note</span>
            <textarea
              className="min-h-16 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"
              value={internalNote}
              onChange={(event) => setInternalNote(event.target.value)}
            />
          </label>
          <Button type="button" size="sm" variant="primary" onClick={handleAddTask}>
            Add task to draft
          </Button>
        </div>
      ) : null}

      {impact.stalePlan ? (
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>Job plan changed since this Change Order was drafted. Execution review is required.</p>
        </div>
      ) : null}

      {impact.conflict ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>Execution delta conflicts with the stored base plan version.</p>
        </div>
      ) : null}

      {!impact.validationOk ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <p className="font-medium">Fix work impact errors</p>
          <ul className="mt-2 list-disc pl-5">
            {impact.validationErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : impact.noWorkImpactConfirmed ? (
        <p className="text-sm text-success">Price-only — no task changes will apply.</p>
      ) : (
        <p className="text-sm text-success">Work impact passes validation.</p>
      )}

      {allTaskOps.length > 0 ? (
        <div className="space-y-4">
          {renderTaskSection("Tasks to add", impact.addedTasks)}
          {renderTaskSection("Tasks to cancel", impact.canceledTasks)}
          {renderTaskSection("Tasks to change", impact.modifiedTasks)}
        </div>
      ) : (
        <p className="text-sm text-foreground-muted">No task changes proposed yet.</p>
      )}

      {impact.paymentImpact ? (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            Legacy payment instruction (deprecated)
          </h4>
          <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-3 text-sm">
            <p className="font-medium text-foreground">
              This Change Order still has an old internal payment instruction. It is not the
              customer-approved payment plan.
            </p>
            <p className="mt-1 text-foreground-muted">{impact.paymentImpact.reason}</p>
            <p className="mt-2 font-semibold text-foreground">
              {formatCents(impact.paymentImpact.amountCents)}
            </p>
            <p className="mt-2 text-xs text-foreground-muted">
              Set payment terms in the commercial column. Approved payment terms are used on apply;
              this legacy instruction is not the normal payment path.
            </p>
          </div>
        </div>
      ) : null}

      {editable && !executionChanged ? (
        <p className="text-xs text-foreground-muted">
          Add or edit task changes above. Click Save execution impact when you are done.
        </p>
      ) : null}
    </div>
  );
}
