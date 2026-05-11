"use client";

import { useActionState, useEffect, useId, useMemo, useRef, useState } from "react";
import { LEAD_FIELD_LIMITS } from "@/app/(workspace)/sales/sales-field-limits";
import type { PublicIntakeFormViewModel } from "@/lib/public-request-settings-effective";
import {
  submitPublicLeadIntakeAction,
  type PublicLeadIntakeState,
} from "./public-lead-intake-actions";
import { PublicIntakeServiceAddressField } from "./public-intake-service-address-field";
import { NeededByBucket } from "@prisma/client";
import { MultiFilePicker } from "@/components/forms/multi-file-picker";
import { getPublicLeadAttachmentUploadUrlAction } from "./public-attachment-actions";
import { CustomFieldsForm, type CustomFieldDefPayload } from "@/components/forms/custom-fields-form";
import type { LineItemTemplatePickerRow } from "@/lib/line-item-template-loader";
import { formatMoneyCents } from "@/lib/quote-display";

import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

const fieldLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";
const controlClass =
  "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const primaryButtonClass =
  "inline-flex w-full items-center justify-center rounded-lg border border-border bg-accent px-4 py-2.5 text-sm font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";
const secondaryButtonClass =
  "inline-flex w-full items-center justify-center rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-foreground/[0.02] disabled:opacity-50 sm:w-auto";

const NEEDED_BY_BUCKET_OPTIONS: { value: NeededByBucket; label: string }[] = [
  { value: "ASAP", label: "ASAP" },
  { value: "THIS_WEEK", label: "This week" },
  { value: "THIS_MONTH", label: "This month" },
  { value: "FLEXIBLE", label: "Flexible" },
  { value: "SPECIFIC_DATE", label: "Specific date" },
];

const initialState: PublicLeadIntakeState = {};

