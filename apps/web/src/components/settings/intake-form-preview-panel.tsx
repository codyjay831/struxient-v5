"use client";

import {
  IntakeFormRenderer,
  type IntakeRequestTypeOption,
  type IntakeSubmitState,
} from "@/components/intake/intake-form-renderer";
import type { IntakeFormDefinitionShape } from "@/lib/intake/default-intake-form";
import type { IntakeEditorContext } from "@/lib/intake/intake-editor-context";

async function previewSubmitAction(
  _prev: IntakeSubmitState,
  _data: FormData,
): Promise<IntakeSubmitState> {
  void _prev;
  void _data;
  return { success: true };
}

export function IntakeFormPreviewPanel({
  formDefinition,
  organizationDisplayName,
  requestTypeOptions = [],
  submitButtonLabel = "Submit Request",
  editorContext,
  formTitle,
  introMessage,
  emergencyWarningText,
}: {
  formDefinition: IntakeFormDefinitionShape;
  organizationDisplayName: string;
  requestTypeOptions?: IntakeRequestTypeOption[];
  submitButtonLabel?: string;
  editorContext: IntakeEditorContext;
  formTitle?: string | null;
  introMessage?: string | null;
  emergencyWarningText?: string | null;
}) {
  const isPublic = editorContext !== "defaultInternalIntake";

  return (
    <div className="rounded-xl border border-border bg-surface shadow-sm">
      <div className="border-b border-border px-4 py-3 sm:px-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          Live preview
        </p>
        <p className="mt-1 text-sm text-foreground-muted">
          Preview only — submitting here does not create a lead.
        </p>
      </div>

      {isPublic && (formTitle || introMessage || emergencyWarningText) ? (
        <div className="space-y-3 border-b border-border px-4 py-4 sm:px-5">
          {formTitle ? (
            <p className="text-lg font-semibold tracking-tight text-foreground">{formTitle}</p>
          ) : null}
          {introMessage ? (
            <p className="text-sm leading-relaxed text-foreground-muted whitespace-pre-wrap">
              {introMessage}
            </p>
          ) : null}
          {emergencyWarningText ? (
            <p
              role="alert"
              className="rounded-lg border border-danger/35 bg-danger/[0.07] px-3 py-2 text-sm text-danger"
            >
              {emergencyWarningText}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="px-4 py-5 sm:px-5">
        <IntakeFormRenderer
          formDefinition={formDefinition}
          organizationDisplayName={organizationDisplayName}
          submitAction={previewSubmitAction}
          requestTypeOptions={requestTypeOptions}
          submitButtonLabel={submitButtonLabel}
          surfaceMode={isPublic ? "public" : "staff"}
          layoutMode={isPublic ? "progressive" : "compact"}
          previewMode
        />
      </div>
    </div>
  );
}
