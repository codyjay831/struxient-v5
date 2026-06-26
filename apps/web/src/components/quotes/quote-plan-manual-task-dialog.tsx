"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { Loader2, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { addQuotePlanTaskManualAction } from "@/app/(workspace)/quotes/quote-plan-actions";
import {
  workspaceFormControlClass,
  workspaceFormFieldLabelClass,
  workspaceFormPrimaryButtonClass,
  workspaceFormSecondaryButtonClass,
} from "@/components/line-item-templates/line-item-template-form-fields";
import {
  isTaskTemplateCategory,
  taskTemplateCategorySelectOptions,
} from "@/lib/task-template-category";
import { TASK_TEMPLATE_FIELD_LIMITS } from "@/app/(workspace)/settings/scope-library/task-template-field-limits";

const controlClass = workspaceFormControlClass;
const fieldLabelClass = workspaceFormFieldLabelClass;
const primaryButtonClass = workspaceFormPrimaryButtonClass;
const secondaryButtonClass = workspaceFormSecondaryButtonClass;
type TaskCategoryValue = ReturnType<typeof taskTemplateCategorySelectOptions>[number]["value"];

function subscribeNoop() {
  return () => {};
}

function useIsClientMounted() {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

export type QuotePlanManualTaskDialogProps = {
  open: boolean;
  onClose: () => void;
  quoteId: string;
  stages: readonly { id: string; name: string }[];
  scopeLines: readonly { id: string; description: string; executionRelevant: boolean }[];
  initialScopeLineId?: string | null;
};

export function QuotePlanManualTaskDialog({
  open,
  onClose,
  quoteId,
  stages,
  scopeLines,
  initialScopeLineId = null,
}: QuotePlanManualTaskDialogProps) {
  const router = useRouter();
  const mounted = useIsClientMounted();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<TaskCategoryValue>(
    taskTemplateCategorySelectOptions()[0]?.value ?? "GENERAL",
  );
  const [stageId, setStageId] = useState(stages[0]?.id ?? "");
  const [instructions, setInstructions] = useState("");
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const executionRelevantLines = scopeLines.filter((line) => line.executionRelevant);
  const canClose = !isPending;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      const defaultLines = executionRelevantLines.map((line) => line.id);
      const scopedDefault =
        initialScopeLineId && defaultLines.includes(initialScopeLineId)
          ? [initialScopeLineId]
          : defaultLines;
      setSelectedLineIds(new Set(scopedDefault));
      setStageId(stages[0]?.id ?? "");
      setError(null);
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, executionRelevantLines, stages, initialScopeLineId]);

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

  const toggleLine = (lineId: string) => {
    setSelectedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  };

  const handleSubmit = () => {
    setError(null);
    startTransition(async () => {
      const result = await addQuotePlanTaskManualAction({
        quoteId,
        title,
        category,
        stageId: stageId || null,
        lineItemIds: [...selectedLineIds],
        instructions: instructions.trim() || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setTitle("");
      setInstructions("");
      onClose();
      router.refresh();
    });
  };

  const dialogNode = (
    <dialog
      ref={dialogRef}
      data-workspace-child-dialog="true"
      aria-labelledby="manual-plan-task-title"
      aria-busy={isPending}
      className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-border bg-surface p-0 text-foreground shadow-2xl outline-none [&::backdrop]:bg-black/40 [&:not([open])]:hidden"
      onClick={(e) => {
        if (!canClose) return;
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 id="manual-plan-task-title" className="text-base font-semibold text-foreground">
              Add task to execution plan
            </h2>
            <p className="mt-1 text-xs text-foreground-muted">
              Build the quote-wide plan manually — no AI required.
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
          {stages.length === 0 ? (
            <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              No stages configured. Add stages in Scope Library before building the execution plan.
            </p>
          ) : null}

          {executionRelevantLines.length === 0 ? (
            <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              No execution-relevant line items on this quote. Mark scope lines as execution-relevant
              on the quote page first.
            </p>
          ) : null}

          <label className="block">
            <span className={fieldLabelClass}>Title</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={TASK_TEMPLATE_FIELD_LIMITS.title}
              className={`${controlClass} mt-1 text-sm`}
              autoComplete="off"
            />
          </label>

          <label className="block">
            <span className={fieldLabelClass}>Category</span>
            <select
              value={category}
              onChange={(e) => {
                if (isTaskTemplateCategory(e.target.value)) {
                  setCategory(e.target.value);
                }
              }}
              className={`${controlClass} mt-1 text-sm`}
            >
              {taskTemplateCategorySelectOptions().map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className={fieldLabelClass}>Stage</span>
            <select
              value={stageId}
              onChange={(e) => setStageId(e.target.value)}
              className={`${controlClass} mt-1 text-sm`}
              disabled={stages.length === 0}
            >
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className={fieldLabelClass}>Instructions (optional)</span>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={2}
              maxLength={TASK_TEMPLATE_FIELD_LIMITS.instructions}
              className={`${controlClass} mt-1 text-sm`}
            />
          </label>

          <fieldset className="space-y-2">
            <legend className={fieldLabelClass}>Scope lines</legend>
            {executionRelevantLines.map((line) => (
              <label
                key={line.id}
                className="flex cursor-pointer items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:border-border-strong"
              >
                <input
                  type="checkbox"
                  checked={selectedLineIds.has(line.id)}
                  onChange={() => toggleLine(line.id)}
                  className="mt-0.5"
                />
                <span className="text-foreground">{line.description}</span>
              </label>
            ))}
          </fieldset>

          {error ? (
            <p className="rounded-md border border-danger/30 bg-danger/[0.06] px-3 py-1.5 text-xs text-danger">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <button type="button" onClick={onClose} disabled={!canClose} className={secondaryButtonClass}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={
              isPending ||
              !title.trim() ||
              selectedLineIds.size === 0 ||
              stages.length === 0 ||
              executionRelevantLines.length === 0
            }
            className={`${primaryButtonClass} inline-flex items-center gap-2`}
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Add task
          </button>
        </div>
      </div>
    </dialog>
  );

  if (!mounted) return null;
  return createPortal(dialogNode, document.body);
}
