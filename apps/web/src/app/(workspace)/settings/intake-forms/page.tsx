import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import Link from "next/link";
import { Plus, Settings2, Globe, Lock, ExternalLink } from "lucide-react";
import { buildPublicIntakeUrlForForm } from "@/lib/public-intake-url";
import { CopyPublicRequestUrlButton } from "@/components/leads/copy-public-request-url-button";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { PUBLIC_INTAKE_FORM_WHERE } from "@/lib/intake/intake-form-surface";
import { INTAKE_SETTINGS_HUB_PATH } from "@/lib/intake-settings-hierarchy";

export default async function IntakeFormsPage() {
  const ctx = await getRequestContextOrThrow();

  const [forms, organization] = await Promise.all([
    db.intakeFormDefinition.findMany({
      where: {
        organizationId: ctx.organizationId,
        archivedAt: null,
        ...PUBLIC_INTAKE_FORM_WHERE,
      },
      orderBy: { createdAt: "desc" },
    }),
    db.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { slug: true },
    }),
  ]);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const defaultForms = forms.filter((form) => form.isDefault);
  const specializedForms = forms.filter((form) => !form.isDefault);

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Settings", href: "/settings" },
          { label: "Customer intake", href: INTAKE_SETTINGS_HUB_PATH },
          { label: "Specialized customer forms" },
        ]}
      />
      <WorkspacePanel padding="compact" className="mb-6">
        <p className="text-sm text-foreground-muted">
          Optional extra public links for campaigns, trade-specific landing pages, referral partners,
          or distinct service lines. Your{" "}
          <Link href={INTAKE_SETTINGS_HUB_PATH} className="text-accent hover:underline">
            default customer intake
          </Link>{" "}
          remains the main customer path. Page copy and availability are edited separately. Internal
          staff intake is configured under{" "}
          <Link href="/settings/intake/office" className="text-accent hover:underline">
            default internal intake
          </Link>
          .
        </p>
      </WorkspacePanel>
      <PageHeader
        title="Specialized customer forms"
        description="Optional public entry points that still create leads in the same Lead Review and quote flow."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link
              href={INTAKE_SETTINGS_HUB_PATH}
              className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground"
            >
              ← Customer intake
            </Link>
            <Link
              href="/settings/intake-forms/new"
              className="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-contrast transition-opacity hover:opacity-90"
            >
              <Plus className="mr-2 size-4" />
              Create specialized form
            </Link>
          </div>
        }
      />

      <div className="space-y-8">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">Default customer intake</h2>
            <span className="text-xs text-foreground-subtle">{defaultForms.length}</span>
          </div>
          <p className="text-xs text-foreground-muted">
            Edit the main customer form from{" "}
            <Link href={INTAKE_SETTINGS_HUB_PATH} className="text-accent hover:underline">
              customer intake
            </Link>
            . This list shows the stored default form for reference.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {defaultForms.map((form) => (
              <div
                key={form.id}
                className="group relative rounded-xl border border-border bg-surface p-5 shadow-sm transition-all hover:border-accent/40 hover:shadow-md"
              >
                <div className="mb-4 flex items-start justify-between">
                  <div
                    className={`rounded-lg p-2 ${form.isPublic ? "bg-success/10 text-success" : "bg-foreground/5 text-foreground-subtle"}`}
                  >
                    {form.isPublic ? <Globe className="size-5" /> : <Lock className="size-5" />}
                  </div>
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-accent">
                    Default
                  </span>
                </div>

                <h3 className="font-bold text-foreground transition-colors group-hover:text-accent">
                  {form.name}
                </h3>

                {form.isPublic && organization?.slug ? (
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
                  </div>
                ) : (
                  <p className="mt-1 font-mono text-xs text-foreground-subtle">/{form.slug}</p>
                )}

                <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
                  <span className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                    Customer intake
                  </span>
                  <Link
                    href={`/settings/intake-forms/${form.id}`}
                    className="inline-flex items-center text-xs font-bold text-accent hover:underline"
                  >
                    <Settings2 className="mr-1.5 size-3" />
                    Edit fields
                  </Link>
                </div>
              </div>
            ))}
            {defaultForms.length === 0 ? (
              <div className="col-span-full rounded-xl border border-border bg-foreground/[0.01] px-4 py-6 text-sm text-foreground-muted">
                No default customer form found yet. It will be created automatically when needed.
              </div>
            ) : null}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">Specialized customer forms</h2>
            <span className="text-xs text-foreground-subtle">{specializedForms.length}</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {specializedForms.map((form) => (
              <div
                key={form.id}
                className="group relative rounded-xl border border-border bg-surface p-5 shadow-sm transition-all hover:border-accent/40 hover:shadow-md"
              >
                <div className="mb-4 flex items-start justify-between">
                  <div
                    className={`rounded-lg p-2 ${form.isPublic ? "bg-success/10 text-success" : "bg-foreground/5 text-foreground-subtle"}`}
                  >
                    {form.isPublic ? <Globe className="size-5" /> : <Lock className="size-5" />}
                  </div>
                </div>

                <h3 className="font-bold text-foreground transition-colors group-hover:text-accent">
                  {form.name}
                </h3>

                {form.isPublic && organization?.slug ? (
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

                <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
                  <span className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                    Specialized
                  </span>
                  <Link
                    href={`/settings/intake-forms/${form.id}`}
                    className="inline-flex items-center text-xs font-bold text-accent hover:underline"
                  >
                    <Settings2 className="mr-1.5 size-3" />
                    Edit fields
                  </Link>
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
                  href="/settings/intake-forms/new"
                  className="mt-4 inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-contrast transition-opacity hover:opacity-90"
                >
                  Create specialized form
                </Link>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
