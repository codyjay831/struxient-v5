"use client";

import Link from "next/link";
import { useActionState } from "react";
import { QUOTE_FIELD_LIMITS } from "./quote-field-limits";
import { createQuoteDraftAction, type QuoteFormState } from "./quote-form-actions";

const fieldLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";
const controlClass =
  "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const primaryButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-border bg-accent px-4 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const mutedLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

const initialActionState: QuoteFormState = {};

export type QuoteDraftFormProps = {
  cancelHref: string;
  defaultTitle: string;
  validatedSalesIntakeId: string | null;
  validatedCustomerId: string | null;
  contextLines: { label: string; value: string }[];
  paramWarning: string | null;
};

export function QuoteDraftForm({
  cancelHref,
  defaultTitle,
  validatedSalesIntakeId,
  validatedCustomerId,
  contextLines,
  paramWarning,
}: QuoteDraftFormProps) {
  const [state, formAction, isPending] = useActionState(
    createQuoteDraftAction,
    initialActionState,
  );

  return (
    <form action={formAction} className="space-y-5">
      {paramWarning ? (
        <p
          className="rounded-lg border border-border border-l-[3px] border-l-accent bg-foreground/[0.02] px-3 py-2 text-sm leading-relaxed text-foreground-muted"
          role="status"
        >
          {paramWarning}
        </p>
      ) : null}

      {state.error ? (
        <p
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-danger"
          role="alert"
          aria-live="polite"
        >
          {state.error}
        </p>
      ) : null}

      {validatedSalesIntakeId ? <input type="hidden" name="salesIntakeId" value={validatedSalesIntakeId} /> : null}
      {validatedCustomerId ? (
        <input type="hidden" name="customerId" value={validatedCustomerId} />
      ) : null}

      {contextLines.length > 0 ? (
        <div className="rounded-lg border border-border bg-surface px-4 py-4">
          <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle">
            Quote context
          </p>
          <p className="mt-2 text-xs leading-relaxed text-foreground-muted">
            These links were validated for your organization. Customer id may be attached
            automatically when the sales intake already has a customer—both ids are re-checked on save.
          </p>
          <dl className="mt-3 space-y-2 text-sm">
            {contextLines.map((row) => (
              <div key={row.label}>
                <dt className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                  {row.label}
                </dt>
                <dd className="mt-0.5 text-foreground">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      <div>
        <label className="block">
          <span className={fieldLabelClass}>Title</span>
          <input
            name="title"
            type="text"
            required={validatedSalesIntakeId == null && validatedCustomerId == null}
            maxLength={QUOTE_FIELD_LIMITS.title}
            defaultValue={defaultTitle}
            placeholder="e.g. Roof replacement — Main Street"
            className={controlClass}
            autoComplete="off"
          />
        </label>
        <p className="mt-1.5 text-xs text-foreground-muted">
          {validatedSalesIntakeId || validatedCustomerId
            ? "Prefilled from context—you can edit before saving. If you clear the title, the server will derive a short default from the sales intake or customer."
            : "Required for a title-only draft (no sales intake or customer on this quote yet)."}
        </p>
      </div>

      <div>
        <label className="block">
          <span className={fieldLabelClass}>Internal notes (optional)</span>
          <textarea
            name="internalNotes"
            rows={4}
            maxLength={QUOTE_FIELD_LIMITS.internalNotes}
            placeholder="Staff-only—omitted from live proposal preview."
            className={controlClass}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className={primaryButtonClass} disabled={isPending}>
          {isPending ? "Creating…" : "Create draft quote"}
        </button>
        <Link href={cancelHref} className={mutedLinkClass}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
