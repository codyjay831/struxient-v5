import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import Link from "next/link";
import { Plus, Settings2, Globe, Lock, ExternalLink } from "lucide-react";
import { buildPublicIntakeUrl } from "@/lib/public-intake-url";
import { CopyPublicRequestUrlButton } from "@/components/leads/copy-public-request-url-button";

import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { PUBLIC_INTAKE_FORM_WHERE } from "@/lib/intake/intake-form-surface";

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
  const additionalForms = forms.filter((form) => !form.isDefault);

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Settings", href: "/settings" },
          { label: "Customer intake", href: "/settings/intake" },
          { label: "Public intake forms" },
        ]}
      />
      <WorkspacePanel padding="compact" className="mb-6">
        <p className="text-sm text-foreground-muted">
          Advanced setup for customer-facing public forms. Your default public form is the primary
          customer path. Use additional public slugs only when you need separate intake entry points.
          Public request page copy and link status live under{" "}
          <a href="/settings/intake" className="text-accent hover:underline">
            customer intake settings
          </a>
          . These are public customer forms only — office intake is configured separately under{" "}
          <a href="/settings/intake/office" className="text-accent hover:underline">
            Office intake form
          </a>
          .
        </p>
      </WorkspacePanel>
      <PageHeader
        title="Advanced public intake forms"
        description="Default public form plus optional additional public forms/slugs. Does not include the office /leads/new form."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link
              href="/settings/intake"
              className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground"
            >
              ← Customer intake
            </Link>
            <Link
              href="/settings/intake-forms/new"
              className="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-contrast transition-opacity hover:opacity-90"
            >
              <Plus className="mr-2 size-4" />
              Create Form
            </Link>
          </div>
        }
      />

      <div className="space-y-8">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">Default public form</h2>
            <span className="text-xs text-foreground-subtle">{defaultForms.length}</span>
          </div>
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
                      {buildPublicIntakeUrl({
                        companySlug: organization.slug,
                        formSlug: form.slug,
                      })}
                    </div>
                    {baseUrl && (
                      <CopyPublicRequestUrlButton
                        url={buildPublicIntakeUrl({
                          baseUrl,
                          companySlug: organization.slug,
                          formSlug: form.slug,
                        })}
                      />
                    )}
                  </div>
                ) : (
                  <p className="mt-1 font-mono text-xs text-foreground-subtle">/{form.slug}</p>
                )}

                <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
                  <span className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                    {form.channel}
                  </span>
                  <Link
                    href={`/settings/intake-forms/${form.id}`}
                    className="inline-flex items-center text-xs font-bold text-accent hover:underline"
                  >
                    <Settings2 className="mr-1.5 size-3" />
                    Configure
                  </Link>
                </div>
              </div>
            ))}
            {defaultForms.length === 0 ? (
              <div className="col-span-full rounded-xl border border-border bg-foreground/[0.01] px-4 py-6 text-sm text-foreground-muted">
                No default public form found yet. It will be created automatically when needed.
              </div>
            ) : null}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">Advanced: additional public forms</h2>
            <span className="text-xs text-foreground-subtle">{additionalForms.length}</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {additionalForms.map((form) => (
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
                      {buildPublicIntakeUrl({
                        companySlug: organization.slug,
                        formSlug: form.slug,
                      })}
                    </div>
                    {baseUrl && (
                      <CopyPublicRequestUrlButton
                        url={buildPublicIntakeUrl({
                          baseUrl,
                          companySlug: organization.slug,
                          formSlug: form.slug,
                        })}
                      />
                    )}
                  </div>
                ) : (
                  <p className="mt-1 font-mono text-xs text-foreground-subtle">/{form.slug}</p>
                )}

                <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
                  <span className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                    {form.channel}
                  </span>
                  <Link
                    href={`/settings/intake-forms/${form.id}`}
                    className="inline-flex items-center text-xs font-bold text-accent hover:underline"
                  >
                    <Settings2 className="mr-1.5 size-3" />
                    Configure
                  </Link>
                </div>
              </div>
            ))}
            {forms.length === 0 && (
              <div className="col-span-full rounded-xl border-2 border-dashed border-border bg-foreground/[0.01] py-20 text-center">
                <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-foreground/5 text-foreground-subtle">
                  <Plus className="size-6" />
                </div>
                <h3 className="text-sm font-bold text-foreground">No public intake forms yet</h3>
                <p className="mx-auto mt-1 max-w-[260px] text-xs text-foreground-muted">
                  Create an additional public form to capture specific request types or service
                  flows.
                </p>
                <Link
                  href="/settings/intake-forms/new"
                  className="mt-6 inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-contrast transition-opacity hover:opacity-90"
                >
                  Create Form
                </Link>
              </div>
            )}
            {forms.length > 0 && additionalForms.length === 0 ? (
              <div className="col-span-full rounded-xl border border-border bg-foreground/[0.01] px-4 py-6 text-sm text-foreground-muted">
                No additional public forms yet. The default public form is active now; create another
                slug when you need a separate customer path.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
