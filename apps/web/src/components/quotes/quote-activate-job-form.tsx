"use client";

import { useActionState, useState } from "react";
import {
  activateQuoteJobAction,
  type QuoteJobActivationFormState,
} from "@/app/(workspace)/quotes/quote-job-activation-actions";

const primaryButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-border bg-accent px-4 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

const initialState: QuoteJobActivationFormState = {};

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

/**
 * Activates an APPROVED quote into a runtime job (one job per quote).
 * Server validates org scope, status, and execution readiness inside the transaction.
 */
export function QuoteActivateJobForm({ quoteId }: { quoteId: string }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [state, formAction, isPending] = useActionState(
    activateQuoteJobAction.bind(null, quoteId),
    initialState,
  );

  if (showConfirm) {
    return (
      <div className="rounded-xl border border-accent/30 bg-accent/5 p-6">
        <h3 className="text-lg font-semibold text-foreground">Activate this job?</h3>
        <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
          This will create a runtime job and copy all execution tasks from the current quote draft. This action cannot
          be undone.
        </p>
        <form action={formAction} className="mt-6 flex flex-wrap items-center gap-3">
          <button type="submit" className={primaryButtonClass} disabled={isPending}>
            {isPending ? "Activating…" : "Yes, activate job"}
          </button>
          <button
            type="button"
            onClick={() => setShowConfirm(false)}
            className="text-sm font-medium text-foreground-subtle hover:text-foreground transition-colors"
            disabled={isPending}
          >
            Cancel
          </button>
        </form>
        {state.error ? (
          <div className="mt-4">
            <FormError message={state.error} />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => setShowConfirm(true)} className={primaryButtonClass}>
        Activate job
      </button>
      <p className="text-[0.7rem] leading-relaxed text-foreground-subtle">
        Creates one job from this approved quote with shared stages and any separate work blocks copied from draft
        execution. Later quote edits do not change tasks already on the job.
      </p>
    </div>
  );
}
