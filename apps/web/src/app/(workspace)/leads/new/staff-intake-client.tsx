"use client";

import { LeadChannel } from "@prisma/client";
import { useState } from "react";
import {
  IntakeFormRenderer,
  type IntakeRequestTypeOption,
} from "@/components/intake/intake-form-renderer";
import { LEAD_SOURCE_FORM_OPTIONS } from "@/lib/lead-display";
import type { IntakeFormDefinitionShape } from "@/lib/intake/default-intake-form";
import type { LineItemTemplatePickerRow } from "@/lib/line-item-template-display";
import { formatMoneyCents } from "@/lib/quote-display";
import { getLeadAttachmentUploadUrlAction } from "../lead-attachment-actions";
import { createStaffLeadFromIntakeAction } from "../staff-intake-actions";

type StaffIntakeClientProps = {
  formDefinition: IntakeFormDefinitionShape;
  organizationDisplayName: string;
  googleMapsApiKey: string;
  requestTypeOptions: IntakeRequestTypeOption[];
  availableTemplates: LineItemTemplatePickerRow[];
};

const fieldLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";
const controlClass =
  "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function StaffIntakeClient({
  formDefinition,
  organizationDisplayName,
  googleMapsApiKey,
  requestTypeOptions,
  availableTemplates,
}: StaffIntakeClientProps) {
  const [suggestedTemplateIds, setSuggestedTemplateIds] = useState<string[]>([]);

  const handleFilesSelected = async (files: File[]): Promise<Array<{ id: string }>> => {
    const bindings: Array<{ id: string }> = [];
    for (const file of files) {
      try {
        const prep = await getLeadAttachmentUploadUrlAction(
          file.name,
          file.type,
          file.size,
        );
        if (!prep.success || !prep.uploadUrl || !prep.attachmentId) {
          continue;
        }
        if (prep.storageProvider === "local") {
          const body = new FormData();
          body.append("file", file);
          await fetch(prep.uploadUrl, { method: "POST", body });
        } else {
          await fetch(prep.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": file.type },
            body: file,
          });
        }
        bindings.push({ id: prep.attachmentId });
      } catch {
        // Ignore upload failures; submit still works without those files.
      }
    }
    return bindings;
  };

  return (
    <IntakeFormRenderer
      formDefinition={formDefinition}
      organizationDisplayName={organizationDisplayName}
      submitAction={createStaffLeadFromIntakeAction}
      googleMapsApiKey={googleMapsApiKey}
      onFilesSelected={handleFilesSelected}
      requestTypeOptions={requestTypeOptions}
      submitButtonLabel="Save intake"
      surfaceMode="staff"
      layoutMode="compact"
      internalDetailsSlot={
        <details className="rounded-xl border border-border bg-foreground/[0.01] p-4">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
            Internal details
          </summary>
          <div className="mt-4 space-y-4">
            <div>
              <label className="block">
                <span className={fieldLabelClass}>Source channel</span>
                <select name="source" defaultValue={LeadChannel.MANUAL} className={controlClass}>
                  {LEAD_SOURCE_FORM_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
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
                  className={controlClass}
                  placeholder="Optional source note (e.g. office call)"
                />
              </label>
            </div>

            <div>
              <label className="block">
                <span className={fieldLabelClass}>Internal note</span>
                <textarea
                  name="internalNote"
                  rows={3}
                  className={`${controlClass} resize-y`}
                  placeholder="Optional internal context for this intake"
                />
              </label>
            </div>

            {availableTemplates.length > 0 ? (
              <div className="rounded-lg border border-border bg-surface p-3">
                <p className={`${fieldLabelClass} mb-3`}>Optional scope/template helper</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {availableTemplates.map((template) => {
                    const isSelected = suggestedTemplateIds.includes(template.id);
                    return (
                      <label
                        key={template.id}
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
                          onChange={(event) => {
                            if (event.target.checked) {
                              setSuggestedTemplateIds((prev) => [...prev, template.id]);
                            } else {
                              setSuggestedTemplateIds((prev) =>
                                prev.filter((id) => id !== template.id),
                              );
                            }
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {template.description}
                          </p>
                          <p className="text-[10px] text-foreground-muted">
                            {template.defaultQuantityDisplay} x{" "}
                            {formatMoneyCents(template.defaultUnitAmountCents)}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
                <input
                  type="hidden"
                  name="suggestedTemplateIds"
                  value={suggestedTemplateIds.join(",")}
                />
              </div>
            ) : null}
          </div>
        </details>
      }
    />
  );
}
