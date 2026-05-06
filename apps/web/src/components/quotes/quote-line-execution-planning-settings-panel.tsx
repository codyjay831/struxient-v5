"use client";

import { useActionState } from "react";
import type { QuoteLineExecutionMergeMode, QuoteLineExecutionReviewStatus } from "@prisma/client";
import {
  moveQuoteLineWorkOrderAction,
  updateQuoteLineExecutionSettingsAction,
  type QuoteLineExecutionFormState,
  type QuoteLineExecutionRevalidateScope,
} from "@/app/(workspace)/quotes/quote-line-execution-actions";
import {
  workspaceFormFieldLabelClass,
  workspaceFormPrimaryButtonClass,
  workspaceFormSecondaryButtonClass,
} from "@/components/line-item-templates/line-item-template-form-fields";

const fieldLabelClass = workspaceFormFieldLabelClass;
const primaryButtonClass = workspaceFormPrimaryButtonClass;
const secondaryButtonClass = workspaceFormSecondaryButtonClass;

const initialFormState: QuoteLineExecutionFormState = {};

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

export type QuoteLineExecutionPlanningSettingsPanelProps = {
  quoteId: string;
  lineItemId: string;
  executionReviewStatus: QuoteLineExecutionReviewStatus;
  executionMergeMode: QuoteLineExecutionMergeMode;
  workOrderPosition: number;
  workOrderTotal: number;
  /** When embedded on the quote page, keep the panel closed by default. */
  defaultOpen?: boolean;
  /** Surface that hosts this panel — controls which paths get revalidated after save. */
  revalidateScope?: QuoteLineExecutionRevalidateScope;
};

export function QuoteLineExecutionPlanningSettingsPanel({
  quoteId,
  lineItemId,
  executionReviewStatus,
  executionMergeMode,
  workOrderPosition,
  workOrderTotal,
  defaultOpen = false,
  revalidateScope = "quote",
}: QuoteLineExecutionPlanningSettingsPanelProps) {
  const [settingsState, settingsAction, settingsPending] = useActionState(
    updateQuoteLineExecutionSettingsAction.bind(null, quoteId, lineItemId),
    initialFormState,
  );
  const [earlierState, earlierAction, earlierPending] = useActionState(
    moveQuoteLineWorkOrderAction.bind(null, quoteId, lineItemId, "earlier"),
    initialFormState,
  );
  const [laterState, laterAction, laterPending] = useActionState(
    moveQuoteLineWorkOrderAction.bind(null, quoteId, lineItemId, "later"),
    initialFormState,
  );

  const canMoveEarlier = workOrderPosition > 1;
  const canMoveLater = workOrderPosition < workOrderTotal;

  return (
    <details className="rounded-lg border border-border bg-surface/80 px-3 py-2" {...(defaultOpen ? { open: true } : {})}>
      <summary className="cursor-pointer select-none text-xs font-medium text-foreground-muted">
        Execution planning
      </summary>
      <div className="mt-3 space-y-4 border-t border-border pt-3">
        <p className="text-xs leading-relaxed text-foreground-muted">
          How this line should behave when you run execution review and activate work later. This stays internal—it
          does not change the customer proposal.
        </p>

        <form action={settingsAction} className="space-y-4">
          {settingsState.error ? <FormError message={settingsState.error} /> : null}
          <input type="hidden" name="revalidateScope" value={revalidateScope} />

          <fieldset>
            <legend className={fieldLabelClass}>When work is scheduled</legend>
            <div className="mt-2 space-y-2">
              <label className="flex cursor-pointer gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name="executionMergeMode"
                  value="MERGE_INTO_JOB_STAGES"
                  defaultChecked={executionMergeMode === "MERGE_INTO_JOB_STAGES"}
                  className="mt-1"
                />
                <span>Use shared job stages</span>
              </label>
              <label className="flex cursor-pointer gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name="executionMergeMode"
                  value="KEEP_SEPARATE_BLOCK"
                  defaultChecked={executionMergeMode === "KEEP_SEPARATE_BLOCK"}
                  className="mt-1"
                />
                <span>Keep this scope separate</span>
              </label>
            </div>
            <p className="mt-2 text-[0.7rem] leading-relaxed text-foreground-subtle">
              Shared stages line this scope up with the same phases as other work on the job. Separate keeps this quoted
              scope in its own block when you activate work later.
            </p>
          </fieldset>

          <label className="flex cursor-pointer gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              name="noExecutionNeeded"
              value="on"
              defaultChecked={executionReviewStatus === "NO_EXECUTION_NEEDED"}
              className="mt-0.5"
            />
            <span>No execution needed (commercial-only line)</span>
          </label>

          <button type="submit" className={primaryButtonClass} disabled={settingsPending}>
            {settingsPending ? "Saving…" : "Save planning"}
          </button>
        </form>

        {workOrderTotal > 1 ? (
          <div className="rounded-md border border-dashed border-border px-3 py-2">
            <p className={fieldLabelClass}>Work order on this quote</p>
            <p className="mt-1 text-xs text-foreground-muted">
              Position {workOrderPosition} of {workOrderTotal}. Earlier lines are intended to run before later ones
              when multiple scopes land on one job.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <form action={earlierAction} className="inline">
                <input type="hidden" name="revalidateScope" value={revalidateScope} />
                <button type="submit" className={secondaryButtonClass} disabled={earlierPending || !canMoveEarlier}>
                  {earlierPending ? "…" : "Move earlier"}
                </button>
              </form>
              <form action={laterAction} className="inline">
                <input type="hidden" name="revalidateScope" value={revalidateScope} />
                <button type="submit" className={secondaryButtonClass} disabled={laterPending || !canMoveLater}>
                  {laterPending ? "…" : "Move later"}
                </button>
              </form>
            </div>
            {earlierState.error || laterState.error ? (
              <p className="mt-2 text-xs text-danger" role="alert">
                {earlierState.error || laterState.error}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </details>
  );
}

/** Compact “mark commercial-only” control for empty execution — no merge radios (unchanged merge via hidden). */
export function QuoteLineMarkNoExecutionNeededForm({
  quoteId,
  lineItemId,
  executionMergeMode,
  revalidateScope = "quote",
}: {
  quoteId: string;
  lineItemId: string;
  executionMergeMode: QuoteLineExecutionMergeMode;
  revalidateScope?: QuoteLineExecutionRevalidateScope;
}) {
  const [state, action, pending] = useActionState(
    updateQuoteLineExecutionSettingsAction.bind(null, quoteId, lineItemId),
    initialFormState,
  );

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="executionMergeMode" value={executionMergeMode} />
      <input type="hidden" name="noExecutionNeeded" value="on" />
      <input type="hidden" name="revalidateScope" value={revalidateScope} />
      {state.error ? <FormError message={state.error} /> : null}
      <button type="submit" className={secondaryButtonClass} disabled={pending}>
        {pending ? "Saving…" : "Mark no execution needed"}
      </button>
    </form>
  );
}
