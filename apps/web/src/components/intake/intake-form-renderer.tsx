"use client";

import { useActionState, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { INTAKE_ATOMS } from "@/lib/intake/atoms";
import { IntakeServiceAddressField } from "@/components/intake/intake-service-address-field";
import { NeededByBucket } from "@prisma/client";
import { MultiFilePicker } from "@/components/forms/multi-file-picker";
import { Check, ChevronLeft, ChevronRight, Loader2, Calendar, Clock } from "lucide-react";
import {
  isSyntheticIntakeFormDefinitionId,
  type IntakeFormDefinitionShape,
  type IntakeFormFieldRef,
  type IntakeFormSection,
} from "@/lib/intake/default-intake-form";

const fieldLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";
const controlClass =
  "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const primaryButtonClass =
  "inline-flex w-full items-center justify-center rounded-lg border border-border bg-accent px-4 py-2.5 text-sm font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";
const secondaryButtonClass =
  "inline-flex w-full items-center justify-center rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-foreground/[0.02] disabled:opacity-50 sm:w-auto";

const NEEDED_BY_BUCKET_OPTIONS: { value: NeededByBucket | ""; label: string }[] = [
  { value: "", label: "Select timing" },
  { value: "ASAP", label: "ASAP" },
  { value: "THIS_WEEK", label: "This week" },
  { value: "THIS_MONTH", label: "This month" },
  { value: "FLEXIBLE", label: "Flexible" },
  { value: "SPECIFIC_DATE", label: "Specific date" },
];

export type IntakeRequestTypeOption = { value: string; label: string };

export type IntakeSubmitState = {
  error?: string;
  success?: boolean;
};

export type IntakeSurfaceMode = "public" | "staff";
export type IntakeLayoutMode = "progressive" | "compact";

const PUBLIC_REQUEST_TYPE_REQUIRED_MESSAGE =
  "Please select what you need help with.";

export type IntakeAttachmentBinding = {
  id: string;
  uploadToken?: string;
};

export type IntakeFormRendererProps = {
  formDefinition: IntakeFormDefinitionShape;
  organizationDisplayName: string;
  submitAction: (
    prevState: IntakeSubmitState,
    formData: FormData,
  ) => Promise<IntakeSubmitState>;
  googleMapsApiKey?: string;
  /**
   * Optional uploader. Receives the user-selected files and returns the persisted
   * attachment ids that should be POSTed back as the `attachmentIds` form value.
   */
  onFilesSelected?: (files: File[]) => Promise<IntakeAttachmentBinding[]>;
  /**
   * Optional list of request-type choices (driven by `PublicRequestSettings.offerings`).
   * When provided, the `request.type` atom renders as a SELECT and posts the value's
   * machine key as `requestType`. Falls back to a free text input when omitted.
   */
  requestTypeOptions?: IntakeRequestTypeOption[];
  /** Public request settings submit label; defaults to "Submit Request". */
  submitButtonLabel?: string;
  surfaceMode?: IntakeSurfaceMode;
  layoutMode?: IntakeLayoutMode;
  internalDetailsSlot?: ReactNode;
};

export function IntakeFormRenderer({
  formDefinition,
  organizationDisplayName,
  submitAction,
  googleMapsApiKey = "",
  onFilesSelected,
  requestTypeOptions,
  submitButtonLabel = "Submit Request",
  surfaceMode = "public",
  layoutMode = "progressive",
  internalDetailsSlot,
}: IntakeFormRendererProps) {
  const [state, formAction, isPending] = useActionState<IntakeSubmitState, FormData>(
    submitAction,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  const headingId = useId();

  const [step, setStep] = useState(1);
  const [stepError, setStepError] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({});
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [attachmentUploadTokens, setAttachmentUploadTokens] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);

  const publicIntakeClientKey = useMemo(
    () =>
      typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "",
    [],
  );

  const sections: IntakeFormSection[] = formDefinition.schema.sections ?? [];
  const isProgressive = layoutMode === "progressive" && sections.length > 1;

  const isVisible = (field: IntakeFormFieldRef) => {
    if (!field.visibleIf) return true;
    const { fieldKey, equals, in: inValues, notEmpty } = field.visibleIf;
    const val = fieldValues[fieldKey];

    if (equals !== undefined) return val === equals;
    if (inValues !== undefined)
      return Array.isArray(inValues) && inValues.includes(val as string | number | boolean);
    if (notEmpty) return val !== undefined && val !== null && val !== "";

    return true;
  };

  const sectionHasVisibleRequestType = (sectionIndex: number): boolean => {
    const section = sections[sectionIndex];
    if (!section?.fields) {
      return false;
    }
    return section.fields.some((field) => field.key === "request.type" && isVisible(field));
  };

  const readRequestTypeValue = (): string => {
    const tracked = fieldValues["request.type"];
    if (typeof tracked === "string" && tracked.trim().length > 0) {
      return tracked.trim();
    }
    const form = formRef.current;
    if (!form) {
      return "";
    }
    const el = form.elements.namedItem("requestType");
    if (el instanceof HTMLSelectElement || el instanceof HTMLInputElement) {
      return el.value.trim();
    }
    return "";
  };

  const schemaIncludesRequestType = sections.some((section) =>
    section.fields?.some((field) => field.key === "request.type"),
  );

  /** Public progressive: block Next when the active step includes request.type and it is empty. */
  const validatePublicRequestTypeForStep = (stepIndex: number): string | null => {
    if (surfaceMode !== "public" || !isProgressive) {
      return null;
    }
    if (!sectionHasVisibleRequestType(stepIndex - 1)) {
      return null;
    }
    if (readRequestTypeValue().length === 0) {
      return PUBLIC_REQUEST_TYPE_REQUIRED_MESSAGE;
    }
    return null;
  };

  /** Public forms: block submit when schema includes request.type and it is empty. */
  const validatePublicRequestTypeBeforeSubmit = (): string | null => {
    if (surfaceMode !== "public" || !schemaIncludesRequestType) {
      return null;
    }
    if (readRequestTypeValue().length === 0) {
      return PUBLIC_REQUEST_TYPE_REQUIRED_MESSAGE;
    }
    return null;
  };

  const handleNext = (e?: React.MouseEvent | React.KeyboardEvent) => {
    e?.preventDefault();
    const validationError = validatePublicRequestTypeForStep(step);
    if (validationError) {
      setStepError(validationError);
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setStepError(null);
    if (step < sections.length) {
      setStep(step + 1);
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleBack = (e?: React.MouseEvent | React.KeyboardEvent) => {
    e?.preventDefault();
    setStepError(null);
    if (step > 1) {
      setStep(step - 1);
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const validationError = validatePublicRequestTypeBeforeSubmit();
    if (!validationError) {
      return;
    }
    e.preventDefault();
    setStepError(validationError);
    if (isProgressive) {
      const requestTypeStepIndex = sections.findIndex((section) =>
        section.fields?.some((field) => field.key === "request.type"),
      );
      if (requestTypeStepIndex >= 0) {
        setStep(requestTypeStepIndex + 1);
      }
    }
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Prevent Enter from submitting the form prematurely if we are not on the last step.
    // We only allow Enter to submit if we are on the last step and not in a textarea.
    if (e.key === "Enter") {
      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA") return;

      if (isProgressive && step < sections.length) {
        e.preventDefault();
        handleNext();
      }
    }
  };

  const handleFilesChange = async (files: File[]) => {
    if (!onFilesSelected) return;
    setIsUploading(true);
    try {
      const bindings = await onFilesSelected(files);
      setAttachmentIds((prev) => [...prev, ...bindings.map((binding) => binding.id)]);
      setAttachmentUploadTokens((prev) => {
        const next = { ...prev };
        for (const binding of bindings) {
          if (binding.uploadToken) {
            next[binding.id] = binding.uploadToken;
          }
        }
        return next;
      });
    } finally {
      setIsUploading(false);
    }
  };

  const updateFieldValue = (key: string, value: unknown) => {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
    if (key === "request.type" && stepError) {
      setStepError(null);
    }
  };

  if (state.success && surfaceMode === "public") {
    return (
      <div className="rounded-xl border border-border bg-surface px-5 py-12 text-center shadow-sm animate-in fade-in zoom-in-95 duration-300">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-success text-success-contrast mb-6">
          <Check className="size-6" />
        </div>
        <h2 className="text-xl font-bold text-foreground tracking-tight">Request sent</h2>
        <p className="mt-3 text-sm leading-relaxed text-foreground-muted max-w-md mx-auto">
          Thanks for reaching out. Your request has been sent to{" "}
          <strong>{organizationDisplayName}</strong>.
        </p>
        <div className="mt-5 rounded-lg border border-border bg-background px-4 py-3 text-left max-w-md mx-auto">
          <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle">
            What happens next
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-foreground-muted">
            <li>We review your request details and attachments.</li>
            <li>Our team may follow up by phone or email.</li>
            <li>A quote is prepared once scope details are confirmed.</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-6"
      aria-labelledby={headingId}
      onKeyDown={isProgressive ? handleKeyDown : undefined}
      onSubmit={surfaceMode === "public" ? handleFormSubmit : undefined}
    >
      <h2 id={headingId} className="sr-only">
        {formDefinition.name} for {organizationDisplayName}
      </h2>

      {surfaceMode === "public" ? (
        <>
          {/* Honeypot — bots fill it in, humans never see it. */}
          <div aria-hidden className="hidden">
            <label>
              Company website
              <input type="text" name="companyWebsite" tabIndex={-1} autoComplete="off" />
            </label>
          </div>

          {/* Idempotency key — server uses this to dedupe accidental double submits. */}
          <input type="hidden" name="publicIntakeClientKey" value={publicIntakeClientKey} />
        </>
      ) : null}

      {/* Immutable proof of which IntakeFormDefinition this submit was rendered against. */}
      {!isSyntheticIntakeFormDefinitionId(formDefinition.id) ? (
        <input type="hidden" name="formDefinitionId" value={formDefinition.id} />
      ) : null}

      {/* Persisted attachment ids (from object-storage upload). */}
      <input type="hidden" name="attachmentIds" value={attachmentIds.join(",")} />
      {Object.keys(attachmentUploadTokens).length > 0 ? (
        <input
          type="hidden"
          name="attachmentUploadTokens"
          value={JSON.stringify(attachmentUploadTokens)}
        />
      ) : null}

      {isProgressive && (
        <div className="mb-10">
          <div className="flex items-center justify-between mb-2 px-1">
            {sections.map((section, idx) => (
              <span
                key={section.key}
                className={`text-[0.65rem] font-bold uppercase tracking-widest transition-colors duration-300 ${
                  idx + 1 <= step ? "text-accent" : "text-foreground-subtle"
                }`}
              >
                {section.title}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {sections.map((section, idx) => (
              <div
                key={section.key}
                className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                  idx + 1 <= step ? "bg-accent" : "bg-border"
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {stepError ? (
        <p
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-danger"
          role="alert"
          aria-live="polite"
        >
          {stepError}
        </p>
      ) : null}

      {state.error ? (
        <p
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}

      {sections.map((section, sIdx) => {
        const isStepActive = isProgressive ? sIdx + 1 === step : true;

        return (
          <div
            key={section.key}
            className={`space-y-5 ${
              isStepActive
                ? isProgressive
                  ? "animate-in fade-in slide-in-from-right-4 duration-300"
                  : ""
                : "hidden"
            }`}
          >
            <div className="mb-6">
              <h3 className="text-lg font-bold text-foreground tracking-tight">
                {section.title}
              </h3>
              {section.description && (
                <p className="text-sm text-foreground-muted">{section.description}</p>
              )}
            </div>

            {section.fields.map((field) => {
              if (!isVisible(field)) return null;
              const atom = INTAKE_ATOMS[field.key];
              if (!atom) return null;

              switch (field.key) {
                case "contact.name":
                  return (
                    <div key={field.key}>
                      <label className="block">
                        <span className={fieldLabelClass}>{atom.label}</span>
                        <input
                          name="contactName"
                          type="text"
                          required={atom.required && isStepActive}
                          className={controlClass}
                          defaultValue={fieldValues[field.key] as string ?? ""}
                          onChange={(e) => updateFieldValue(field.key, e.target.value)}
                        />
                      </label>
                    </div>
                  );
                case "contact.email":
                  return (
                    <div key={field.key}>
                      <label className="block">
                        <span className={fieldLabelClass}>{atom.label}</span>
                        <input
                          name="email"
                          type="email"
                          required={atom.required && isStepActive}
                          className={controlClass}
                          defaultValue={fieldValues[field.key] as string ?? ""}
                          onChange={(e) => updateFieldValue(field.key, e.target.value)}
                        />
                      </label>
                    </div>
                  );
                case "contact.phone":
                  return (
                    <div key={field.key}>
                      <label className="block">
                        <span className={fieldLabelClass}>{atom.label}</span>
                        <input
                          name="phone"
                          type="tel"
                          required={atom.required && isStepActive}
                          className={controlClass}
                          defaultValue={fieldValues[field.key] as string ?? ""}
                          onChange={(e) => updateFieldValue(field.key, e.target.value)}
                        />
                      </label>
                    </div>
                  );
                case "address.service":
                  return (
                    <div key={field.key}>
                      <IntakeServiceAddressField
                        googleMapsApiKey={googleMapsApiKey}
                        fieldLabelClass={fieldLabelClass}
                        controlClass={controlClass}
                        required={atom.required && isStepActive}
                        defaultDisplayAddress={fieldValues[field.key] as string ?? ""}
                        initialStructuredJson={fieldValues["address.service.structured"] as string ?? ""}
                        onDisplayAddressChange={(val) => updateFieldValue(field.key, val)}
                        onStructuredJsonChange={(val) => updateFieldValue("address.service.structured", val)}
                      />
                    </div>
                  );
                case "scope.text":
                  return (
                    <div key={field.key}>
                      <label className="block">
                        <span className={fieldLabelClass}>{atom.label}</span>
                        <textarea
                          name="requestDetails"
                          required={atom.required && isStepActive}
                          rows={5}
                          className={`${controlClass} min-h-[8rem] resize-y`}
                          defaultValue={fieldValues[field.key] as string ?? ""}
                          onChange={(e) => updateFieldValue(field.key, e.target.value)}
                        />
                      </label>
                    </div>
                  );
                case "scope.photos":
                  return (
                    <div
                      key={field.key}
                      className="rounded-xl border border-border bg-foreground/[0.01] p-4"
                    >
                      <p className={`${fieldLabelClass} mb-4`}>{atom.label}</p>
                      <MultiFilePicker onFilesSelected={handleFilesChange} />
                    </div>
                  );
                case "timing.bucket":
                  return (
                    <div key={field.key}>
                      <label className="block">
                        <span className={fieldLabelClass}>{atom.label}</span>
                        <select
                          name="neededByBucket"
                          className={controlClass}
                          defaultValue={fieldValues[field.key] as string ?? ""}
                          onChange={(e) => updateFieldValue(field.key, e.target.value)}
                        >
                          {NEEDED_BY_BUCKET_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  );
                case "timing.specificDate":
                  return (
                    <div key={field.key}>
                      <label className="block">
                        <span className={fieldLabelClass}>{atom.label}</span>
                        <div className="relative">
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-foreground-subtle" />
                          <input
                            name="neededByDate"
                            type="date"
                            className={`${controlClass} pl-10`}
                            defaultValue={fieldValues[field.key] as string ?? ""}
                            onChange={(e) => updateFieldValue(field.key, e.target.value)}
                          />
                        </div>
                      </label>
                    </div>
                  );
                case "request.type":
                  return (
                    <div key={field.key}>
                      <label className="block">
                        <span className={fieldLabelClass}>{atom.label}</span>
                        {requestTypeOptions && requestTypeOptions.length > 0 ? (
                          <select
                            name="requestType"
                            className={controlClass}
                            defaultValue={fieldValues[field.key] as string ?? ""}
                            onChange={(e) => updateFieldValue(field.key, e.target.value)}
                          >
                            {surfaceMode === "public" ? (
                              <option value="">Select what you need help with</option>
                            ) : null}
                            {requestTypeOptions.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            name="requestType"
                            type="text"
                            className={controlClass}
                            placeholder="e.g. Repair, Installation"
                            defaultValue={fieldValues[field.key] as string ?? ""}
                            onChange={(e) => updateFieldValue(field.key, e.target.value)}
                          />
                        )}
                      </label>
                    </div>
                  );
                case "consent.terms":
                  if (surfaceMode !== "public") {
                    return null;
                  }
                  return (
                    <div key={field.key} className="flex items-start gap-3 mt-2">
                      <input
                        name="consentTerms"
                        type="checkbox"
                        required={atom.required && isStepActive}
                        className="mt-1 size-4 rounded border-border text-accent focus:ring-accent"
                        defaultChecked={fieldValues[field.key] as boolean ?? false}
                        onChange={(e) => updateFieldValue(field.key, e.target.checked)}
                      />
                      <span className="text-xs text-foreground-muted leading-relaxed">
                        I agree to be contacted regarding my request.
                      </span>
                    </div>
                  );
                case "preferred.contactMethod":
                  return (
                    <div key={field.key}>
                      <label className="block">
                        <span className={fieldLabelClass}>{atom.label}</span>
                        <select
                          name="preferredContactMethod"
                          className={controlClass}
                          defaultValue={fieldValues[field.key] as string ?? "EMAIL"}
                          onChange={(e) => updateFieldValue(field.key, e.target.value)}
                        >
                          <option value="EMAIL">Email</option>
                          <option value="PHONE">Phone Call</option>
                          <option value="SMS">Text Message</option>
                        </select>
                      </label>
                    </div>
                  );
                case "visit.requestedDate":
                  return (
                    <div key={field.key}>
                      <label className="block">
                        <span className={fieldLabelClass}>{atom.label}</span>
                        <div className="relative">
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-foreground-subtle" />
                          <input
                            name="requestedVisitDate"
                            type="date"
                            className={`${controlClass} pl-10`}
                            defaultValue={fieldValues[field.key] as string ?? ""}
                            onChange={(e) => updateFieldValue(field.key, e.target.value)}
                          />
                        </div>
                      </label>
                    </div>
                  );
                case "visit.window":
                  return (
                    <div key={field.key}>
                      <label className="block">
                        <span className={fieldLabelClass}>{atom.label}</span>
                        <div className="relative">
                          <Clock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-foreground-subtle" />
                          <select
                            name="requestedVisitWindow"
                            className={`${controlClass} pl-10`}
                            defaultValue={fieldValues[field.key] as string ?? ""}
                            onChange={(e) => updateFieldValue(field.key, e.target.value)}
                          >
                            <option value="">Any time</option>
                            <option value="MORNING">Morning (8am - 12pm)</option>
                            <option value="AFTERNOON">Afternoon (12pm - 4pm)</option>
                            <option value="EVENING">Evening (4pm - 8pm)</option>
                          </select>
                        </div>
                      </label>
                    </div>
                  );
                case "visit.notes":
                  return (
                    <div key={field.key}>
                      <label className="block">
                        <span className={fieldLabelClass}>{atom.label}</span>
                        <textarea
                          name="requestedVisitNotes"
                          rows={3}
                          className={controlClass}
                          placeholder="Any special instructions for the visit?"
                          defaultValue={fieldValues[field.key] as string ?? ""}
                          onChange={(e) => updateFieldValue(field.key, e.target.value)}
                        />
                      </label>
                    </div>
                  );
                default:
                  return null;
              }
            })}
          </div>
        );
      })}

      {internalDetailsSlot ? <div>{internalDetailsSlot}</div> : null}

      {sections.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row pt-4">
          {isProgressive && step > 1 && (
            <button
              key="back-button"
              type="button"
              onClick={handleBack}
              className={secondaryButtonClass}
            >
              <ChevronLeft className="mr-2 size-4" />
              Back
            </button>
          )}
          {isProgressive && step < sections.length && (
            <button
              key="next-button"
              type="button"
              onClick={handleNext}
              className={primaryButtonClass}
            >
              Next
              <ChevronRight className="ml-2 size-4" />
            </button>
          )}
          {(!isProgressive || step === sections.length) && (
            <button
              key="submit-button"
              type="submit"
              className={primaryButtonClass}
              disabled={isPending || isUploading}
            >
              {isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {isUploading ? "Uploading..." : submitButtonLabel}
            </button>
          )}
        </div>
      )}
    </form>
  );
}
