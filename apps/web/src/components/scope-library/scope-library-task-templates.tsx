"use client";

import { useActionState, useState } from "react";
import type { TaskTemplateCategory } from "@prisma/client";
import {
  archiveTaskTemplateFromScopeLibraryAction,
  createTaskTemplateFromScopeLibraryAction,
  updateTaskTemplateFromScopeLibraryAction,
  type TaskTemplateFormState,
} from "@/app/(workspace)/scope-library/task-template-actions";
import { TASK_TEMPLATE_FIELD_LIMITS } from "@/app/(workspace)/scope-library/task-template-field-limits";
import {
  workspaceFormControlClass,
  workspaceFormDangerButtonClass,
  workspaceFormFieldLabelClass,
  workspaceFormPrimaryButtonClass,
  workspaceFormSecondaryButtonClass,
} from "@/components/line-item-templates/line-item-template-form-fields";
import type { TaskTemplateLibraryRow } from "@/lib/task-template-display";
import {
  getTaskTemplateCategoryLabel,
  taskTemplateCategorySelectOptions,
} from "@/lib/task-template-category";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { ListChecks, Zap, Sparkles } from "lucide-react";
import { suggestSignalsForTask } from "@/lib/ai/signal-suggester";
import type { TaskCompletionRequirements } from "@/lib/task-readiness";
import { toast } from "sonner";

const fieldLabelClass = workspaceFormFieldLabelClass;
const controlClass = workspaceFormControlClass;
const primaryButtonClass = workspaceFormPrimaryButtonClass;
const secondaryButtonClass = workspaceFormSecondaryButtonClass;
const dangerButtonClass = workspaceFormDangerButtonClass;

const anchorToFormClass =
  "text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground";

const initialActionState: TaskTemplateFormState = {};

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
            <p className="mt-1 text-[10px] text-foreground-muted">Comma-separated facts this task broadcasts when done.</p>
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
            <p className="mt-1 text-[10px] text-foreground-muted">Comma-separated facts this task waits for.</p>
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
          <p className="text-[10px] text-foreground-muted ml-6">If checked, activation blocks if no provider exists in the job.</p>
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

function ScopeLibraryCreateTaskTemplateForm({ stages }: { stages: { id: string, name: string }[] }) {
  const [state, formAction, isPending] = useActionState(
    createTaskTemplateFromScopeLibraryAction,
    initialActionState,
  );

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");

  const categoryOptions = taskTemplateCategorySelectOptions();

  return (
    <form
      id="scope-library-task-template-create"
      action={formAction}
      className="mb-8 space-y-3 scroll-mt-24 rounded-lg border border-border bg-surface px-4 py-4"
    >
      <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle">
        New reusable task
      </p>
      <p className="text-xs leading-relaxed text-foreground-muted">
        Internal execution presets for your organization. When line items or jobs copy from
        templates later, values are duplicated—not live-linked.
      </p>
      {state.error ? <FormError message={state.error} /> : null}
      <div>
        <label className="block">
          <span className={fieldLabelClass}>Title</span>
          <input
            name="title"
            type="text"
            required
            maxLength={TASK_TEMPLATE_FIELD_LIMITS.title}
            className={controlClass}
            autoComplete="off"
            placeholder="e.g. Confirm panel capacity with utility"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={fieldLabelClass}>Execution stage</span>
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
      </div>
      <div>
        <label className="block">
          <span className={fieldLabelClass}>Instructions (optional)</span>
          <textarea
            name="instructions"
            rows={2}
            maxLength={TASK_TEMPLATE_FIELD_LIMITS.instructions}
            className={controlClass}
            placeholder="Crew-facing detail, links, or checklist hints—not customer-facing."
          />
        </label>
      </div>

      <SmartTaskDisclosure title={title} category={category} />

      <button type="submit" className={primaryButtonClass} disabled={isPending}>
        {isPending ? "Saving…" : "Save reusable task"}
      </button>
    </form>
  );
}

