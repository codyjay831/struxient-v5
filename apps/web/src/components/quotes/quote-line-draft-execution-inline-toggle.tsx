"use client";

import { useEffect, useState } from "react";
import type { QuoteLineExecutionRevalidateScope } from "@/app/(workspace)/quotes/quote-line-execution-types";
import { workspaceFormSecondaryButtonClass } from "@/components/line-item-templates/line-item-template-form-fields";
import {
  QuoteLineDraftExecutionInlinePanel,
  type QuoteLineDraftExecutionTaskRow,
} from "@/components/quotes/quote-line-draft-execution-panel";
import { useQuoteExecutionReviewFocusOptional } from "@/components/quotes/quote-execution-review-focus";
import type { ReusableTaskPickerOption } from "@/lib/line-item-template-default-execution-display";

/**
 * Client-side toggle that opens the inline draft execution editor directly under the line item.
 */
export function QuoteLineDraftExecutionInlineToggle({
  quoteId,
  lineItemId,
  taskCount,
  draftTasks,
  reusableOptions,
  stages,
  revalidateScope = "quote",
  openLabelOverride,
  initialPlanningContext,
  panelLayout = "inline",
  hideAiButton = false,
}: {
  quoteId: string;
  lineItemId: string;
  taskCount: number;
  draftTasks: readonly QuoteLineDraftExecutionTaskRow[];
  reusableOptions: ReusableTaskPickerOption[];
  stages: { id: string, name: string }[];
  revalidateScope?: QuoteLineExecutionRevalidateScope;
  /** Optional override for the open-button label (e.g. "Edit execution" on review). */
  openLabelOverride?: string;
  /** Optional seed used for AI planning-context input. */
  initialPlanningContext?: string;
  /** "inline" keeps panel under the button; "fullWidth" right-aligns button and expands panel full width below. */
  panelLayout?: "inline" | "fullWidth";
  /** When true, hide AI controls inside the editor — use a line-level AI button instead. */
  hideAiButton?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const focusContext = useQuoteExecutionReviewFocusOptional();
  const defaultOpenLabel = taskCount === 0 ? "Add draft execution" : "Edit draft execution";
  const openLabel = openLabelOverride ?? defaultOpenLabel;

  useEffect(() => {
    const focus = focusContext?.focus;
    if (!focus || focus.lineId !== lineItemId) {
      return;
    }
    setOpen(true);
    setEditingTaskId(focus.taskId);
  }, [focusContext?.focus, lineItemId]);

  const panel = open ? (
    <QuoteLineDraftExecutionInlinePanel
      quoteId={quoteId}
      lineItemId={lineItemId}
      tasks={draftTasks}
      reusableOptions={reusableOptions}
      stages={stages}
      revalidateScope={revalidateScope}
      initialPlanningContext={initialPlanningContext}
      hideAiButton={hideAiButton}
      initialEditingTaskId={editingTaskId}
      onClose={() => {
        setOpen(false);
        setEditingTaskId(null);
        focusContext?.clearFocus();
      }}
    />
  ) : null;

  if (panelLayout === "fullWidth") {
    return (
      <>
        {!open ? (
          <button
            type="button"
            className={workspaceFormSecondaryButtonClass}
            onClick={() => setOpen(true)}
            aria-expanded={open}
          >
            {openLabel}
          </button>
        ) : null}
        {open ? <div className="mt-3 w-full basis-full">{panel}</div> : null}
      </>
    );
  }

  return (
    <div>
      {!open ? (
        <button
          type="button"
          className={workspaceFormSecondaryButtonClass}
          onClick={() => setOpen(true)}
          aria-expanded={open}
        >
          {openLabel}
        </button>
      ) : null}
      {panel}
    </div>
  );
}
