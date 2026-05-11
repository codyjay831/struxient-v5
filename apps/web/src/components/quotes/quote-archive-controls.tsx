"use client";

import { useActionState } from "react";
import {
  archiveQuoteAction,
  restoreQuoteToDraftAction,
  type QuoteFormState,
} from "@/app/(workspace)/quotes/quote-form-actions";
import { SectionHeading } from "@/components/ui/section-heading";
import { WorkspacePanel } from "@/components/ui/workspace-panel";

const initialActionState: QuoteFormState = {};

const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60";

const primaryOutlineButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-border-strong hover:bg-foreground/[0.02] disabled:cursor-not-allowed disabled:opacity-60";

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

export function QuoteDraftArchivePanel({ id, quoteId }: { id?: string; quoteId: string }) {
  const [state, formAction, isPending] = useActionState(
    archiveQuoteAction.bind(null, quoteId),
    initialActionState,
  );

  return (
    <WorkspacePanel id={id} padding="compact" className="mb-6 border-border">
      <SectionHeading
        title="Archive quote"
        description="Sets status to Archived: commercial fields and line items can no longer be changed on this page. Nothing is deleted; restore to draft brings commercial editing back when you are ready."
      />
      <form action={formAction} className="mt-3 space-y-3">
        {state.error ? <FormError message={state.error} /> : null}
        <button
          type="submit"
          className={secondaryButtonClass}
          disabled={isPending}
          aria-busy={isPending}
        >
          {isPending ? "Archiving…" : "Archive quote"}
        </button>
      </form>
    </WorkspacePanel>
  );
}

export function QuoteArchivedRestorePanel({ id, quoteId }: { id?: string; quoteId: string }) {
  const [state, formAction, isPending] = useActionState(
    restoreQuoteToDraftAction.bind(null, quoteId),
    initialActionState,
  );

  return (
    <WorkspacePanel id={id} padding="compact" className="mb-6 border-border-strong">
      <SectionHeading
        title="Restore to draft"
        description="Only action that mutates an archived quote here: status returns to Draft so your team can edit title, internal notes, and line items again. Stored totals and customer/sales intake links are unchanged."
      />
      <form action={formAction} className="mt-3 space-y-3">
        {state.error ? <FormError message={state.error} /> : null}
        <button
          type="submit"
          className={primaryOutlineButtonClass}
          disabled={isPending}
          aria-busy={isPending}
        >
          {isPending ? "Restoring…" : "Restore to draft"}
        </button>
      </form>
    </WorkspacePanel>
  );
}
