"use client";

import { useActionState } from "react";
import { markQuoteApprovedAction, type QuoteFormState } from "@/app/(workspace)/quotes/quote-form-actions";

const primaryButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-border bg-accent px-4 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

const initialState: QuoteFormState = {};

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

/** Staff-recorded commercial acceptance (no e-sign integration in this build). */
export function QuoteMarkApprovedForm({ quoteId }: { quoteId: string }) {
  const [state, formAction, isPending] = useActionState(
    markQuoteApprovedAction.bind(null, quoteId),
    initialState,
  );

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <FormError message={state.error} /> : null}
      <button type="submit" className={primaryButtonClass} disabled={isPending}>
        {isPending ? "Recording…" : "Mark approved"}
      </button>
      <p className="text-[0.7rem] leading-relaxed text-foreground-subtle">
        Use when the customer has accepted this commercial proposal (signature flow is not wired yet). Records an
        internal acceptance row and moves the quote to Approved—no job activation.
      </p>
    </form>
  );
}
