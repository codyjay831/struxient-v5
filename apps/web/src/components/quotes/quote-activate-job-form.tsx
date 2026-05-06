"use client";

import { useActionState } from "react";
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
  const [state, formAction, isPending] = useActionState(
    activateQuoteJobAction.bind(null, quoteId),
    initialState,
  );

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <FormError message={state.error} /> : null}
      <button type="submit" className={primaryButtonClass} disabled={isPending}>
        {isPending ? "Activating…" : "Activate job"}
      </button>
      <p className="text-[0.7rem] leading-relaxed text-foreground-subtle">
        Creates one job from this approved quote with shared stages and any separate work blocks copied from draft
        execution. Later quote edits do not change tasks already on the job.
      </p>
    </form>
  );
}
