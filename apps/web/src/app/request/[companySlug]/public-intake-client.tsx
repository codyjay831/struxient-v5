"use client";

import {
  IntakeFormRenderer,
  type IntakeRequestTypeOption,
  type IntakeSubmitState,
} from "@/components/intake/intake-form-renderer";
import type { IntakeFormDefinitionShape } from "@/lib/intake/default-intake-form";
import { submitPublicLeadAction } from "./public-lead-actions";
import { getPublicLeadAttachmentUploadUrlAction } from "./public-attachment-actions";

export type PublicIntakeClientProps = {
  formDefinition: IntakeFormDefinitionShape;
  companySlug: string;
  organizationDisplayName: string;
  googleMapsApiKey: string;
  requestTypeOptions: IntakeRequestTypeOption[];
  submitButtonLabel: string;
};

export function PublicIntakeClient({
  formDefinition,
  companySlug,
  organizationDisplayName,
  googleMapsApiKey,
  requestTypeOptions,
  submitButtonLabel,
}: PublicIntakeClientProps) {
  const boundSubmit = async (
    prevState: IntakeSubmitState,
    formData: FormData,
  ): Promise<IntakeSubmitState> => submitPublicLeadAction(companySlug, prevState, formData);

  const handleFilesSelected = async (files: File[]): Promise<string[]> => {
    const ids: string[] = [];
    for (const file of files) {
      try {
        const prep = await getPublicLeadAttachmentUploadUrlAction(
          companySlug,
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
        ids.push(prep.attachmentId);
      } catch {
        // Swallow upload failures — the rest of the form still submits.
      }
    }
    return ids;
  };

  return (
    <IntakeFormRenderer
      formDefinition={formDefinition}
      companySlug={companySlug}
      organizationDisplayName={organizationDisplayName}
      submitAction={boundSubmit}
      googleMapsApiKey={googleMapsApiKey}
      onFilesSelected={handleFilesSelected}
      requestTypeOptions={requestTypeOptions}
      submitButtonLabel={submitButtonLabel}
    />
  );
}
