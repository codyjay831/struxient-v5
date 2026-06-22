"use client";

import { LeadChannel, NeededByBucket } from "@prisma/client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { ServiceAddressCaptureField } from "@/components/forms/service-address-capture-field";
import { LEAD_SOURCE_FORM_OPTIONS } from "@/lib/lead-display";
import { LEAD_FIELD_LIMITS } from "./lead-field-limits";
import { type LeadFormState } from "./lead-form-actions";
import { ChevronRight } from "lucide-react";
import { MultiFilePicker } from "@/components/forms/multi-file-picker";
import { getLeadAttachmentUploadUrlAction } from "./lead-attachment-actions";
import type { LineItemTemplatePickerRow } from "@/lib/line-item-template-display";
import { formatMoneyCents } from "@/lib/quote-display";
import { CustomFieldsForm, type CustomFieldDefPayload, type CustomFieldValuePayload } from "@/components/forms/custom-fields-form";

const fieldLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";
const controlClass =
  "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const primaryButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-border bg-accent px-4 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const mutedLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

const NEEDED_BY_BUCKET_OPTIONS: { value: NeededByBucket; label: string }[] = [
  { value: "ASAP", label: "ASAP" },
  { value: "THIS_WEEK", label: "This week" },
  { value: "THIS_MONTH", label: "This month" },
  { value: "FLEXIBLE", label: "Flexible" },
  { value: "SPECIFIC_DATE", label: "Specific date" },
];

export type LeadRecordFormProps = {
    cancelHref: string;
    googleMapsApiKey: string;
    availableTemplates: LineItemTemplatePickerRow[];
    customFieldDefs: CustomFieldDefPayload[];
    /** Server-bound `updateLeadAction.bind(null, lead.id)` — record id is not taken from editable form fields. */
    updateFormAction: (
      prevState: LeadFormState,
      formData: FormData,
    ) => Promise<LeadFormState>;
    initial: {
      contactName: string | null;
      companyName: string | null;
      email: string | null;
      phone: string | null;
      requestType: string | null;
      neededByBucket: NeededByBucket | null;
      neededByDate: Date | null;
      scopeSummary: string | null;
      source: LeadChannel;
      sourceDetail: string | null;
      notes: string | null;
      suggestedTemplateIds: string[];
      customFieldValues: CustomFieldValuePayload[];
    };
    initialVisitRequest?: {
      requestedDate: Date | null;
      requestedWindow: string | null;
      notes: string | null;
    };
    /** Prefill structured service address when editing. */
    serviceLocationDefaults?: {
      defaultDisplayAddress: string;
      initialStructuredJson: string;
    };
};

const initialActionState: LeadFormState = {};

