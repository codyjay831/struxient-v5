"use client";

import { useActionState, useState } from "react";
import { LineItemTemplateTaskSource } from "@prisma/client";
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
import { executionStageSelectOptions } from "@/lib/execution-stage-catalog";
import { taskTemplateCategorySelectOptions, getTaskTemplateCategoryLabel } from "@/lib/task-template-category";
import type {
  DefaultExecutionStageGroup,
  DefaultExecutionTaskRow,
  ReusableTaskPickerOption,
} from "@/lib/line-item-template-default-execution-display";
import { ClipboardList } from "lucide-react";

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

function AddTaskSection({
  lineItemTemplateId,
  reusableOptions,
}: {
  lineItemTemplateId: string;
  reusableOptions: ReusableTaskPickerOption[];
}) {
  const [reusableState, reusableAction, reusablePending] = useActionState(
    addLineItemTemplateTaskFromReusableAction.bind(null, lineItemTemplateId),
    initialFormState,
  );
  const [customState, customAction, customPending] = useActionState(
    addLineItemTemplateTaskCustomAction.bind(null, lineItemTemplateId),
    initialFormState,
  );

  const stageOptions = executionStageSelectOptions();
  const categoryOptions = taskTemplateCategorySelectOptions();

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
                No reusable tasks in your library yet. Add some under{" "}
                <a
                  href="/scope-library/tasks"
                  className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
                >
                  Reusable tasks
                </a>
                , or use a custom task below.
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
                <p className="text-[0.7rem] leading-relaxed text-foreground-subtle">
                  Title, stage, category, and instructions are copied from the library entry. Editing this
                  line later won&apos;t change the reusable task.
                </p>
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
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={fieldLabelClass}>Stage</span>
                <select name="stageKey" required className={controlClass} defaultValue={stageOptions[0]?.value}>
                  {stageOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
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
                  defaultValue={categoryOptions[0]?.value}
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
                rows={3}
                maxLength={TASK_TEMPLATE_FIELD_LIMITS.instructions}
                className={controlClass}
              />
            </label>
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
  isFirstInStage,
  isLastInStage,
}: {
  lineItemTemplateId: string;
  task: DefaultExecutionTaskRow;
  isFirstInStage: boolean;
  isLastInStage: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
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

  const stageOptions = executionStageSelectOptions();
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
            <button type="submit" className={dangerButtonClass} disabled={deletePending} title="Remove from this saved line item only">
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
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={fieldLabelClass}>Stage</span>
              <select name="stageKey" required className={controlClass} defaultValue={task.stageKey}>
                {stageOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={fieldLabelClass}>Category</span>
              <select name="category" required className={controlClass} defaultValue={task.category}>
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
              rows={3}
              maxLength={TASK_TEMPLATE_FIELD_LIMITS.instructions}
              defaultValue={task.instructions ?? ""}
              className={controlClass}
            />
          </label>
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
}: {
  lineItemTemplateId: string;
  presetDescription: string;
  stagesWithTasks: DefaultExecutionStageGroup[];
  reusableOptions: ReusableTaskPickerOption[];
}) {
  const totalTasks = stagesWithTasks.reduce((n, s) => n + s.tasks.length, 0);

  return (
    <WorkspacePanel className="border-border-strong shadow-md ring-1 ring-ring/30">
      <SectionHeading
        title="How this work usually runs"
        description={`Optional default execution for “${presetDescription}”. These tasks can be copied into quotes later—they are not shown to customers here.`}
      />
      <AddTaskSection lineItemTemplateId={lineItemTemplateId} reusableOptions={reusableOptions} />

      <div className="mt-8">
        {totalTasks === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No default execution yet"
            description="This saved line item is fine with pricing and scope only. When you’re ready, add reusable or custom tasks above—nothing is required to use this preset on quotes."
          />
        ) : (
          <div className="space-y-8">
            {stagesWithTasks.map((stage) => (
              <section key={stage.stageKey}>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
                  {stage.label}
                </h2>
                <ul className="space-y-2">
                  {stage.tasks.map((task, idx) => (
                    <ExecutionTaskRow
                      key={task.id}
                      lineItemTemplateId={lineItemTemplateId}
                      task={task}
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
