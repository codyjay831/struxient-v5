import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { notFound } from "next/navigation";
import { LeadChannel } from "@prisma/client";
import type { IntakeFormSchema } from "@/lib/intake/default-intake-form";
import { resolvePublicFormRequestTypeOptions } from "@/lib/intake/public-intake-request-types";
import { normalizePublicIntakeSchema } from "@/lib/intake/public-intake-schema-invariants";
import { resolveIntakeEditorContext } from "@/lib/intake/intake-editor-context";
import {
  DEFAULT_PUBLIC_REQUEST_FORM_TITLE,
  DEFAULT_PUBLIC_REQUEST_SUBMIT_BUTTON_TEXT,
} from "@/lib/public-request-settings-defaults";
import { IntakeFormEditor } from "./intake-form-editor";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { intakeEditorContextLabels } from "@/lib/intake/intake-editor-context";

export default async function EditIntakeFormPage({
  params,
}: {
  params: Promise<{ formId: string }>;
}) {
  const { formId } = await params;
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
        requestTypeOptionsJson: true,
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
    ? resolvePublicFormRequestTypeOptions(
        form.triageRules,
        publicSettings?.requestTypeOptionsJson,
      )
    : [];
  const editorContext = resolveIntakeEditorContext(form);
  const labels = intakeEditorContextLabels(editorContext);

  return (
    <div className="mx-auto max-w-7xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Settings", href: "/settings" },
          { label: "Customer intake", href: "/settings/intake" },
          { label: labels.breadcrumbParent.label, href: labels.breadcrumbParent.href },
          { label: form.name },
        ]}
      />
      <div className="mt-8">
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
        />
      </div>
    </div>
  );
}
