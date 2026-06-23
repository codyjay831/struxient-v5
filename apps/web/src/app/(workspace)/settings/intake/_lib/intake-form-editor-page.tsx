import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { notFound } from "next/navigation";
import { LeadChannel } from "@prisma/client";
import type { IntakeFormSchema } from "@/lib/intake/default-intake-form";
import { resolvePublicFormRequestTypeOptions } from "@/lib/intake/public-intake-request-types";
import { normalizePublicIntakeSchema } from "@/lib/intake/public-intake-schema-invariants";
import {
  DEFAULT_OFFICE_REQUEST_TYPE_OPTIONS,
  parseOfficeRequestTypeOptionsFromTriageRules,
} from "@/lib/intake/default-office-intake-form";
import { DEFAULT_PUBLIC_REQUEST_TYPE_OPTIONS } from "@/lib/public-request-settings-defaults";
import {
  resolveIntakeEditorContext,
} from "@/lib/intake/intake-editor-context";
import {
  DEFAULT_PUBLIC_REQUEST_FORM_TITLE,
  DEFAULT_PUBLIC_REQUEST_SUBMIT_BUTTON_TEXT,
} from "@/lib/public-request-settings-defaults";
import { IntakeFormEditor } from "../forms/[formId]/intake-form-editor";

export async function IntakeFormEditorPage({
  formId,
  editorShellHeight,
}: {
  formId: string;
  editorShellHeight?: string;
}) {
  const ctx = await getRequestContextOrThrow();

  const [form, organization, publicSettings] = await Promise.all([
    db.intakeFormDefinition.findFirst({
      where: { id: formId, organizationId: ctx.organizationId },
    }),
    db.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { slug: true, name: true },
    }),
    db.publicRequestSettings.findUnique({
      where: { organizationId: ctx.organizationId },
      select: {
        formTitle: true,
        introMessage: true,
        emergencyWarningText: true,
        submitButtonText: true,
      },
    }),
  ]);

  if (!form) {
    notFound();
  }

  const isPublicIntakeForm =
    form.channel === LeadChannel.WEB_FORM && form.isPublic === true;
  const editorSchema = isPublicIntakeForm
    ? normalizePublicIntakeSchema(form.schema as IntakeFormSchema)
    : (form.schema as IntakeFormSchema);
  const initialRequestTypeOptions = isPublicIntakeForm
    ? (resolvePublicFormRequestTypeOptions(form.triageRules) ??
      DEFAULT_PUBLIC_REQUEST_TYPE_OPTIONS)
    : (parseOfficeRequestTypeOptionsFromTriageRules(form.triageRules) ??
      DEFAULT_OFFICE_REQUEST_TYPE_OPTIONS);
  const editorContext = resolveIntakeEditorContext(form);

  return (
    <IntakeFormEditor
      formDefinition={{
        id: form.id,
        name: form.name,
        organizationId: form.organizationId,
        slug: form.slug,
        channel: form.channel,
        isPublic: form.isPublic,
        isDefault: form.isDefault,
        schema: editorSchema,
      }}
      editorContext={editorContext}
      isPublicIntakeForm={isPublicIntakeForm}
      initialRequestTypeOptions={initialRequestTypeOptions}
      organizationSlug={organization?.slug ?? null}
      organizationDisplayName={organization?.name ?? "Your company"}
      baseUrl={process.env.NEXT_PUBLIC_APP_URL ?? ""}
      publicPageCopy={
        isPublicIntakeForm
          ? {
              formTitle: publicSettings?.formTitle ?? DEFAULT_PUBLIC_REQUEST_FORM_TITLE,
              introMessage: publicSettings?.introMessage ?? null,
              emergencyWarningText: publicSettings?.emergencyWarningText ?? null,
              submitButtonText:
                publicSettings?.submitButtonText ?? DEFAULT_PUBLIC_REQUEST_SUBMIT_BUTTON_TEXT,
            }
          : undefined
      }
      editorShellHeight={editorShellHeight}
    />
  );
}
