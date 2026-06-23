import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import Link from "next/link";
import { Plus, Settings2, Globe, ExternalLink } from "lucide-react";
import { buildPublicIntakeUrlForForm } from "@/lib/public-intake-url";
import { CopyPublicRequestUrlButton } from "@/components/leads/copy-public-request-url-button";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { PUBLIC_INTAKE_FORM_WHERE } from "@/lib/intake/intake-form-surface";
import {
  INTAKE_CUSTOMER_FIELDS_PATH,
  INTAKE_SETTINGS_HUB_PATH,
  INTAKE_SPECIALIZED_NEW_PATH,
  intakeFormEditorPath,
} from "@/lib/intake-settings-hierarchy";
import { ArchiveIntakeFormButton } from "@/components/settings/archive-intake-form-button";
import { CustomerIntakeModuleNav } from "@/components/settings/customer-intake-module-nav";

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
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Settings", href: "/settings" },
          { label: "Customer intake", href: INTAKE_SETTINGS_HUB_PATH },
          { label: "Specialized forms" },
        ]}
      />
      <CustomerIntakeModuleNav />
      <WorkspacePanel padding="compact" className="mb-6">
        <p className="text-sm text-foreground-muted">
          Optional public links beyond your{" "}
          <Link href={INTAKE_CUSTOMER_FIELDS_PATH} className="text-accent hover:underline">
            customer fields
          </Link>
          .
        </p>
      </WorkspacePanel>
      <PageHeader
        title="Specialized forms"
        description="Optional public entry points that still create leads in the same Lead Review and quote flow."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link
              href={INTAKE_SETTINGS_HUB_PATH}
              className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground"
            >
              ← Overview
            </Link>
            <Link
              href={INTAKE_SPECIALIZED_NEW_PATH}
              className="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-contrast transition-opacity hover:opacity-90"
            >
              <Plus className="mr-2 size-4" />
              Create specialized form
            </Link>
          </div>
        }
      />

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Active specialized forms</h2>
          <span className="text-xs text-foreground-subtle">{specializedForms.length}</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {specializedForms.map((form) => (
            <div
              key={form.id}
              className="group relative rounded-xl border border-border bg-surface p-5 shadow-sm transition-all hover:border-accent/40 hover:shadow-md"
            >
              <div className="mb-4 flex items-start justify-between">
                <div className="rounded-lg bg-success/10 p-2 text-success">
                  <Globe className="size-5" />
                </div>
              </div>

              <h3 className="font-bold text-foreground transition-colors group-hover:text-accent">
                {form.name}
              </h3>

              {organization?.slug ? (
                <div className="mt-2 space-y-2">
                  <div className="flex items-center gap-1.5 truncate text-[0.65rem] font-mono text-foreground-subtle">
                    <ExternalLink className="size-3" />
                    {buildPublicIntakeUrlForForm({
                      companySlug: organization.slug,
                      formSlug: form.slug,
                      isDefault: form.isDefault,
                    })}
                  </div>
                  {baseUrl ? (
                    <CopyPublicRequestUrlButton
                      url={buildPublicIntakeUrlForForm({
                        baseUrl,
                        companySlug: organization.slug,
                        formSlug: form.slug,
                        isDefault: form.isDefault,
                      })}
                    />
                  ) : null}
                  <p className="text-[0.65rem] leading-relaxed text-foreground-muted">
                    Specialized public link for campaigns, trade pages, or distinct service lines.
                  </p>
                </div>
              ) : (
                <p className="mt-1 font-mono text-xs text-foreground-subtle">/{form.slug}</p>
              )}

              <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
                <span className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                  Specialized
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={intakeFormEditorPath(form.id)}
                    className="inline-flex items-center text-xs font-bold text-accent hover:underline"
                  >
                    <Settings2 className="mr-1.5 size-3" />
                    Edit fields
                  </Link>
                  <ArchiveIntakeFormButton formId={form.id} formName={form.name} />
                </div>
              </div>
            </div>
          ))}
          {specializedForms.length === 0 ? (
            <div className="col-span-full rounded-xl border border-dashed border-border bg-foreground/[0.01] px-4 py-10 text-center">
              <h3 className="text-sm font-bold text-foreground">No specialized forms yet</h3>
              <p className="mx-auto mt-2 max-w-md text-xs text-foreground-muted">
                Most contractors only need the default customer intake. Create a specialized form
                when you need a separate public link for a campaign, trade page, or service line.
              </p>
              <Link
                href={INTAKE_SPECIALIZED_NEW_PATH}
                className="mt-4 inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-contrast transition-opacity hover:opacity-90"
              >
                Create specialized form
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
