import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import Link from "next/link";
import { Plus } from "lucide-react";
import { buildPublicIntakeUrlForForm } from "@/lib/public-intake-url";
import { CopyPublicRequestUrlButton } from "@/components/leads/copy-public-request-url-button";
import { PageHeader } from "@/components/ui/page-header";
import { PUBLIC_INTAKE_FORM_WHERE } from "@/lib/intake/intake-form-surface";
import { INTAKE_SPECIALIZED_NEW_PATH, intakeFormEditorPath } from "@/lib/intake-settings-hierarchy";
import { ArchiveIntakeFormButton } from "@/components/settings/archive-intake-form-button";

export default async function SpecializedIntakeFormsPage() {
  const ctx = await getRequestContextOrThrow();

  const [specializedForms, organization] = await Promise.all([
    db.intakeFormDefinition.findMany({
      where: {
        organizationId: ctx.organizationId,
        archivedAt: null,
        ...PUBLIC_INTAKE_FORM_WHERE,
        isDefault: false,
      },
      orderBy: { createdAt: "desc" },
    }),
    db.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { slug: true },
    }),
  ]);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  return (
    <>
      <PageHeader
        title="Specialized request links"
        description="Optional public entry points that still create leads in the same Lead Review and quote flow."
        actions={
          <Link
            href={INTAKE_SPECIALIZED_NEW_PATH}
            className="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-contrast transition-opacity hover:opacity-90"
          >
            <Plus className="mr-2 size-4" />
            Create request link
          </Link>
        }
      />

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Active links</h2>
          <span className="text-xs text-foreground-subtle">{specializedForms.length}</span>
        </div>
        <div className="space-y-3">
          {specializedForms.map((form) => (
            <div
              key={form.id}
              className="rounded-xl border border-border bg-surface p-4 shadow-sm"
            >
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-foreground">{form.name}</h3>
                  <p className="mt-1 truncate font-mono text-xs text-foreground-subtle">
                    {buildPublicIntakeUrlForForm({
                      companySlug: organization?.slug ?? "your-company-slug",
                      formSlug: form.slug,
                      isDefault: form.isDefault,
                    })}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <Link
                    href={intakeFormEditorPath(form.id)}
                    className="inline-flex items-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-border-strong hover:bg-foreground/[0.02]"
                  >
                    Edit questions
                  </Link>
                  {baseUrl && organization?.slug ? (
                    <CopyPublicRequestUrlButton
                      url={buildPublicIntakeUrlForForm({
                        baseUrl,
                        companySlug: organization.slug,
                        formSlug: form.slug,
                        isDefault: form.isDefault,
                      })}
                    />
                  ) : null}
                  <ArchiveIntakeFormButton formId={form.id} formName={form.name} />
                </div>
              </div>
            </div>
          ))}
          {specializedForms.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-foreground/[0.01] px-4 py-10 text-center">
              <h3 className="text-sm font-bold text-foreground">No specialized links yet</h3>
              <p className="mx-auto mt-2 max-w-md text-xs text-foreground-muted">
                Create a specialized request link only when you need a separate public URL for a
                campaign, trade page, or service line.
              </p>
              <Link
                href={INTAKE_SPECIALIZED_NEW_PATH}
                className="mt-4 inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-contrast transition-opacity hover:opacity-90"
              >
                Create request link
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
