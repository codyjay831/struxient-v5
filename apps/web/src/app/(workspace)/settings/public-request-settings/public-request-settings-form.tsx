"use client";

import { useActionState, useId, useState } from "react";
import Link from "next/link";
import {
  DEFAULT_PUBLIC_REQUEST_FORM_TITLE,
  DEFAULT_PUBLIC_REQUEST_INTRO_MESSAGE,
  DEFAULT_PUBLIC_REQUEST_SUBMIT_BUTTON_TEXT,
} from "@/lib/public-request-settings-defaults";
import { PUBLIC_REQUEST_SETTINGS_LIMITS } from "@/lib/public-request-settings-limits";
import {
  updatePublicRequestSettingsAction,
  type PublicRequestSettingsFormState,
} from "./public-request-settings-actions";
import { PublicPageCopyPreview } from "@/components/settings/public-page-copy-preview";
import { INTAKE_SETTINGS_HUB_PATH } from "@/lib/intake-settings-hierarchy";

const fieldLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";
const controlClass =
  "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const primaryButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-border bg-accent px-4 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const initialActionState: PublicRequestSettingsFormState = {};

export type PublicRequestSettingsFormInitial = {
  enabled: boolean;
  formTitle: string;
  introMessage: string;
  emergencyWarningText: string;
  submitButtonText: string;
  instantQuoteEnabled: boolean;
  showInstantQuoteDetails: boolean;
  offerings: string[];
};

export function PublicRequestSettingsForm({ initial }: { initial: PublicRequestSettingsFormInitial }) {
  const [state, formAction, isPending] = useActionState(
    updatePublicRequestSettingsAction,
    initialActionState,
  );
  const formId = useId();
  const [offerings, setOfferings] = useState<string[]>(initial.offerings);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [formTitle, setFormTitle] = useState(initial.formTitle);
  const [introMessage, setIntroMessage] = useState(initial.introMessage);
  const [emergencyWarningText, setEmergencyWarningText] = useState(initial.emergencyWarningText);
  const [submitButtonText, setSubmitButtonText] = useState(initial.submitButtonText);

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
          Public page settings saved.
        </p>
      ) : null}

      <PublicPageCopyPreview
        enabled={enabled}
        formTitle={formTitle}
        introMessage={introMessage}
        emergencyWarningText={emergencyWarningText}
        submitButtonText={submitButtonText}
      />

      <section className="space-y-4">
        <div>
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
      </section>

      <details className="group rounded-lg border border-border bg-foreground/[0.02]">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-2">
            Optional — instant pricing & trust badges
            <span className="text-xs font-normal text-foreground-subtle">Future</span>
          </span>
        </summary>
        <div className="space-y-6 border-t border-border px-4 py-4">
          <p className="text-sm text-foreground-muted">
            Instant pricing automation is not expanded in this release. These controls are preserved
            for a future update and do not change lead → quote handoff today.
          </p>
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
          <div className="space-y-3 rounded-lg border border-border bg-surface px-3 py-3 text-sm text-foreground-muted">
            <p>
              <span className={fieldLabelClass}>Instant quote</span>
              <span className="mt-1 block">
                {initial.instantQuoteEnabled ? "Enabled in stored settings" : "Disabled in stored settings"}
                {" — "}
                not shown to customers until this feature ships.
              </span>
            </p>
            <p>
              <span className={fieldLabelClass}>Line item details on estimate</span>
              <span className="mt-1 block">
                {initial.showInstantQuoteDetails ? "Would show line detail" : "Total only"}
                {" (preserved, not editable here)."}
              </span>
            </p>
          </div>
          <div>
            <label className="block">
              <span className={fieldLabelClass}>Offerings (comma separated)</span>
              <input
                name="offerings"
                type="text"
                value={offerings.join(", ")}
                onChange={(e) => setOfferings(e.target.value.split(",").map((s) => s.trim()))}
                placeholder="e.g. Licensed, Insured, 24/7 Emergency"
                className={controlClass}
              />
            </label>
            <p className="mt-1.5 text-xs text-foreground-subtle">
              Trust badges on the public page when configured.
            </p>
          </div>
        </div>
      </details>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Page copy</h2>
        <p className="text-sm text-foreground-muted">
          These fields wrap the intake form customers fill out. They do not change intake questions.
        </p>
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
      </section>

      <section className="rounded-lg border border-border bg-foreground/[0.02] px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Service lines / request types</h2>
        <p className="mt-1 text-sm text-foreground-muted">
          Managed per customer intake form. Edit service lines on your{" "}
          <Link href={INTAKE_SETTINGS_HUB_PATH} className="text-accent hover:underline">
            customer intake
          </Link>{" "}
          default or specialized forms.
        </p>
      </section>

      <div className="flex flex-wrap gap-3 border-t border-border pt-6">
        <button type="submit" className={primaryButtonClass} disabled={isPending}>
          {isPending ? "Saving…" : "Save page settings"}
        </button>
      </div>
    </form>
  );
}
