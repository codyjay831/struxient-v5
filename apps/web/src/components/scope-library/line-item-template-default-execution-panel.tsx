"use client";

import { useActionState, useState } from "react";
import { LineItemTemplateTaskSource, type TaskTemplateCategory } from "@prisma/client";
import {
  addLineItemTemplateTaskCustomAction,
  addLineItemTemplateTaskFromReusableAction,
  deleteLineItemTemplateTaskAction,
  moveLineItemTemplateTaskAction,
  updateLineItemTemplateTaskAction,
  type LineItemTemplateExecutionFormState,
} from "@/app/(workspace)/scope-library/line-item-template-execution-actions";
import { TASK_TEMPLATE_FIELD_LIMITS } from "@/app/(workspace)/scope-library/task-template-field-limits";
import {
  workspaceFormControlClass,
  workspaceFormDangerButtonClass,
  workspaceFormFieldLabelClass,
  workspaceFormPrimaryButtonClass,
  workspaceFormSecondaryButtonClass,
} from "@/components/line-item-templates/line-item-template-form-fields";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { taskTemplateCategorySelectOptions, getTaskTemplateCategoryLabel } from "@/lib/task-template-category";
import type {
  DefaultExecutionStageGroup,
  DefaultExecutionTaskRow,
  ReusableTaskPickerOption,
} from "@/lib/line-item-template-default-execution-display";
import { ClipboardList, Zap, Sparkles } from "lucide-react";
import { suggestSignalsForTask } from "@/lib/ai/signal-suggester";
import type { TaskCompletionRequirements } from "@/lib/task-readiness";
import { toast } from "sonner";

const fieldLabelClass = workspaceFormFieldLabelClass;
const controlClass = workspaceFormControlClass;
const primaryButtonClass = workspaceFormPrimaryButtonClass;
const secondaryButtonClass = workspaceFormSecondaryButtonClass;
const dangerButtonClass = workspaceFormDangerButtonClass;

const initialFormState: LineItemTemplateExecutionFormState = {};

const detailsShellClass =
  "rounded-lg border border-border bg-surface/80 px-3 py-2 text-foreground-muted";

