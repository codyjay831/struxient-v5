"use client";

import { useActionState } from "react";
import {
  recordQuoteSendCheckpointAction,
  type QuoteFormState,
} from "@/app/(workspace)/quotes/quote-form-actions";
import { QUOTE_SEND_FOR_ACCEPTANCE_LABEL } from "@/lib/quote-customer-proposal-ux";

const primaryButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-border bg-accent px-4 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

const selectClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/10";

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

export function QuoteRecordSendCheckpointForm({ 
  quoteId,
  customerEmail,
  layout = "full",
}: { 
  quoteId: string;
  customerEmail?: string | null;
  layout?: "full" | "compact";
}) {
  const [state, formAction, isPending] = useActionState(
    recordQuoteSendCheckpointAction.bind(null, quoteId),
    initialState,
  );

  if (layout === "compact") {
    return (
      <form action={formAction} className="flex flex-col gap-2 sm:items-end">
        <input type="hidden" name="expiresInDays" value="30" />
        {state.error ? <FormError message={state.error} /> : null}
        <button type="submit" className={primaryButtonClass} disabled={isPending}>
          {isPending ? "Sending..." : QUOTE_SEND_FOR_ACCEPTANCE_LABEL}
        </button>
      </form>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <FormError message={state.error} /> : null}
      
      <div>
        <label htmlFor="expiresInDays" className="block text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle mb-1.5">
          Link expires
        </label>
        <select
          id="expiresInDays"
          name="expiresInDays"
          className={selectClass}
          defaultValue="30"
        >
          <option value="7">In 7 days</option>
          <option value="14">In 14 days</option>
          <option value="30">In 30 days (recommended)</option>
          <option value="never">Never</option>
        </select>
      </div>

      {customerEmail ? (
        <p className="text-[0.7rem] leading-relaxed text-foreground">
          We&apos;ll email this proposal to <strong>{customerEmail}</strong>. If wrong, update the customer record first.
        </p>
      ) : (
        <p className="text-[0.7rem] leading-relaxed text-foreground-muted">
          No customer email on file. You&apos;ll need to manually share the proposal link after sending.
        </p>
      )}

      <button type="submit" className={primaryButtonClass} disabled={isPending}>
        {isPending ? "Sending…" : "Send quote"}
      </button>
      
      <p className="text-[0.7rem] leading-relaxed text-foreground-subtle">
        We&apos;ll email the customer a secure link they can review, sign, and download. E-sign vendor (DocuSign / Adobe Sign) integration is optional and not enabled.
      </p>
    </form>
  );
}
