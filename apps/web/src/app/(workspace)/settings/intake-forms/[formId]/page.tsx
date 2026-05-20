import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { notFound } from "next/navigation";
import { LeadChannel } from "@prisma/client";
import type { IntakeFormSchema } from "@/lib/intake/default-intake-form";
import { resolvePublicFormRequestTypeOptions } from "@/lib/intake/public-intake-request-types";
import { IntakeFormEditor } from "./intake-form-editor";

import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";

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
      select: { slug: true },
    }),
    db.publicRequestSettings.findUnique({
      where: { organizationId: ctx.organizationId },
      select: { requestTypeOptionsJson: true },
    }),
  ]);

  if (!form) {
    notFound();
  }

  const isPublicIntakeForm =
    form.channel === LeadChannel.WEB_FORM && form.isPublic === true;
  const initialRequestTypeOptions = isPublicIntakeForm
    ? resolvePublicFormRequestTypeOptions(
        form.triageRules,
        publicSettings?.requestTypeOptionsJson,
      )
    : [];

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Settings", href: "/settings" },
          { label: "Customer intake", href: "/settings/intake" },
          { label: "Public intake forms", href: "/settings/intake-forms" },
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
            isPublic: form.isPublic,
            isDefault: form.isDefault,
            schema: form.schema as IntakeFormSchema,
          }}
          isPublicIntakeForm={isPublicIntakeForm}
          initialRequestTypeOptions={initialRequestTypeOptions}
          organizationSlug={organization?.slug ?? null}
          baseUrl={process.env.NEXT_PUBLIC_APP_URL ?? ""}
        />
      </div>
    </div>
  );
}
