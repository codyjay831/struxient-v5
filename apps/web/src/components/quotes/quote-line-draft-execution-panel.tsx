"use client";

import { useActionState, useState } from "react";
import {
  addQuoteLineExecutionTaskCustomAction,
  addQuoteLineExecutionTaskFromReusableAction,
  deleteQuoteLineExecutionTaskAction,
  moveQuoteLineExecutionTaskAction,
  updateQuoteLineExecutionTaskAction,
  type QuoteLineExecutionFormState,
  type QuoteLineExecutionRevalidateScope,
} from "@/app/(workspace)/quotes/quote-line-execution-actions";
import { TASK_TEMPLATE_FIELD_LIMITS } from "@/app/(workspace)/settings/scope-library/task-template-field-limits";
import {
  workspaceFormControlClass,
  workspaceFormDangerButtonClass,
  workspaceFormFieldLabelClass,
  workspaceFormPrimaryButtonClass,
  workspaceFormSecondaryButtonClass,
} from "@/components/line-item-templates/line-item-template-form-fields";
import {
  taskTemplateCategorySelectOptions,
  getTaskTemplateCategoryLabel,
} from "@/lib/task-template-category";
import type { ReusableTaskPickerOption } from "@/lib/line-item-template-default-execution-display";
import type { LineItemTemplateTaskSource, TaskTemplateCategory } from "@prisma/client";
import { quoteLineDraftExecutionSourceLabel } from "@/lib/quote-line-execution-source-label";
import { SmartTaskDisclosure } from "@/components/tasks/smart-task-disclosure";

const fieldLabelClass = workspaceFormFieldLabelClass;
const controlClass = workspaceFormControlClass;
const primaryButtonClass = workspaceFormPrimaryButtonClass;
const secondaryButtonClass = workspaceFormSecondaryButtonClass;
const dangerButtonClass = workspaceFormDangerButtonClass;

const initialFormState: QuoteLineExecutionFormState = {};

/** Per-line task row carried into the inline editor. */
export type QuoteLineDraftExecutionTaskRow = {
  id: string;
  title: string;
  stageId: string | null;
  category: TaskTemplateCategory;
  instructions: string | null;
  sortOrder: number;
  sourceType: LineItemTemplateTaskSource;
  sourceTaskTemplateId: string | null;
  sourceLineItemTemplateTaskId: string | null;
  providesSignals: string[];
  requiresSignals: string[];
  hardSignal: boolean;
  requirementsJson: unknown;
  partsRequiredJson: unknown;
};

function FormError({ message }: { message: string }) {
  return (
    <p
      className="rounded-md border border-border bg-surface px-3 py-2 text-xs text-danger"
      role="alert"
      aria-live="polite"
    >
      {message}
    </p>
  );
}