export function PublicRequestForm({
  companySlug,
  organizationDisplayName,
  intake,
  customFieldDefs,
  availableTemplates,
  googleMapsApiKey = "",
}: {
  companySlug: string;
  organizationDisplayName: string;
  intake: PublicIntakeFormViewModel;
  customFieldDefs: CustomFieldDefPayload[];
  availableTemplates: LineItemTemplatePickerRow[];
  /** Browser-safe key for Places Autocomplete only; omit or empty to use manual address only. */
  googleMapsApiKey?: string;
}) {
  const boundSubmit = submitPublicLeadIntakeAction.bind(null, companySlug);
  const [state, formAction, isPending] = useActionState(boundSubmit, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const headingId = useId();
  const defaultRequestType = intake.requestTypeOptions[0]?.value ?? "";

  const [step, setStep] = useState(1);
  const [neededByBucket, setNeededByBucket] = useState<NeededByBucket | "">("");
  const [requestType, setRequestType] = useState(defaultRequestType);
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [requestVisit, setRequestVisit] = useState(false);
  const publicIntakeClientKey = useMemo(
    () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : ""),
    [],
  );

  const requestTypeKey = requestType.trim().toLowerCase();
  const instantQuoteTemplateIds = intake.instantQuoteConfig[requestTypeKey] ?? [];
  const instantQuoteTemplates = availableTemplates.filter((t) => instantQuoteTemplateIds.includes(t.id));
  const totalIndicativeCents = instantQuoteTemplates.reduce((sum, t) => sum + t.defaultLineTotalCents, 0);
  const maxIndicativeCents = instantQuoteTemplates.reduce((sum, t) => {
    const buffer = t.priceBufferPercentage > 0 ? (t.defaultLineTotalCents * t.priceBufferPercentage) / 100 : 0;
    return sum + t.defaultLineTotalCents + buffer;
  }, 0);
  const hasInstantQuote = intake.instantQuoteEnabled && instantQuoteTemplates.length > 0;

  const handleFilesChange = async (files: File[]) => {
    setIsUploading(true);
    const newIds: string[] = [];
    
    for (const file of files) {
      try {
        const prep = await getPublicLeadAttachmentUploadUrlAction(
          companySlug,
          file.name,
          file.type,
          file.size
        );

        if (prep.success && prep.uploadUrl && prep.attachmentId) {
          if (prep.storageProvider === "local") {
            const formData = new FormData();
            formData.append("file", file);
            await fetch(prep.uploadUrl, {
              method: "POST",
              body: formData,
            });
          } else {
            await fetch(prep.uploadUrl, {
              method: "PUT",
              body: file,
              headers: { "Content-Type": file.type },
            });
          }
          newIds.push(prep.attachmentId);
        }
      } catch (e) {
        console.error("Upload failed", e);
      }
    }
    
    setAttachmentIds(prev => [...prev, ...newIds]);
    setIsUploading(false);
  };

  useEffect(() => {
    if (state.success && formRef.current) {
      formRef.current.reset();
      setNeededByBucket("");
      setAttachmentIds([]);
    }
  }, [state.success]);

  if (state.success) {
    return (
      <div
        className="rounded-xl border border-border bg-surface px-5 py-12 text-center shadow-sm animate-in fade-in zoom-in-95 duration-300"
        role="status"
        aria-live="polite"
      >
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-success text-success-contrast mb-6">
          <Check className="size-6" />
        </div>
        <h2 className="text-xl font-bold text-foreground tracking-tight">Request Received</h2>
        <p className="mt-3 text-sm leading-relaxed text-foreground-muted max-w-sm mx-auto">
          Thank you! Your request has been sent to <strong>{organizationDisplayName}</strong>. 
          Someone from their team will review your details and get back to you at the email or phone number provided.
        </p>
        <div className="mt-10 pt-6 border-t border-border">
          <p className="text-xs text-foreground-subtle">
            You can close this window now. A confirmation email is on its way (stub).
          </p>
        </div>
      </div>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-6" aria-labelledby={headingId}>
      <h2 id={headingId} className="sr-only">
        Public Intake Form for {organizationDisplayName}
      </h2>

      {/* Progress Indicator */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
              s <= step ? "bg-accent" : "bg-border"
            }`}
          />
        ))}
      </div>

      {intake.offerings.length > 0 && step === 1 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {intake.offerings.map((offering) => (
            <span
              key={offering}
              className="inline-flex items-center rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent"
            >
              {offering}
            </span>
          ))}
        </div>
      )}

      {state.error ? (
        <p
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-danger"
          role="alert"
          aria-live="polite"
        >
          {state.error}
        </p>
      ) : null}

      {/* Honeypot & Hidden Fields */}
      <div
        className="pointer-events-none fixed left-0 top-0 -z-10 h-px w-px overflow-hidden opacity-0"
        aria-hidden="true"
      >
        <label>
          Company website
          <input type="text" name="companyWebsite" tabIndex={-1} autoComplete="off" />
        </label>
        <input type="hidden" name="attachmentIds" value={attachmentIds.join(",")} />
        {publicIntakeClientKey ? (
          <input type="hidden" name="publicIntakeClientKey" value={publicIntakeClientKey} readOnly />
        ) : null}
      </div>

      {/* Step 1: Contact Information */}
      <div className={`space-y-5 animate-in fade-in slide-in-from-right-4 duration-300 ${step === 1 ? "" : "hidden"}`}>
        <div className="mb-6">
          <h3 className="text-lg font-bold text-foreground tracking-tight">Contact Information</h3>
          <p className="text-sm text-foreground-muted">Tell us who you are so we can get in touch.</p>
        </div>
        
        <div>
          <label className="block">
            <span className={fieldLabelClass}>Name</span>
            <input
              name="contactName"
              type="text"
              required={step === 1}
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
                required={step === 1}
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
                required={step === 1}
                maxLength={LEAD_FIELD_LIMITS.phone}
                autoComplete="tel"
                className={controlClass}
              />
            </label>
          </div>
        </div>

        <div className="pt-4">
          <button
            type="button"
            onClick={() => setStep(2)}
            className={primaryButtonClass}
          >
            Next: Project Details
            <ChevronRight className="ml-2 size-4" />
          </button>
        </div>
      </div>

      {/* Step 2: Project Details */}
      <div className={`space-y-5 animate-in fade-in slide-in-from-right-4 duration-300 ${step === 2 ? "" : "hidden"}`}>
        <div className="mb-6">
          <h3 className="text-lg font-bold text-foreground tracking-tight">Project Details</h3>
          <p className="text-sm text-foreground-muted">Tell us about the work you need help with.</p>
        </div>

        <PublicIntakeServiceAddressField
          googleMapsApiKey={googleMapsApiKey}
          fieldLabelClass={fieldLabelClass}
          controlClass={controlClass}
          required={step === 2}
        />

        <div>
          <label className="block">
            <span className={fieldLabelClass}>What do you need help with?</span>
            <textarea
              name="requestDetails"
              required={step === 2}
              rows={5}
              maxLength={LEAD_FIELD_LIMITS.publicIntakeRequestDetails}
              placeholder="Briefly describe the work requested..."
              className={`${controlClass} min-h-[8rem] resize-y`}
            />
          </label>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="block">
              <span className={fieldLabelClass}>Needed by</span>
              <select
                name="neededByBucket"
                value={neededByBucket}
                onChange={(e) => setNeededByBucket(e.target.value as NeededByBucket)}
                className={controlClass}
                required={step === 2}
              >
                <option value="">Select timing...</option>
                {NEEDED_BY_BUCKET_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {neededByBucket === "SPECIFIC_DATE" && (
              <div className="mt-3">
                <label className="block">
                  <span className={fieldLabelClass}>Specific date</span>
                  <input
                    name="neededByDate"
                    type="date"
                    required={step === 2 && neededByBucket === "SPECIFIC_DATE"}
                    className={controlClass}
                  />
                </label>
              </div>
            )}
          </div>
          <div>
            <label className="block">
              <span className={fieldLabelClass}>Request type</span>
              <select
                name="requestType"
                className={controlClass}
                key={intake.requestTypeOptions.map((o) => o.value).join("|")}
                value={requestType}
                onChange={(e) => setRequestType(e.target.value)}
                required={step === 2}
              >
                {intake.requestTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {hasInstantQuote && (
          <div className="rounded-xl border border-accent/30 bg-accent/5 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-accent">Indicative Estimate Only</p>
                <p className="mt-1 text-sm text-foreground-muted">
                  Based on your request type, here is a starting estimate.
                </p>
                <div className="mt-3 border-t border-accent/20 pt-2 flex justify-between items-center">
                  <span className="text-sm font-bold text-foreground">Estimated total</span>
                  <span className="text-lg font-bold text-accent">
                    {maxIndicativeCents > totalIndicativeCents 
                      ? `${formatMoneyCents(totalIndicativeCents)} – ${formatMoneyCents(maxIndicativeCents)}`
                      : formatMoneyCents(totalIndicativeCents)}
                  </span>
                </div>
              </div>
            </div>
            <label className="mt-4 flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                name="lockInInstantQuote"
                className="size-4 rounded border-border text-accent focus:ring-accent"
              />
              <span className="text-xs font-medium text-foreground">
                Use this estimate to start my draft quote (optional)
              </span>
            </label>
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row pt-4">
          <button
            type="button"
            onClick={() => setStep(1)}
            className={secondaryButtonClass}
          >
            <ChevronLeft className="mr-2 size-4" />
            Back
          </button>
          <button
            type="button"
            onClick={() => setStep(3)}
            className={primaryButtonClass}
          >
            Next: Additional Info
            <ChevronRight className="ml-2 size-4" />
          </button>
        </div>
      </div>

      {/* Step 3: Additional Info & Photos */}
      <div className={`space-y-5 animate-in fade-in slide-in-from-right-4 duration-300 ${step === 3 ? "" : "hidden"}`}>
        <div className="mb-6">
          <h3 className="text-lg font-bold text-foreground tracking-tight">Additional Information</h3>
          <p className="text-sm text-foreground-muted">Help us prepare by providing photos or extra details.</p>
        </div>

        <div>
          <label className="block">
            <span className={fieldLabelClass}>Additional timing notes (optional)</span>
            <input
              name="preferredTiming"
              type="text"
              maxLength={LEAD_FIELD_LIMITS.publicIntakePreferredTiming}
              placeholder="e.g. weekday mornings, after 3pm"
              className={controlClass}
            />
          </label>
        </div>

        {customFieldDefs.length > 0 && (
          <div className="rounded-xl border border-border bg-foreground/[0.01] p-4">
            <p className={`${fieldLabelClass} mb-4`}>Additional Information</p>
            <CustomFieldsForm
              fields={customFieldDefs}
              fieldLabelClass={fieldLabelClass}
              controlClass={controlClass}
            />
          </div>
        )}

        <div className="rounded-xl border border-border bg-foreground/[0.01] p-4">
          <p className={`${fieldLabelClass} mb-4`}>Photos & Documents (optional)</p>
          <MultiFilePicker onFilesSelected={handleFilesChange} />
        </div>

        <div className="rounded-xl border border-border bg-foreground/[0.01] p-4">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              className="size-4 rounded border-border text-accent focus:ring-accent"
              checked={requestVisit}
              onChange={(e) => setRequestVisit(e.target.checked)}
            />
            <span className={fieldLabelClass}>Request a site visit</span>
          </label>

          {requestVisit && (
            <div className="mt-4 space-y-4 border-t border-border pt-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="block">
                    <span className={fieldLabelClass}>Preferred date</span>
                    <input
                      name="requestedVisitDate"
                      type="date"
                      className={controlClass}
                    />
                  </label>
                </div>
                <div>
                  <label className="block">
                    <span className={fieldLabelClass}>Preferred window</span>
                    <select name="requestedVisitWindow" className={controlClass}>
                      <option value="ANYTIME">Anytime</option>
                      <option value="MORNING">Morning (8am–12pm)</option>
                      <option value="AFTERNOON">Afternoon (12pm–4pm)</option>
                      <option value="EVENING">Evening (after 4pm)</option>
                    </select>
                  </label>
                </div>
              </div>
              <div>
                <label className="block">
                  <span className={fieldLabelClass}>Visit notes (optional)</span>
                  <input
                    name="requestedVisitNotes"
                    type="text"
                    placeholder="e.g. gate code, park in driveway"
                    className={controlClass}
                  />
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row pt-4">
          <button
            type="button"
            onClick={() => setStep(2)}
            className={secondaryButtonClass}
          >
            <ChevronLeft className="mr-2 size-4" />
            Back
          </button>
            <button
              type="submit"
              className={primaryButtonClass}
              disabled={isPending || isUploading}
            >
            {isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Sending…
              </>
            ) : isUploading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Uploading files...
              </>
            ) : (
              <>
                {intake.submitButtonText}
                <Check className="ml-2 size-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
