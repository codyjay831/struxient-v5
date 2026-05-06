"use client";

import { useActionState } from "react";
import {
  recordQuoteSendCheckpointAction,
  type QuoteFormState,
} from "@/app/(workspace)/quotes/quote-form-actions";

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

export function QuoteRecordSendCheckpointForm({ quoteId }: { quoteId: string }) {
  const [state, formAction, isPending] = useActionState(
    recordQuoteSendCheckpointAction.bind(null, quoteId),
    initialState,
  );

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <FormError message={state.error} /> : null}
      <button type="submit" className={primaryButtonClass} disabled={isPending}>
        {isPending ? "Recording…" : "Record send checkpoint"}
      </button>
    </form>
  );
}