function ScopeLibraryTaskTemplateEditForm({
  template,
  stages,
  onDone,
}: {
  template: TaskTemplateLibraryRow;
  stages: { id: string, name: string }[];
  onDone: () => void;
}) {
  const [state, formAction, isPending] = useActionState(
    updateTaskTemplateFromScopeLibraryAction.bind(null, template.id),
    initialActionState,
  );

  const [title, setTitle] = useState(template.title);
  const [category, setCategory] = useState(template.category);

  const categoryOptions = taskTemplateCategorySelectOptions();

  return (
    <form action={formAction} className="mt-3 space-y-3 border-t border-border pt-3">
      {state.error ? <FormError message={state.error} /> : null}
      <div>
        <label className="block">
          <span className={fieldLabelClass}>Title</span>
          <input
            name="title"
            type="text"
            required
            maxLength={TASK_TEMPLATE_FIELD_LIMITS.title}
            defaultValue={template.title}
            className={controlClass}
            autoComplete="off"
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={fieldLabelClass}>Execution stage</span>
          <select
            name="stageId"
            className={controlClass}
            defaultValue={template.stageId ?? ""}
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
            defaultValue={template.category}
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
      <div>
        <label className="block">
          <span className={fieldLabelClass}>Instructions (optional)</span>
          <textarea
            name="instructions"
            rows={2}
            maxLength={TASK_TEMPLATE_FIELD_LIMITS.instructions}
            defaultValue={template.instructions ?? ""}
            className={controlClass}
          />
        </label>
      </div>

      <SmartTaskDisclosure 
        providesSignals={template.providesSignals}
        requiresSignals={template.requiresSignals}
        hardSignal={template.hardSignal}
        requirementsJson={template.requirementsJson}
        title={title}
        category={category}
      />

      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primaryButtonClass} disabled={isPending}>
          {isPending ? "Saving…" : "Save changes"}
        </button>
        <button type="button" className={secondaryButtonClass} onClick={onDone} disabled={isPending}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function ScopeLibraryTaskArchiveForm({ templateId }: { templateId: string }) {
  const [state, formAction, isPending] = useActionState(
    archiveTaskTemplateFromScopeLibraryAction.bind(null, templateId),
    initialActionState,
  );

  return (
    <form action={formAction} className="inline">
      {state.error ? (
        <p className="mb-1 text-xs text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        className={dangerButtonClass}
        disabled={isPending}
        title="Hide this reusable task from the library."
      >
        {isPending ? "Hiding…" : "Hide task"}
      </button>
    </form>
  );
}

export function ScopeLibraryTaskTemplatesPanel({
  templates,
  stages,
}: {
  templates: TaskTemplateLibraryRow[];
  stages: { id: string, name: string }[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <>
      <SectionHeading
        title="Reusable tasks"
        description="Preset titles and instructions grouped by execution stage. Newest updated first."
      />
      <ScopeLibraryCreateTaskTemplateForm stages={stages} />
      {templates.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No reusable tasks yet"
          description="Add your first reusable task using the form above."
        >
          <a href="#scope-library-task-template-create" className={anchorToFormClass}>
            Jump to new reusable task form
          </a>
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {templates.map((t) => (
            <li key={t.id} className="px-4 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{t.title}</p>
                  <p className="mt-1 text-xs text-foreground-muted">
                    {t.stageName ?? "No stage"} · {getTaskTemplateCategoryLabel(t.category)}
                  </p>
                  {t.instructions ? (
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-foreground-subtle">
                      {t.instructions}
                    </p>
                  ) : null}
                  {(t.providesSignals.length > 0 || t.requiresSignals.length > 0) && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {t.requiresSignals.map(s => (
                        <span key={s} className="rounded bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning-strong">
                          Requires: {s}
                        </span>
                      ))}
                      {t.providesSignals.map(s => (
                        <span key={s} className="rounded bg-approved/10 px-1.5 py-0.5 text-[10px] font-medium text-approved-strong">
                          Provides: {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {editingId === t.id ? null : (
                    <>
                      <button
                        type="button"
                        className={secondaryButtonClass}
                        onClick={() => setEditingId(t.id)}
                      >
                        Edit
                      </button>
                      <ScopeLibraryTaskArchiveForm templateId={t.id} />
                    </>
                  )}
                </div>
              </div>
              {editingId === t.id ? (
                <ScopeLibraryTaskTemplateEditForm 
                  template={t} 
                  stages={stages}
                  onDone={() => setEditingId(null)} 
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
