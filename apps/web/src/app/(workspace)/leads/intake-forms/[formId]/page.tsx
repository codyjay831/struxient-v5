import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { notFound } from "next/navigation";
import type { IntakeFormSchema } from "@/lib/intake/default-intake-form";
import { IntakeFormEditor } from "./intake-form-editor";

export default async function EditIntakeFormPage({
  params,
}: {
  params: Promise<{ formId: string }>;
}) {
  const { formId } = await params;
  const ctx = await getRequestContextOrThrow();

  const [form, organization] = await Promise.all([
    db.intakeFormDefinition.findFirst({
      where: { id: formId, organizationId: ctx.organizationId },
    }),
    db.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { slug: true },
    }),
  ]);

  if (!form) {
    notFound();
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
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
        organizationSlug={organization?.slug ?? null}
        baseUrl={process.env.NEXT_PUBLIC_APP_URL ?? ""}
      />
    </div>
  );
}
