"use client";

import { useActionState, useState } from "react";
import {
  activateQuoteJobAction,
  type QuoteJobActivationFormState,
} from "@/app/(workspace)/quotes/quote-job-activation-actions";
import {
  QuoteCrossLineWiringReviewPanel,
  QuoteCrossLineWiringReviewScope,
  QuoteCrossLineWiringReviewTrigger,
  useQuoteCrossLineWiringReviewContext,
  useQuoteCrossLineWiringReviewContextOptional,
} from "@/components/quotes/quote-cross-line-wiring-review";

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

function QuoteActivateJobFormBody({ quoteId }: { quoteId: string }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const { isOpen: showAIReview, closeReview } = useQuoteCrossLineWiringReviewContext();

  const [state, formAction, isPending] = useActionState(
    activateQuoteJobAction.bind(null, quoteId),
    initialState,
  );

  if (showAIReview) {
    return (
      <QuoteCrossLineWiringReviewPanel
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                closeReview();
                setShowConfirm(true);
              }}
              className={primaryButtonClass}
            >
              Continue to job creation
            </button>
            <button
              type="button"
              onClick={closeReview}
              className="text-sm font-medium text-foreground-subtle transition-colors hover:text-foreground"
            >
              Back
            </button>
          </>
        }
      />
    );
  }

  if (showConfirm) {
    return (
      <div className="rounded-xl border border-accent/30 bg-accent/5 p-6">
        <h3 className="text-lg font-semibold text-foreground">Create job from this approved quote?</h3>
        <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
          This will create an active job using the approved quote and reviewed work plan.
          Planned tasks, payment requirements, and readiness checks will be copied into the job so your team can begin managing the work.
          After activation, future changes should be handled from the job through tasks, issues, activity, and approved changes.
        </p>
        <form action={formAction} className="mt-6 flex flex-wrap items-center gap-3">
          <button type="submit" className={primaryButtonClass} disabled={isPending}>
            {isPending ? "Creating…" : "Create Job"}
          </button>
          <button
            type="button"
            onClick={() => setShowConfirm(false)}
            className="text-sm font-medium text-foreground-subtle transition-colors hover:text-foreground"
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
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setShowConfirm(true)} className={primaryButtonClass}>
          Create job
        </button>
        <QuoteCrossLineWiringReviewTrigger label="Review whole execution flow" />
      </div>
      <p className="text-[0.7rem] leading-relaxed text-foreground-subtle">
        Create one active job from this approved quote using the reviewed work plan and readiness checks.
        Later quote changes do not automatically update tasks already on the job.
      </p>
    </div>
  );
}

/**
 * Activates an APPROVED quote into an active job (one job per quote).
 * Server validates org scope, status, and execution readiness inside the transaction.
 */
export function QuoteActivateJobForm({ quoteId }: { quoteId: string }) {
  const existingScope = useQuoteCrossLineWiringReviewContextOptional();
  const body = <QuoteActivateJobFormBody quoteId={quoteId} />;
  if (existingScope) {
    return body;
  }
  return <QuoteCrossLineWiringReviewScope quoteId={quoteId}>{body}</QuoteCrossLineWiringReviewScope>;
}
