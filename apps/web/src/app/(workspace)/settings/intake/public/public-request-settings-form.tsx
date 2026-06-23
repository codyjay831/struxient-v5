"use client";

import { useActionState, useState } from "react";
import { Loader2, Save } from "lucide-react";
import {
  DEFAULT_PUBLIC_REQUEST_FORM_TITLE,
  DEFAULT_PUBLIC_REQUEST_SUBMIT_BUTTON_TEXT,
} from "@/lib/public-request-settings-defaults";
import type { PublicRequestSettingsFormInitial } from "@/lib/public-request-settings-effective";
import { PUBLIC_REQUEST_SETTINGS_LIMITS } from "@/lib/public-request-settings-limits";
import {
  updatePublicRequestSettingsAction,
  type PublicRequestSettingsFormState,
} from "./public-request-settings-actions";
import { PublicPageCopyPreview } from "@/components/settings/public-page-copy-preview";
import { PageHeader } from "@/components/ui/page-header";

const fieldLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";
const controlClass =
  "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const primaryButtonClass =
  "inline-flex w-full items-center justify-center rounded-lg border border-border bg-accent px-4 py-2 text-sm font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";
const initialActionState: PublicRequestSettingsFormState = {};

export function PublicRequestSettingsForm({ initial }: { initial: PublicRequestSettingsFormInitial }) {
  const [state, formAction, isPending] = useActionState(
    updatePublicRequestSettingsAction,
    initialActionState,
  );
  const [enabled, setEnabled] = useState(initial.enabled);
  const [formTitle, setFormTitle] = useState(initial.formTitle);
  const [introMessage, setIntroMessage] = useState(initial.introMessage);
  const [emergencyWarningText, setEmergencyWarningText] = useState(initial.emergencyWarningText);
  const [submitButtonText, setSubmitButtonText] = useState(initial.submitButtonText);

  return (
    <form action={formAction} className="space-y-8">
      <input
        type="hidden"
        name="instantQuoteEnabled"
        value={initial.instantQuoteEnabled ? "on" : "off"}
      />
      <input
        type="hidden"
        name="showInstantQuoteDetails"
        value={initial.showInstantQuoteDetails ? "on" : "off"}
      />
      <input type="hidden" name="offerings" value={initial.offerings.join(", ")} />

      <PageHeader
        title="Customer request page"
        description="Control whether your public request link is live and how the customer-facing page reads."
        actions={
          <button type="submit" className={primaryButtonClass} disabled={isPending}>
            {isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Save className="mr-2 size-4" />
            )}
            Save page settings
          </button>
        }
      />

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
          Customer request page settings saved.
        </p>
      ) : null}

      <div className="grid gap-8 xl:grid-cols-2">
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-foreground">Availability</h2>
              <p className="mt-1 text-sm text-foreground-muted">
                When turned off, your customer request link shows an unavailable message.
              </p>
            </div>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                name="publicRequestEnabled"
                value="on"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="mt-1 size-4 rounded border-border text-accent focus-visible:ring-2 focus-visible:ring-ring"
              />
              <span>
                <span className={fieldLabelClass}>Accept customer requests</span>
                <span className="mt-1 block text-sm text-foreground-muted">
                  Allow submissions through your public customer intake page.
                </span>
              </span>
            </label>
          </div>

          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-foreground">Page copy</h2>
              <p className="mt-1 text-sm text-foreground-muted">
                These fields wrap the intake form customers fill out. They do not change intake
                questions.
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block">
                  <span className={fieldLabelClass}>Page title</span>
                  <input
                    name="formTitle"
                    type="text"
                    required
                    maxLength={PUBLIC_REQUEST_SETTINGS_LIMITS.formTitle}
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
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
                    value={introMessage}
                    onChange={(e) => setIntroMessage(e.target.value)}
                    placeholder="Optional — shown above the form"
                    className={`${controlClass} min-h-[6rem] resize-y`}
                  />
                </label>
                <p className="mt-1.5 text-xs text-foreground-subtle">
                  Leave blank to hide the intro on the public page.
                </p>
              </div>
              <div>
                <label className="block">
                  <span className={fieldLabelClass}>Emergency warning text</span>
                  <textarea
                    name="emergencyWarningText"
                    rows={3}
                    maxLength={PUBLIC_REQUEST_SETTINGS_LIMITS.emergencyWarningText}
                    value={emergencyWarningText}
                    onChange={(e) => setEmergencyWarningText(e.target.value)}
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
                    value={submitButtonText}
                    onChange={(e) => setSubmitButtonText(e.target.value)}
                    placeholder={DEFAULT_PUBLIC_REQUEST_SUBMIT_BUTTON_TEXT}
                    className={controlClass}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="xl:sticky xl:top-6 xl:self-start">
          <PublicPageCopyPreview
            enabled={enabled}
            formTitle={formTitle}
            introMessage={introMessage}
            emergencyWarningText={emergencyWarningText}
            submitButtonText={submitButtonText}
          />
        </div>
      </div>
    </form>
  );
}
