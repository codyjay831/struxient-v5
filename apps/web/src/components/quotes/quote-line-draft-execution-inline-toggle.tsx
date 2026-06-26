"use client";

import { useState } from "react";
import type { QuoteLineExecutionRevalidateScope } from "@/app/(workspace)/quotes/quote-line-execution-types";
import {
  QuoteLineDraftExecutionInlinePanel,
  type QuoteLineDraftExecutionTaskRow,
} from "@/components/quotes/quote-line-draft-execution-panel";
import { useQuoteExecutionReviewFocusOptional } from "@/components/quotes/quote-execution-review-focus";
import type { ReusableTaskPickerOption } from "@/lib/line-item-template-default-execution-display";
import {
  QUOTE_DRAFT_EXECUTION_CONFIRMED_LATER_COPY,
  QUOTE_DRAFT_EXECUTION_INTERNAL_COPY,
  quoteDraftExecutionActionLabel,
  quoteDraftExecutionDefaultExpanded,
} from "@/lib/quote/quote-draft-execution-ui";

const draftExecutionToggleButtonClass =
  "inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[10px] font-medium text-foreground-muted transition-colors hover:border-border-strong hover:text-foreground disabled:opacity-50";

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
  planningSummaryLine,
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
  /** Optional override for the open-button label (e.g. review deep-link surfaces). */
  openLabelOverride?: string;
  /** One-line staff summary shown only when the panel is expanded. */
  planningSummaryLine?: string;
  /** Optional seed used for AI planning-context input. */
  initialPlanningContext?: string;
  /** "inline" keeps panel under the button; "fullWidth" right-aligns button and expands panel full width below. */
  panelLayout?: "inline" | "fullWidth";
  /** When true, hide AI controls inside the editor — use a line-level AI button instead. */
  hideAiButton?: boolean;
}) {
  const focusContext = useQuoteExecutionReviewFocusOptional();
  const openLabel = openLabelOverride ?? quoteDraftExecutionActionLabel();
  const focus = focusContext?.focus;
  const focusKey =
    focus && focus.lineId === lineItemId ? `${focus.lineId}:${focus.taskId ?? ""}` : null;

  const [open, setOpen] = useState(() =>
    quoteDraftExecutionDefaultExpanded(focusKey != null),
  );
  const [editingTaskId, setEditingTaskId] = useState<string | null>(() =>
    focusKey != null ? focus?.taskId ?? null : null,
  );
  const [lastFocusKey, setLastFocusKey] = useState<string | null>(null);
  if (focusKey && focusKey !== lastFocusKey) {
    setLastFocusKey(focusKey);
    setOpen(true);
    setEditingTaskId(focus?.taskId ?? null);
  }

  const internalCopyBlock = open ? (
    <div className="mt-2 space-y-1 text-xs leading-relaxed text-foreground-subtle">
      <p>{QUOTE_DRAFT_EXECUTION_INTERNAL_COPY}</p>
      <p>{QUOTE_DRAFT_EXECUTION_CONFIRMED_LATER_COPY}</p>
      {planningSummaryLine ? (
        <p className="text-foreground-muted">
          <span className="font-medium">Summary: </span>
          {planningSummaryLine}
        </p>
      ) : null}
    </div>
  ) : null;

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
      <div className="w-full">
        {!open ? (
          <button
            type="button"
            className={draftExecutionToggleButtonClass}
            onClick={() => setOpen(true)}
            aria-expanded={open}
            aria-label={
              taskCount > 0 ? `${openLabel}, ${taskCount} draft tasks` : openLabel
            }
          >
            {openLabel}
          </button>
        ) : (
          <div className="w-full">
            {internalCopyBlock}
            {panel}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {!open ? (
        <button
          type="button"
          className={draftExecutionToggleButtonClass}
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-label={
            taskCount > 0 ? `${openLabel}, ${taskCount} draft tasks` : openLabel
          }
        >
          {openLabel}
        </button>
      ) : (
        <>
          {internalCopyBlock}
          {panel}
        </>
      )}
    </div>
  );
}