export function LeadRecordForm(props: LeadRecordFormProps) {
  const action = props.updateFormAction;
  const [state, formAction, isPending] = useActionState(action, initialActionState);

  const defaults = props.initial;

  const [neededByBucket, setNeededByBucket] = useState<NeededByBucket | "">(
    defaults.neededByBucket ?? "",
  );

  const [suggestedTemplateIds, setSuggestedTemplateIds] = useState<string[]>(
    defaults.suggestedTemplateIds,
  );

  const [isCommercial, setIsCommercial] = useState(Boolean(defaults.companyName));

  const [requestVisit, setRequestVisit] = useState(Boolean(props.initialVisitRequest));

  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const handleFilesChange = async (files: File[]) => {
    setIsUploading(true);
    const newIds: string[] = [];
    
    for (const file of files) {
      try {
        const prep = await getLeadAttachmentUploadUrlAction(
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

  const serviceLocationDefaults = props.serviceLocationDefaults;

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? (
        <p
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-danger"
          role="alert"
          aria-live="polite"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1 w-fit">
        <button
          type="button"
          onClick={() => setIsCommercial(false)}
          className={`px-3 py-1.5 text-[0.65rem] font-bold uppercase tracking-wider rounded-md transition-all ${
            !isCommercial
              ? "bg-accent text-accent-contrast shadow-sm"
              : "text-foreground-subtle hover:text-foreground hover:bg-foreground/5"
          }`}
        >
          Residential
        </button>
        <button
          type="button"
          onClick={() => setIsCommercial(true)}
          className={`px-3 py-1.5 text-[0.65rem] font-bold uppercase tracking-wider rounded-md transition-all ${
            isCommercial
              ? "bg-accent text-accent-contrast shadow-sm"
              : "text-foreground-subtle hover:text-foreground hover:bg-foreground/5"
          }`}
        >
          Commercial
        </button>
      </div>

      <div className="rounded-xl border border-border bg-foreground/[0.01] p-4 space-y-4">
        <p className={fieldLabelClass}>{isCommercial ? "Company & Contact" : "Contact"}</p>
        
        {isCommercial && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-200">
            <label className="block">
              <span className={fieldLabelClass}>Company name</span>
              <input
                name="companyName"
                type="text"
                required={isCommercial}
                maxLength={LEAD_FIELD_LIMITS.contactName}
                autoComplete="organization"
                defaultValue={defaults.companyName ?? ""}
                className={controlClass}
              />
            </label>
          </div>
        )}

        <div>
          <label className="block">
            <span className={fieldLabelClass}>{isCommercial ? "Primary contact name" : "Contact name"}</span>
            <input
              name="contactName"
              type="text"
              maxLength={LEAD_FIELD_LIMITS.contactName}
              autoComplete="name"
              defaultValue={defaults.contactName ?? ""}
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
                maxLength={LEAD_FIELD_LIMITS.email}
                autoComplete="email"
                defaultValue={defaults.email ?? ""}
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
                maxLength={LEAD_FIELD_LIMITS.phone}
                autoComplete="tel"
                defaultValue={defaults.phone ?? ""}
                className={controlClass}
              />
            </label>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-foreground/[0.01] p-4">
        <p className={`${fieldLabelClass} mb-4`}>Address</p>
        <ServiceAddressCaptureField
          key="lead-svc-edit"
          googleMapsApiKey={props.googleMapsApiKey}
          fieldLabelClass={fieldLabelClass}
          controlClass={controlClass}
          required={false}
          defaultDisplayAddress={serviceLocationDefaults?.defaultDisplayAddress ?? ""}
          initialStructuredJson={serviceLocationDefaults?.initialStructuredJson ?? ""}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="block">
            <span className={fieldLabelClass}>Request type</span>
            <input
              name="requestType"
              type="text"
              maxLength={LEAD_FIELD_LIMITS.requestType}
              autoComplete="off"
              placeholder="e.g. Roof repair, HVAC service"
              defaultValue={defaults.requestType ?? ""}
              className={controlClass}
            />
          </label>
        </div>
        <div>
          <label className="block">
            <span className={fieldLabelClass}>Needed by</span>
            <select
              name="neededByBucket"
              value={neededByBucket}
              onChange={(e) => setNeededByBucket(e.target.value as NeededByBucket)}
              className={controlClass}
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
                  defaultValue={defaults.neededByDate ? new Date(defaults.neededByDate).toISOString().split('T')[0] : ""}
                  className={controlClass}
                />
              </label>
            </div>
          )}
        </div>
      </div>

      <div>
        <label className="block">
          <span className={fieldLabelClass}>Scope summary</span>
          <textarea
            name="scopeSummary"
            rows={3}
            maxLength={LEAD_FIELD_LIMITS.scopeSummary}
            placeholder="Briefly describe the work requested..."
            defaultValue={defaults.scopeSummary ?? ""}
            className={`${controlClass} resize-y min-h-[5rem]`}
          />
        </label>
      </div>

      {props.customFieldDefs.length > 0 && (
        <div className="rounded-xl border border-border bg-foreground/[0.01] p-4">
          <p className={`${fieldLabelClass} mb-4`}>Additional Information</p>
          <CustomFieldsForm
            fields={props.customFieldDefs}
            initialValues={props.initial.customFieldValues}
            fieldLabelClass={fieldLabelClass}
            controlClass={controlClass}
          />
        </div>
      )}

      <div className="rounded-xl border border-border bg-foreground/[0.01] p-4">
        <p className={`${fieldLabelClass} mb-3`}>Suggested Scope Items</p>
        <p className="mb-4 text-xs text-foreground-muted">
          Select common items from your library to pre-fill the quote later.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {props.availableTemplates.map((t) => {
            const isSelected = suggestedTemplateIds.includes(t.id);
            return (
              <label
                key={t.id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                  isSelected
                    ? "border-accent bg-accent/5 ring-1 ring-accent"
                    : "border-border bg-surface hover:border-border-strong"
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1 size-4 rounded border-border text-accent focus:ring-accent"
                  checked={isSelected}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSuggestedTemplateIds([...suggestedTemplateIds, t.id]);
                    } else {
                      setSuggestedTemplateIds(suggestedTemplateIds.filter((id) => id !== t.id));
                    }
                  }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {t.description}
                  </p>
                  <p className="text-[10px] text-foreground-muted">
                    {t.defaultQuantityDisplay} × {formatMoneyCents(t.defaultUnitAmountCents)}
                  </p>
                </div>
              </label>
            );
          })}
        </div>
        <input type="hidden" name="suggestedTemplateIds" value={suggestedTemplateIds.join(",")} />
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
                    defaultValue={props.initialVisitRequest?.requestedDate ? new Date(props.initialVisitRequest.requestedDate).toISOString().split('T')[0] : ""}
                    className={controlClass}
                  />
                </label>
              </div>
              <div>
                <label className="block">
                  <span className={fieldLabelClass}>Preferred window</span>
                  <select
                    name="requestedVisitWindow"
                    defaultValue={props.initialVisitRequest?.requestedWindow ? props.initialVisitRequest.requestedWindow : "ANYTIME"}
                    className={controlClass}
                  >
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
                  defaultValue={props.initialVisitRequest?.notes ? props.initialVisitRequest.notes : ""}
                  className={controlClass}
                />
              </label>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
            <ChevronRight
              className="size-3.5 shrink-0 text-foreground-subtle transition-transform group-open:rotate-90"
              aria-hidden
            />
            <span className={fieldLabelClass}>How they found us</span>
          </summary>
          <div className="mt-4 space-y-4 border-t border-border pt-4">
            <div>
              <label className="block">
                <span className={fieldLabelClass}>Source</span>
                <select name="source" defaultValue={defaults.source} className={controlClass}>
                  {LEAD_SOURCE_FORM_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div>
              <label className="block">
                <span className={fieldLabelClass}>Source detail</span>
                <input
                  name="sourceDetail"
                  type="text"
                  maxLength={LEAD_FIELD_LIMITS.sourceDetail}
                  autoComplete="off"
                  placeholder="Optional — e.g. referrer or campaign"
                  defaultValue={defaults.sourceDetail ?? ""}
                  className={controlClass}
                />
              </label>
            </div>
          </div>
        </details>
      </div>

      <div>
        <label className="block">
          <span className={fieldLabelClass}>Internal notes</span>
          <textarea
            name="notes"
            rows={4}
            maxLength={LEAD_FIELD_LIMITS.notes}
            placeholder="Internal notes for your team..."
            defaultValue={defaults.notes ?? ""}
            className={`${controlClass} resize-y min-h-[6rem]`}
          />
        </label>
      </div>

      <div className="rounded-xl border border-border bg-foreground/[0.01] p-4">
        <p className={`${fieldLabelClass} mb-4`}>Photos & Documents (optional)</p>
        <MultiFilePicker onFilesSelected={handleFilesChange} />
        <input type="hidden" name="attachmentIds" value={attachmentIds.join(",")} />
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-2">
        <button
          type="submit"
          disabled={isPending || isUploading}
          className={primaryButtonClass}
        >
          {isPending ? "Saving…" : isUploading ? "Uploading..." : "Save changes"}
        </button>
        <Link href={props.cancelHref} className={mutedLinkClass}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