function FormError({ message }: { message: string }) {
  return (
    <p
      className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-danger"
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

function sourceLabel(sourceType: LineItemTemplateTaskSource): string {
  return sourceType === LineItemTemplateTaskSource.TASK_TEMPLATE
    ? "From reusable tasks"
    : "Custom task";
}

function SmartTaskDisclosure({ 
  providesSignals: initialProvides, 
  requiresSignals: initialRequires, 
  hardSignal,
  requirementsJson,
  title,
  category,
}: { 
  providesSignals?: string[], 
  requiresSignals?: string[], 
  hardSignal?: boolean,
  requirementsJson?: unknown,
  title?: string,
  category?: string,
}) {
  const [provides, setProvides] = useState(initialProvides?.join(", ") || "");
  const [requires, setRequires] = useState(initialRequires?.join(", ") || "");
  
  const handleSuggest = () => {
    if (!title) {
      toast.error("Enter a task title first to get suggestions.");
      return;
    }
    const suggestions = suggestSignalsForTask(title, category || "GENERAL");
    
    if (suggestions.provides.length > 0 || suggestions.requires.length > 0) {
      const newProvides = Array.from(new Set([...(provides ? provides.split(",").map(s => s.trim()) : []), ...suggestions.provides])).join(", ");
      const newRequires = Array.from(new Set([...(requires ? requires.split(",").map(s => s.trim()) : []), ...suggestions.requires])).join(", ");
      
      setProvides(newProvides);
      setRequires(newRequires);
      toast.success("AI Secretary suggested signals.");
    } else {
      toast.info("No obvious signals found for this title.");
    }
  };

  const reqs = (requirementsJson ?? {}) as TaskCompletionRequirements;
  return (
    <div className="mt-4 space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[0.65rem] font-bold uppercase tracking-widest text-primary">
          <Zap className="h-3 w-3" />
          Smart Task Configuration
        </div>
        <button
          type="button"
          onClick={handleSuggest}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary hover:bg-primary/20 transition-colors"
        >
          <Sparkles className="size-3" />
          Suggest Signals
        </button>
      </div>
      
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          <label className="block">
            <span className={fieldLabelClass}>Provides signals</span>
            <input
              name="providesSignals"
              type="text"
              className={controlClass}
              value={provides}
              onChange={(e) => setProvides(e.target.value)}
              placeholder="e.g. roof-sealed, permit-ready"
            />
          </label>

          <label className="block">
            <span className={fieldLabelClass}>Requires signals</span>
            <input
              name="requiresSignals"
              type="text"
              className={controlClass}
              value={requires}
              onChange={(e) => setRequires(e.target.value)}
              placeholder="e.g. materials-on-site"
            />
          </label>

          <label className="flex items-center gap-2">
            <input
              name="hardSignal"
              type="checkbox"
              defaultChecked={hardSignal}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-xs font-medium text-foreground">Hard dependency</span>
          </label>
        </div>

        <div className="space-y-3">
          <span className={fieldLabelClass}>Completion Proof</span>
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input
                name="noteRequired"
                type="checkbox"
                defaultChecked={reqs.noteRequired}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <span className="text-xs text-foreground">Note required</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                name="photoRequired"
                type="checkbox"
                defaultChecked={reqs.photoRequired}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <span className="text-xs text-foreground">Photo required</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                name="attachmentRequired"
                type="checkbox"
                defaultChecked={reqs.attachmentRequired}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <span className="text-xs text-foreground">File attachment required</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddTaskSection({
  lineItemTemplateId,
  reusableOptions,
  stages,
}: {
  lineItemTemplateId: string;
  reusableOptions: ReusableTaskPickerOption[];
  stages: { id: string, name: string }[];
}) {
  const [reusableState, reusableAction, reusablePending] = useActionState(
    addLineItemTemplateTaskFromReusableAction.bind(null, lineItemTemplateId),
    initialFormState,
  );
  const [customState, customAction, customPending] = useActionState(
    addLineItemTemplateTaskCustomAction.bind(null, lineItemTemplateId),
    initialFormState,
  );

  const categoryOptions = taskTemplateCategorySelectOptions();
  const [customTitle, setCustomTitle] = useState("");
  const [customCategory, setCustomCategory] = useState<string>(
    categoryOptions[0]?.value ?? "GENERAL",
  );

  return (
    <details className={detailsShellClass}>
      <summary className="cursor-pointer select-none text-sm font-medium text-foreground">
        Add to default execution
      </summary>
      <p className="mt-2 text-xs leading-relaxed text-foreground-muted">
        Optional—reusable tasks are shortcuts. Custom tasks stay on this saved line item only.
      </p>
      <div className="mt-4 space-y-4 border-t border-border pt-4">
        <details className="rounded-md border border-dashed border-border bg-background/40 px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-foreground-muted">
            From reusable tasks
          </summary>
          <form action={reusableAction} className="mt-3 space-y-3">
            {reusableState.error ? <FormError message={reusableState.error} /> : null}
            {reusableOptions.length === 0 ? (
              <p className="text-xs text-foreground-muted">
                No reusable tasks in your library yet.
              </p>
            ) : (
              <>
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
                <button type="submit" className={primaryButtonClass} disabled={reusablePending}>
                  {reusablePending ? "Adding…" : "Add copied task"}
                </button>
              </>
            )}
          </form>
        </details>

        <details className="rounded-md border border-dashed border-border bg-background/40 px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-foreground-muted">
            Custom task
          </summary>
          <form action={customAction} className="mt-3 space-y-3">
            {customState.error ? <FormError message={customState.error} /> : null}
            <label className="block">
              <span className={fieldLabelClass}>Title</span>
              <input
                name="title"
                type="text"
                required
                maxLength={TASK_TEMPLATE_FIELD_LIMITS.title}
                className={controlClass}
                autoComplete="off"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={fieldLabelClass}>Stage</span>
                <select name="stageId" className={controlClass}>
                  <option value="">(No stage)</option>
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={fieldLabelClass}>Category</span>
                <select
                  name="category"
                  required
                  className={controlClass}
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                >
                  {categoryOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block">
              <span className={fieldLabelClass}>Instructions (optional)</span>
              <textarea
                name="instructions"
                rows={2}
                maxLength={TASK_TEMPLATE_FIELD_LIMITS.instructions}
                className={controlClass}
              />
            </label>

            <SmartTaskDisclosure title={customTitle} category={customCategory} />

            <button type="submit" className={primaryButtonClass} disabled={customPending}>
              {customPending ? "Saving…" : "Save custom task"}
            </button>
          </form>
        </details>
      </div>
    </details>
  );
}

function ExecutionTaskRow({
  lineItemTemplateId,
  task,
  stages,
  isFirstInStage,
  isLastInStage,
}: {
  lineItemTemplateId: string;
  task: DefaultExecutionTaskRow;
  stages: { id: string, name: string }[];
  isFirstInStage: boolean;
  isLastInStage: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [category, setCategory] = useState(task.category);
  const [updateState, updateAction, updatePending] = useActionState(
    updateLineItemTemplateTaskAction.bind(null, lineItemTemplateId, task.id),
    initialFormState,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteLineItemTemplateTaskAction.bind(null, lineItemTemplateId, task.id),
    initialFormState,
  );
  const [moveUpState, moveUpAction, moveUpPending] = useActionState(
    moveLineItemTemplateTaskAction.bind(null, lineItemTemplateId, task.id, "up"),
    initialFormState,
  );
  const [moveDownState, moveDownAction, moveDownPending] = useActionState(
    moveLineItemTemplateTaskAction.bind(null, lineItemTemplateId, task.id, "down"),
    initialFormState,
  );

  const categoryOptions = taskTemplateCategorySelectOptions();

  return (
    <li className="rounded-lg border border-border/80 bg-background/30 px-3 py-3 sm:px-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{task.title}</p>
          <p className="mt-0.5 text-xs text-foreground-muted">
            {getTaskTemplateCategoryLabel(task.category)} · {sourceLabel(task.sourceType)}
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
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
          >
            {expanded ? "Close" : "Edit"}
          </button>
          <form action={moveUpAction} className="inline">
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
            <button type="submit" className={dangerButtonClass} disabled={deletePending}>
              {deletePending ? "…" : "Remove"}
            </button>
          </form>
        </div>
      </div>
      {expanded ? (
        <form action={updateAction} className="mt-4 space-y-3 border-t border-border pt-4">
          {updateState.error ? <FormError message={updateState.error} /> : null}
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
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={fieldLabelClass}>Stage</span>
              <select 
                name="stageId" 
                className={controlClass} 
                defaultValue={task.stageId ?? ""}
              >
                <option value="">(No stage)</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
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
          </div>
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
            title={title}
            category={category}
          />

          <button type="submit" className={primaryButtonClass} disabled={updatePending}>
            {updatePending ? "Saving…" : "Save changes"}
          </button>
        </form>
      ) : null}
    </li>
  );
}

export function LineItemTemplateDefaultExecutionPanel({
  lineItemTemplateId,
  presetDescription,
  stagesWithTasks,
  reusableOptions,
  stages,
}: {
  lineItemTemplateId: string;
  presetDescription: string;
  stagesWithTasks: DefaultExecutionStageGroup[];
  reusableOptions: ReusableTaskPickerOption[];
  stages: { id: string, name: string }[];
}) {
  const totalTasks = stagesWithTasks.reduce((n, s) => n + s.tasks.length, 0);

  return (
    <WorkspacePanel className="border-border-strong shadow-md ring-1 ring-ring/30">
      <SectionHeading
        title="How this work usually runs"
        description={`Optional default execution for “${presetDescription}”.`}
      />
      <AddTaskSection 
        lineItemTemplateId={lineItemTemplateId} 
        reusableOptions={reusableOptions} 
        stages={stages}
      />

      <div className="mt-8">
        {totalTasks === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No default execution yet"
            description="Add reusable or custom tasks above."
          />
        ) : (
          <div className="space-y-8">
            {stagesWithTasks.map((stage) => (
              <section key={stage.stageId ?? "no-stage"}>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
                  {stage.label}
                </h2>
                <ul className="space-y-2">
                  {stage.tasks.map((task, idx) => (
                    <ExecutionTaskRow
                      key={task.id}
                      lineItemTemplateId={lineItemTemplateId}
                      task={task}
                      stages={stages}
                      isFirstInStage={idx === 0}
                      isLastInStage={idx === stage.tasks.length - 1}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </WorkspacePanel>
  );
}