function truncatePreview(text: string, max = 96): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1)}…`;
}

function StageTaskEditForm({
  quoteId,
  lineItemId,
  task,
  stages,
  revalidateScope,
  onClose,
}: {
  quoteId: string;
  lineItemId: string;
  task: QuoteLineDraftExecutionTaskRow;
  stages: { id: string; name: string }[];
  revalidateScope: QuoteLineExecutionRevalidateScope;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(
    updateQuoteLineExecutionTaskAction.bind(null, quoteId, lineItemId, task.id),
    initialFormState,
  );
  const [title, setTitle] = useState(task.title);
  const [category, setCategory] = useState(task.category);
  const [stageId, setStageId] = useState(task.stageId ?? "");

  const categoryOptions = taskTemplateCategorySelectOptions();

  return (
    <form action={action} className="mt-3 space-y-3 border-t border-border pt-3">
      {state.error ? <FormError message={state.error} /> : null}
      <input type="hidden" name="revalidateScope" value={revalidateScope} />
      <label className="block">
        <span className={fieldLabelClass}>Title</span>
        <input
          name="title"
          type="text"
          required
          maxLength={TASK_TEMPLATE_FIELD_LIMITS.title}
          defaultValue={task.title}
          className={controlClass}
          autoComplete="off"
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="block">
        <span className={fieldLabelClass}>Category</span>
        <select
          name="category"
          required
          className={controlClass}
          defaultValue={task.category}
          onChange={(e) => setCategory(e.target.value as TaskTemplateCategory)}
        >
          {categoryOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className={fieldLabelClass}>Stage</span>
        <select
          name="stageId"
          required
          className={controlClass}
          value={stageId}
          onChange={(e) => setStageId(e.target.value)}
        >
          <option value="" disabled>
            Select a stage
          </option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className={fieldLabelClass}>Instructions (optional)</span>
        <textarea
          name="instructions"
          rows={2}
          maxLength={TASK_TEMPLATE_FIELD_LIMITS.instructions}
          defaultValue={task.instructions ?? ""}
          className={controlClass}
        />
      </label>

          <SmartTaskDisclosure 
            providesSignals={task.providesSignals}
            requiresSignals={task.requiresSignals}
            hardSignal={task.hardSignal}
            requirementsJson={task.requirementsJson}
            partsRequiredJson={task.partsRequiredJson}
            title={title}
            category={category}
          />

      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primaryButtonClass} disabled={pending}>
          {pending ? "Saving…" : "Save task"}
        </button>
        <button
          type="button"
          className={secondaryButtonClass}
          onClick={onClose}
          disabled={pending}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function StageTaskRow({
  quoteId,
  lineItemId,
  task,
  stages,
  isFirstInStage,
  isLastInStage,
  revalidateScope,
}: {
  quoteId: string;
  lineItemId: string;
  task: QuoteLineDraftExecutionTaskRow;
  stages: { id: string; name: string }[];
  isFirstInStage: boolean;
  isLastInStage: boolean;
  revalidateScope: QuoteLineExecutionRevalidateScope;
}) {
  const [editing, setEditing] = useState(false);
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteQuoteLineExecutionTaskAction.bind(null, quoteId, lineItemId, task.id),
    initialFormState,
  );
  const [moveUpState, moveUpAction, moveUpPending] = useActionState(
    moveQuoteLineExecutionTaskAction.bind(null, quoteId, lineItemId, task.id, "up"),
    initialFormState,
  );
  const [moveDownState, moveDownAction, moveDownPending] = useActionState(
    moveQuoteLineExecutionTaskAction.bind(null, quoteId, lineItemId, task.id, "down"),
    initialFormState,
  );

  return (
    <li className="rounded-md border border-border bg-background/40 px-3 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{task.title}</p>
          {!task.stageId ? (
            <span className="mt-1 inline-flex rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-danger-strong">
              Missing stage
            </span>
          ) : null}
          <p className="mt-0.5 text-xs text-foreground-muted">
            {getTaskTemplateCategoryLabel(task.category)} ·{" "}
            {quoteLineDraftExecutionSourceLabel({
              sourceLineItemTemplateTaskId: task.sourceLineItemTemplateTaskId,
              sourceType: task.sourceType,
            })}
          </p>
          {task.instructions ? (
            <p className="mt-2 text-xs leading-relaxed text-foreground-subtle">
              {truncatePreview(task.instructions)}
            </p>
          ) : null}
          {(task.providesSignals.length > 0 || task.requiresSignals.length > 0) && (
            <div className="mt-2 flex flex-wrap gap-1">
              {task.requiresSignals.map(s => (
                <span key={s} className="rounded bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning-strong">
                  Requires: {s}
                </span>
              ))}
              {task.providesSignals.map(s => (
                <span key={s} className="rounded bg-approved/10 px-1.5 py-0.5 text-[10px] font-medium text-approved-strong">
                  Provides: {s}
                </span>
              ))}
            </div>
          )}
          {moveUpState.error || moveDownState.error || deleteState.error ? (
            <p className="mt-2 text-xs text-danger" role="alert">
              {moveUpState.error || moveDownState.error || deleteState.error}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() => setEditing((v) => !v)}
            aria-expanded={editing}
          >
            {editing ? "Close" : "Edit"}
          </button>
          <form action={moveUpAction} className="inline">
            <input type="hidden" name="revalidateScope" value={revalidateScope} />
            <button
              type="submit"
              className={secondaryButtonClass}
              disabled={moveUpPending || isFirstInStage}
              title="Move up within this stage"
            >
              {moveUpPending ? "…" : "Up"}
            </button>
          </form>
          <form action={moveDownAction} className="inline">
            <input type="hidden" name="revalidateScope" value={revalidateScope} />
            <button
              type="submit"
              className={secondaryButtonClass}
              disabled={moveDownPending || isLastInStage}
              title="Move down within this stage"
            >
              {moveDownPending ? "…" : "Down"}
            </button>
          </form>
          <form action={deleteAction} className="inline">
            <input type="hidden" name="revalidateScope" value={revalidateScope} />
            <button
              type="submit"
              className={dangerButtonClass}
              disabled={deletePending}
              title="Remove from this quote line only"
            >
              {deletePending ? "…" : "Remove"}
            </button>
          </form>
        </div>
      </div>
      {editing ? (
        <StageTaskEditForm
          quoteId={quoteId}
          lineItemId={lineItemId}
          task={task}
          stages={stages}
          revalidateScope={revalidateScope}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </li>
  );
}

function AddCustomTaskInStageForm({
  quoteId,
  lineItemId,
  stage,
  revalidateScope,
  onClose,
}: {
  quoteId: string;
  lineItemId: string;
  stage: { id: string | null, name: string };
  revalidateScope: QuoteLineExecutionRevalidateScope;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(
    addQuoteLineExecutionTaskCustomAction.bind(null, quoteId, lineItemId),
    initialFormState,
  );
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");

  const categoryOptions = taskTemplateCategorySelectOptions();

  return (
    <form action={action} className="mt-3 space-y-3 rounded-md border border-dashed border-border bg-background/40 px-3 py-3">
      {state.error ? <FormError message={state.error} /> : null}
      <input type="hidden" name="stageId" value={stage.id ?? ""} />
      <input type="hidden" name="revalidateScope" value={revalidateScope} />
      <p className="text-[0.7rem] font-medium uppercase tracking-wide text-foreground-subtle">
        Add task to {stage.name}
      </p>
      <label className="block">
        <span className={fieldLabelClass}>Title</span>
        <input
          name="title"
          type="text"
          required
          maxLength={TASK_TEMPLATE_FIELD_LIMITS.title}
          className={controlClass}
          autoComplete="off"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="block">
        <span className={fieldLabelClass}>Category</span>
        <select
          name="category"
          required
          className={controlClass}
          defaultValue={categoryOptions[0]?.value}
          onChange={(e) => setCategory(e.target.value)}
        >
          {categoryOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className={fieldLabelClass}>Instructions (optional)</span>
        <textarea
          name="instructions"
          rows={2}
          maxLength={TASK_TEMPLATE_FIELD_LIMITS.instructions}
          className={controlClass}
        />
      </label>

      <SmartTaskDisclosure title={title} category={category} />

      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primaryButtonClass} disabled={pending}>
          {pending ? "Adding…" : "Add task"}
        </button>
        <button
          type="button"
          className={secondaryButtonClass}
          onClick={onClose}
          disabled={pending}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function AddReusableTaskInStageForm({
  quoteId,
  lineItemId,
  stage,
  reusableOptions,
  revalidateScope,
  onClose,
}: {
  quoteId: string;
  lineItemId: string;
  stage: { id: string | null, name: string };
  reusableOptions: ReusableTaskPickerOption[];
  revalidateScope: QuoteLineExecutionRevalidateScope;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(
    addQuoteLineExecutionTaskFromReusableAction.bind(null, quoteId, lineItemId),
    initialFormState,
  );

  if (reusableOptions.length === 0) {
    return null;
  }

  return (
    <form action={action} className="mt-3 space-y-3 rounded-md border border-dashed border-border bg-background/40 px-3 py-3">
      {state.error ? <FormError message={state.error} /> : null}
      <input type="hidden" name="revalidateScope" value={revalidateScope} />
      <p className="text-[0.7rem] font-medium uppercase tracking-wide text-foreground-subtle">
        Copy reusable task into {stage.name}
      </p>
      <label className="block">
        <span className={fieldLabelClass}>Reusable task</span>
        <select
          name="taskTemplateId"
          required
          className={controlClass}
          defaultValue={reusableOptions[0]?.id}
        >
          {reusableOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title} · {o.stageLabel} · {o.categoryLabel}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primaryButtonClass} disabled={pending}>
          {pending ? "Adding…" : "Add copied task"}
        </button>
        <button
          type="button"
          className={secondaryButtonClass}
          onClick={onClose}
          disabled={pending}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

type AddMode = null | { mode: "custom" | "reusable"; stageId: string | null };

function StageSection({
  quoteId,
  lineItemId,
  stage,
  tasks,
  stages,
  reusableOptions,
  addMode,
  setAddMode,
  revalidateScope,
}: {
  quoteId: string;
  lineItemId: string;
  stage: { id: string | null, name: string };
  tasks: QuoteLineDraftExecutionTaskRow[];
  stages: { id: string; name: string }[];
  reusableOptions: ReusableTaskPickerOption[];
  addMode: AddMode;
  setAddMode: (next: AddMode) => void;
  revalidateScope: QuoteLineExecutionRevalidateScope;
}) {
  const isAddingCustom = addMode?.stageId === stage.id && addMode.mode === "custom";
  const isAddingReusable = addMode?.stageId === stage.id && addMode.mode === "reusable";

  return (
    <section className="rounded-lg border border-border bg-surface/60 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          {stage.name}
          <span className="ml-2 font-normal normal-case text-foreground-muted">
            {tasks.length === 0
              ? "No tasks yet"
              : `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`}
          </span>
        </h4>
      </div>
      {tasks.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {tasks.map((task, idx) => (
            <StageTaskRow
              key={task.id}
              quoteId={quoteId}
              lineItemId={lineItemId}
              task={task}
              stages={stages}
              isFirstInStage={idx === 0}
              isLastInStage={idx === tasks.length - 1}
              revalidateScope={revalidateScope}
            />
          ))}
        </ul>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={secondaryButtonClass}
          onClick={() =>
            setAddMode(isAddingCustom ? null : { mode: "custom", stageId: stage.id })
          }
          aria-expanded={isAddingCustom}
        >
          {isAddingCustom ? "Close add task" : "Add task"}
        </button>
        {reusableOptions.length > 0 ? (
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() =>
              setAddMode(isAddingReusable ? null : { mode: "reusable", stageId: stage.id })
            }
            aria-expanded={isAddingReusable}
          >
            {isAddingReusable ? "Close reusable" : "Add from reusable"}
          </button>
        ) : null}
      </div>
      {isAddingCustom ? (
        <AddCustomTaskInStageForm
          quoteId={quoteId}
          lineItemId={lineItemId}
          stage={stage}
          revalidateScope={revalidateScope}
          onClose={() => setAddMode(null)}
        />
      ) : null}
      {isAddingReusable ? (
        <AddReusableTaskInStageForm
          quoteId={quoteId}
          lineItemId={lineItemId}
          stage={stage}
          reusableOptions={reusableOptions}
          revalidateScope={revalidateScope}
          onClose={() => setAddMode(null)}
        />
      ) : null}
    </section>
  );
}

export function QuoteLineDraftExecutionInlinePanel({
  quoteId,
  lineItemId,
  tasks,
  reusableOptions,
  stages,
  revalidateScope = "quote",
}: {
  quoteId: string;
  lineItemId: string;
  tasks: readonly QuoteLineDraftExecutionTaskRow[];
  reusableOptions: ReusableTaskPickerOption[];
  stages: { id: string, name: string }[];
  revalidateScope?: QuoteLineExecutionRevalidateScope;
}) {
  const [addMode, setAddMode] = useState<AddMode>(null);

  const tasksByStage = new Map<string | null, QuoteLineDraftExecutionTaskRow[]>();
  tasksByStage.set(null, []);
  for (const s of stages) {
    tasksByStage.set(s.id, []);
  }
  for (const t of tasks) {
    tasksByStage.get(t.stageId)?.push(t);
  }

  const sections: { id: string | null, name: string, tasks: QuoteLineDraftExecutionTaskRow[] }[] = [];
  
  const noStageTasks = tasksByStage.get(null) || [];
  if (noStageTasks.length > 0) {
    sections.push({ id: null, name: "Missing stage", tasks: noStageTasks });
  }

  const missingStageCount = noStageTasks.length;

  for (const s of stages) {
    sections.push({ id: s.id, name: s.name, tasks: tasksByStage.get(s.id) || [] });
  }

  return (
    <div className="mt-3 rounded-lg border border-border-strong bg-foreground/[0.02] p-4 ring-1 ring-ring/20">
      <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle">
        Draft execution for this line
      </p>
      {missingStageCount > 0 ? (
        <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-danger-strong">
          {missingStageCount} {missingStageCount === 1 ? "task needs" : "tasks need"} a stage
        </p>
      ) : null}
      <div className="mt-4 space-y-3">
        {sections.map((section) => (
          <StageSection
            key={section.id ?? "no-stage"}
            quoteId={quoteId}
            lineItemId={lineItemId}
            stage={section}
            tasks={section.tasks}
            stages={stages}
            reusableOptions={reusableOptions}
            addMode={addMode}
            setAddMode={setAddMode}
            revalidateScope={revalidateScope}
          />
        ))}
      </div>
    </div>
  );
}
