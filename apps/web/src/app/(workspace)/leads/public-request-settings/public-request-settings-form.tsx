"use client";

import { useActionState, useId, useMemo, useState } from "react";
import {
  DEFAULT_PUBLIC_REQUEST_FORM_TITLE,
  DEFAULT_PUBLIC_REQUEST_INTRO_MESSAGE,
  DEFAULT_PUBLIC_REQUEST_SUBMIT_BUTTON_TEXT,
  type PublicRequestTypeOption,
} from "@/lib/public-request-settings-defaults";
import { PUBLIC_REQUEST_SETTINGS_LIMITS } from "@/lib/public-request-settings-limits";
import {
  updatePublicRequestSettingsAction,
  type PublicRequestSettingsFormState,
} from "./public-request-settings-actions";

const fieldLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";
const controlClass =
  "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const primaryButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-border bg-accent px-4 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

const initialActionState: PublicRequestSettingsFormState = {};

export type PublicRequestSettingsFormInitial = {
  enabled: boolean;
  formTitle: string;
  introMessage: string;
  emergencyWarningText: string;
  submitButtonText: string;
  requestTypes: PublicRequestTypeOption[];
};

export function PublicRequestSettingsForm({ initial }: { initial: PublicRequestSettingsFormInitial }) {
  const [state, formAction, isPending] = useActionState(
    updatePublicRequestSettingsAction,
    initialActionState,
  );
  const formId = useId();
  const [requestTypes, setRequestTypes] = useState<PublicRequestTypeOption[]>(initial.requestTypes);

  const requestTypesJson = useMemo(() => JSON.stringify(requestTypes), [requestTypes]);

  function addType() {
    setRequestTypes((prev) => {
      if (prev.length >= PUBLIC_REQUEST_SETTINGS_LIMITS.maxRequestTypeOptions) {
        return prev;
      }
      return [...prev, { value: "", label: "" }];
    });
  }

  function removeType(index: number) {
    setRequestTypes((prev) => prev.filter((_, i) => i !== index));
  }

  function updateType(index: number, patch: Partial<PublicRequestTypeOption>) {
    setRequestTypes((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  return (
    <form action={formAction} className="space-y-8" id={formId}>
      {state.error ? (
        <p
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-danger"
          role="alert"
          aria-live="polite"
        >
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-success"
          role="status"
          aria-live="polite"
        >
          Public Request Settings saved.
        </p>
      ) : null}

      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Public request</h2>
          <p className="mt-1 text-sm text-foreground-muted">
            When turned off, your Public Request Link shows an unavailable message to customers.
          </p>
        </div>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            name="publicRequestEnabled"
            value="on"
            defaultChecked={initial.enabled}
            className="mt-1 size-4 rounded border-border text-accent focus-visible:ring-2 focus-visible:ring-ring"
          />
          <span>
            <span className={fieldLabelClass}>Public request enabled</span>
            <span className="mt-1 block text-sm text-foreground-muted">
              Allow submissions through your Public Intake Form.
            </span>
          </span>
        </label>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Form copy</h2>
        <div>
          <label className="block">
            <span className={fieldLabelClass}>Public form title</span>
            <input
              name="formTitle"
              type="text"
              required
              maxLength={PUBLIC_REQUEST_SETTINGS_LIMITS.formTitle}
              defaultValue={initial.formTitle}
              placeholder={DEFAULT_PUBLIC_REQUEST_FORM_TITLE}
              className={controlClass}
            />
          </label>
        </div>
        <div>
          <label className="block">
            <span className={fieldLabelClass}>Intro / help message</span>
            <textarea
              name="introMessage"
              rows={4}
              maxLength={PUBLIC_REQUEST_SETTINGS_LIMITS.introMessage}
              defaultValue={initial.introMessage}
              placeholder={DEFAULT_PUBLIC_REQUEST_INTRO_MESSAGE}
              className={`${controlClass} min-h-[6rem] resize-y`}
            />
          </label>
          <p className="mt-1.5 text-xs text-foreground-subtle">
            Shown above the form. Leave blank to omit the intro panel on the public page.
          </p>
        </div>
        <div>
          <label className="block">
            <span className={fieldLabelClass}>Emergency warning text</span>
            <textarea
              name="emergencyWarningText"
              rows={3}
              maxLength={PUBLIC_REQUEST_SETTINGS_LIMITS.emergencyWarningText}
              defaultValue={initial.emergencyWarningText}
              placeholder="Optional — e.g. dial 911 for emergencies; this form is not monitored 24/7."
              className={`${controlClass} min-h-[5rem] resize-y`}
            />
          </label>
          <p className="mt-1.5 text-xs text-foreground-subtle">
            When present, shown as a prominent notice on the public page. Leave blank to hide.
          </p>
        </div>
        <div>
          <label className="block">
            <span className={fieldLabelClass}>Submit button text</span>
            <input
              name="submitButtonText"
              type="text"
              required
              maxLength={PUBLIC_REQUEST_SETTINGS_LIMITS.submitButtonText}
              defaultValue={initial.submitButtonText}
              placeholder={DEFAULT_PUBLIC_REQUEST_SUBMIT_BUTTON_TEXT}
              className={controlClass}
            />
          </label>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Request type options</h2>
          <p className="mt-1 text-sm text-foreground-muted">
            Each option has a short internal value (letters, numbers, hyphens) and a customer-facing
            label. Intake Requirements still include the same core fields on every submission.
          </p>
        </div>

        <input type="hidden" name="requestTypesJson" value={requestTypesJson} readOnly />

        <div className="space-y-3">
          {requestTypes.map((row, index) => (
            <div
              key={index}
              className="flex flex-col gap-3 rounded-lg border border-border bg-foreground/[0.02] p-3 sm:flex-row sm:items-end"
            >
              <label className="block flex-1">
                <span className={fieldLabelClass}>Value (internal key)</span>
                <input
                  type="text"
                  value={row.value}
                  onChange={(e) => updateType(index, { value: e.target.value })}
                  maxLength={PUBLIC_REQUEST_SETTINGS_LIMITS.requestTypeValue}
                  autoComplete="off"
                  className={controlClass}
                  aria-label={`Request type value ${index + 1}`}
                />
              </label>
              <label className="block flex-[2]">
                <span className={fieldLabelClass}>Label (customer-facing)</span>
                <input
                  type="text"
                  value={row.label}
                  onChange={(e) => updateType(index, { label: e.target.value })}
                  maxLength={PUBLIC_REQUEST_SETTINGS_LIMITS.requestTypeLabel}
                  autoComplete="off"
                  className={controlClass}
                  aria-label={`Request type label ${index + 1}`}
                />
              </label>
              <button
                type="button"
                className={`${secondaryButtonClass} shrink-0`}
                onClick={() => removeType(index)}
                disabled={requestTypes.length <= 1}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button type="button" className={secondaryButtonClass} onClick={addType}>
          Add request type
        </button>
      </section>

      <div className="flex flex-wrap gap-3 border-t border-border pt-6">
        <button type="submit" className={primaryButtonClass} disabled={isPending}>
          {isPending ? "Saving…" : "Save Public Request Settings"}
        </button>
      </div>
    </form>
  );
}
