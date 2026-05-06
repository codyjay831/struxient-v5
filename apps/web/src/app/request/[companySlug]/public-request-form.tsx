"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { LEAD_FIELD_LIMITS } from "@/app/(workspace)/leads/lead-field-limits";
import type { PublicIntakeFormViewModel } from "@/lib/public-request-settings-effective";
import {
  submitPublicLeadIntakeAction,
  type PublicLeadIntakeState,
} from "./public-lead-intake-actions";

const fieldLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";
const controlClass =
  "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const primaryButtonClass =
  "inline-flex w-full items-center justify-center rounded-lg border border-border bg-accent px-4 py-2.5 text-sm font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";

const initialState: PublicLeadIntakeState = {};

export function PublicRequestForm({
  companySlug,
  organizationDisplayName,
  intake,
}: {
  companySlug: string;
  organizationDisplayName: string;
  intake: PublicIntakeFormViewModel;
}) {
  const boundSubmit = submitPublicLeadIntakeAction.bind(null, companySlug);
  const [state, formAction, isPending] = useActionState(boundSubmit, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const headingId = useId();
  const defaultRequestType = intake.requestTypeOptions[0]?.value ?? "";

  useEffect(() => {
    if (state.success && formRef.current) {
      formRef.current.reset();
    }
  }, [state.success]);

  if (state.success) {
    return (
      <div
        className="rounded-xl border border-border bg-surface px-5 py-8 text-center shadow-sm"
        role="status"
        aria-live="polite"
      >
        <p className="text-base font-semibold text-foreground">Thank you</p>
        <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
          Your request was sent to {organizationDisplayName}. Someone from their team will follow
          up with you.
        </p>
      </div>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-5" aria-labelledby={headingId}>
      <h2 id={headingId} className="sr-only">
        Public Intake Form for {organizationDisplayName}
      </h2>

      {state.error ? (
        <p
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-danger"
          role="alert"
          aria-live="polite"
        >
          {state.error}
        </p>
      ) : null}

      {/* Honeypot — hidden from people; bots often fill it. Server drops the submission silently if set. */}
      <div
        className="pointer-events-none fixed left-0 top-0 -z-10 h-px w-px overflow-hidden opacity-0"
        aria-hidden="true"
      >
        <label>
          Company website
          <input type="text" name="companyWebsite" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div>
        <label className="block">
          <span className={fieldLabelClass}>Name</span>
          <input
            name="contactName"
            type="text"
            required
            maxLength={LEAD_FIELD_LIMITS.contactName}
            autoComplete="name"
            className={controlClass}
          />
        </label>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="block">
            <span className={fieldLabelClass}>Email</span>
            <input
              name="email"
              type="email"
              required
              maxLength={LEAD_FIELD_LIMITS.email}
              autoComplete="email"
              className={controlClass}
            />
          </label>
        </div>
        <div>
          <label className="block">
            <span className={fieldLabelClass}>Phone</span>
            <input
              name="phone"
              type="tel"
              required
              maxLength={LEAD_FIELD_LIMITS.phone}
              autoComplete="tel"
              className={controlClass}
            />
          </label>
        </div>
      </div>

      <div>
        <label className="block">
          <span className={fieldLabelClass}>Service address / project location</span>
          <textarea
            name="serviceAddress"
            required
            rows={3}
            maxLength={LEAD_FIELD_LIMITS.publicIntakeServiceAddress}
            autoComplete="street-address"
            className={`${controlClass} min-h-[5.5rem] resize-y`}
          />
        </label>
      </div>

      <div>
        <label className="block">
          <span className={fieldLabelClass}>What do you need help with?</span>
          <textarea
            name="requestDetails"
            required
            rows={5}
            maxLength={LEAD_FIELD_LIMITS.publicIntakeRequestDetails}
            className={`${controlClass} min-h-[8rem] resize-y`}
          />
        </label>
      </div>

      <div>
        <label className="block">
          <span className={fieldLabelClass}>Preferred timing</span>
          <input
            name="preferredTiming"
            type="text"
            required
            maxLength={LEAD_FIELD_LIMITS.publicIntakePreferredTiming}
            placeholder="e.g. weekday mornings, after 3pm, flexible"
            className={controlClass}
          />
        </label>
      </div>

      <div>
        <label className="block">
          <span className={fieldLabelClass}>Request type</span>
          <select
            name="requestType"
            className={controlClass}
            key={intake.requestTypeOptions.map((o) => o.value).join("|")}
            defaultValue={defaultRequestType}
          >
            {intake.requestTypeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-1.5 text-xs text-foreground-subtle">
          Intake Requirements keep core fields the same for every submission.
        </p>
      </div>

      <div className="pt-1">
        <button type="submit" className={primaryButtonClass} disabled={isPending}>
          {isPending ? "Sending…" : intake.submitButtonText}
        </button>
      </div>
    </form>
  );
}
