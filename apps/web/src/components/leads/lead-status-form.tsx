"use client";

import { useActionState } from "react";
import type { LeadStatus } from "@prisma/client";
import type { LeadFormState } from "@/app/(workspace)/leads/lead-form-actions";
import { LEAD_STATUS_FORM_OPTIONS } from "@/lib/lead-display";

const fieldLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";
const controlClass =
  "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const primaryButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-border bg-accent px-4 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

const initialActionState: LeadFormState = {};

export function LeadStatusForm({
  currentStatus,
  formAction,
}: {
  currentStatus: LeadStatus;
  formAction: (
    prevState: LeadFormState,
    formData: FormData,
  ) => Promise<LeadFormState>;
}) {
  const [state, submitAction, isPending] = useActionState(formAction, initialActionState);

  return (
    <form action={submitAction} className="mt-4 space-y-3">
      {state.error ? (
        <p
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-danger"
          role="alert"
          aria-live="polite"
        >
          {state.error}
        </p>
      ) : null}

      <div>
        <label className="block" htmlFor="lead-status-select">
          <span className={fieldLabelClass}>Set status</span>
          <select
            id="lead-status-select"
            name="status"
            required
            className={controlClass}
            defaultValue={currentStatus}
          >
            {LEAD_STATUS_FORM_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <button
          type="submit"
          disabled={isPending}
          aria-busy={isPending}
          className={primaryButtonClass}
        >
          {isPending ? "Updating…" : "Update status"}
        </button>
      </div>
    </form>
  );
}
