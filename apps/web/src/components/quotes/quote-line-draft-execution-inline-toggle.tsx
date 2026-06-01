"use client";

import { useState } from "react";
import type { QuoteLineExecutionRevalidateScope } from "@/app/(workspace)/quotes/quote-line-execution-types";
import { workspaceFormSecondaryButtonClass } from "@/components/line-item-templates/line-item-template-form-fields";
import {
  QuoteLineDraftExecutionInlinePanel,
  type QuoteLineDraftExecutionTaskRow,
} from "@/components/quotes/quote-line-draft-execution-panel";
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
}) {
  const [open, setOpen] = useState(false);
  const defaultOpenLabel = taskCount === 0 ? "Add draft execution" : "Edit draft execution";
  const openLabel = openLabelOverride ?? defaultOpenLabel;

  return (
    <div>
      <button
        type="button"
        className={workspaceFormSecondaryButtonClass}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? "Cancel" : openLabel}
      </button>
      {open ? (
        <QuoteLineDraftExecutionInlinePanel
          quoteId={quoteId}
          lineItemId={lineItemId}
          tasks={draftTasks}
          reusableOptions={reusableOptions}
          stages={stages}
          revalidateScope={revalidateScope}
          initialPlanningContext={initialPlanningContext}
        />
      ) : null}
    </div>
  );
}
