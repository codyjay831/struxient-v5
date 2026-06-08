"use client";

import { useActionState, useEffect, useState } from "react";
import { LeadCloseReason, LeadStatus } from "@prisma/client";
import type { WorkspaceFormState } from "@/app/(workspace)/leads/lead-workspace-actions";
import { LEAD_CLOSE_REASON_OPTIONS } from "@/lib/lead-display";

const controlClass =
  "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const labelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";
const primaryButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-border bg-accent px-4 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const mutedButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

const initialActionState: WorkspaceFormState = {};

export function CloseOrPauseLeadForm({
  currentStatus,
  currentCloseReason,
  currentFollowUpAt,
  formAction,
  onCancel,
  onSuccess,
}: {
  currentStatus: LeadStatus;
  currentCloseReason: LeadCloseReason | null;
  currentFollowUpAt: Date | null;
  formAction: (
    prevState: WorkspaceFormState,
    formData: FormData,
  ) => Promise<WorkspaceFormState>;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [state, submitAction, isPending] = useActionState(formAction, initialActionState);
  const [outcome, setOutcome] = useState<LeadStatus>(
    currentStatus === LeadStatus.ON_HOLD || currentStatus === LeadStatus.LOST || currentStatus === LeadStatus.ARCHIVED
      ? currentStatus
      : LeadStatus.ON_HOLD,
  );
  const [closeReason, setCloseReason] = useState<LeadCloseReason | "">(
    currentStatus === LeadStatus.LOST && currentCloseReason ? currentCloseReason : "",
  );
  const [followUpAt, setFollowUpAt] = useState(
    currentStatus === LeadStatus.ON_HOLD && currentFollowUpAt
      ? currentFollowUpAt.toISOString().slice(0, 10)
      : "",
  );

  useEffect(() => {
    if (state.success) onSuccess();
  }, [onSuccess, state.success]);

  return (
    <form action={submitAction} className="space-y-3">
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
        <label className={labelClass} htmlFor="close-outcome">
          Outcome
        </label>
        <select
          id="close-outcome"
          name="outcome"
          value={outcome}
          onChange={(event) => setOutcome(event.target.value as LeadStatus)}
          className={controlClass}
        >
          <option value={LeadStatus.ON_HOLD}>On hold - follow up</option>
          <option value={LeadStatus.LOST}>Closed - lost</option>
          <option value={LeadStatus.ARCHIVED}>Archived</option>
        </select>
      </div>

      {outcome === LeadStatus.ON_HOLD ? (
        <div>
          <label className={labelClass} htmlFor="close-follow-up-at">
            Follow-up date (optional)
          </label>
          <input
            id="close-follow-up-at"
            type="date"
            name="followUpAt"
            value={followUpAt}
            onChange={(event) => setFollowUpAt(event.target.value)}
            className={controlClass}
          />
        </div>
      ) : null}

      {outcome === LeadStatus.LOST ? (
        <div>
          <label className={labelClass} htmlFor="close-reason">
            Close reason
          </label>
          <select
            id="close-reason"
            name="closeReason"
            required
            value={closeReason}
            onChange={(event) => setCloseReason(event.target.value as LeadCloseReason)}
            className={controlClass}
          >
            <option value="">Choose a reason</option>
            {LEAD_CLOSE_REASON_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className={mutedButtonClass}
          disabled={isPending}
        >
          Cancel
        </button>
        <button
          type="submit"
          className={primaryButtonClass}
          disabled={isPending}
          aria-busy={isPending}
        >
          {isPending ? "Saving..." : "Save outcome"}
        </button>
      </div>
    </form>
  );
}
