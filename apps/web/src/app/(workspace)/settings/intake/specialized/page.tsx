import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import Link from "next/link";
import { Plus, ChevronRight } from "lucide-react";
import { buildPublicIntakeUrlForForm } from "@/lib/public-intake-url";
import { CopyPublicRequestUrlButton } from "@/components/leads/copy-public-request-url-button";
import { PUBLIC_INTAKE_FORM_WHERE } from "@/lib/intake/intake-form-surface";
import { INTAKE_SPECIALIZED_NEW_PATH, intakeFormEditorPath } from "@/lib/intake-settings-hierarchy";
import { ArchiveIntakeFormButton } from "@/components/settings/archive-intake-form-button";
import { RestoreIntakeFormButton } from "@/components/settings/restore-intake-form-button";

function formatArchivedDate(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export default async function SpecializedIntakeFormsPage() {
  const ctx = await getRequestContextOrThrow();

  const [requestLinks, archivedLinks, organization] = await Promise.all([
    db.intakeFormDefinition.findMany({
      where: {
        organizationId: ctx.organizationId,
        archivedAt: null,
        ...PUBLIC_INTAKE_FORM_WHERE,
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    }),
    db.intakeFormDefinition.findMany({
      where: {
        organizationId: ctx.organizationId,
        archivedAt: { not: null },
        ...PUBLIC_INTAKE_FORM_WHERE,
      },
      orderBy: { archivedAt: "desc" },
    }),
    db.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { slug: true },
    }),
  ]);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const additionalLinks = requestLinks.filter((form) => !form.isDefault);

  return (
    <>
      <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Customer request links
          </h1>
          <p className="mt-0.5 text-sm text-foreground-muted">
            Primary link plus optional campaign or service-line URLs.
          </p>
        </div>
        <Link
          href={INTAKE_SPECIALIZED_NEW_PATH}
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-contrast transition-opacity hover:opacity-90"
        >
          <Plus className="mr-2 size-4" />
          Create request link
        </Link>
      </header>

      <div className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">Active links</h2>
            <span className="text-xs text-foreground-subtle">{requestLinks.length}</span>
          </div>
          <div className="space-y-3">
            {requestLinks.map((form) => (
              <div
                key={form.id}
                className="rounded-xl border border-border bg-surface p-4 shadow-sm"
              >
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">{form.name}</h3>
                      {form.isDefault ? (
                        <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-accent">
                          Primary link
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate font-mono text-xs text-foreground-subtle">
                      {buildPublicIntakeUrlForForm({
                        companySlug: organization?.slug ?? "your-company-slug",
                        formSlug: form.slug,
                        isDefault: form.isDefault,
                      })}
                    </p>
                    {form.isDefault ? (
                      <p className="mt-2 text-[0.65rem] leading-relaxed text-foreground-muted">
                        Primary customer URL — edit questions or pause intake from Customer request
                        page.
                      </p>
                    ) : null}
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
                    {!form.isDefault ? (
                      <ArchiveIntakeFormButton formId={form.id} formName={form.name} />
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
            {requestLinks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-foreground/[0.01] px-4 py-10 text-center">
                <h3 className="text-sm font-bold text-foreground">No active customer request links</h3>
                <p className="mx-auto mt-2 max-w-md text-xs text-foreground-muted">
                  Your primary link is provisioned at signup. Create an additional link when you need
                  a separate public URL for a campaign, trade page, or service line.
                </p>
                <Link
                  href={INTAKE_SPECIALIZED_NEW_PATH}
                  className="mt-4 inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-contrast transition-opacity hover:opacity-90"
                >
                  Create request link
                </Link>
              </div>
            ) : additionalLinks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-foreground/[0.01] px-4 py-6 text-center">
                <p className="mx-auto max-w-md text-xs text-foreground-muted">
                  No additional links yet. Create one when you need a separate public URL for a
                  campaign, trade page, or service line.
                </p>
                <Link
                  href={INTAKE_SPECIALIZED_NEW_PATH}
                  className="mt-3 inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-border-strong hover:bg-foreground/[0.02]"
                >
                  Create request link
                </Link>
              </div>
            ) : null}
          </div>
        </div>

        {archivedLinks.length > 0 ? (
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2">
                <ChevronRight
                  className="size-3.5 text-foreground-subtle transition-transform group-open:rotate-90"
                  aria-hidden
                />
                <span className="text-sm font-semibold text-foreground">Archived</span>
              </span>
              <span className="text-xs text-foreground-subtle">{archivedLinks.length}</span>
            </summary>
            <div className="mt-3 space-y-3">
              {archivedLinks.map((form) => (
                <div
                  key={form.id}
                  className="rounded-xl border border-border bg-foreground/[0.01] p-4"
                >
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                    <div className="min-w-0">
                      <h3 className="text-sm font-medium text-foreground-muted">{form.name}</h3>
                      <p className="mt-1 truncate font-mono text-xs text-foreground-subtle">
                        {buildPublicIntakeUrlForForm({
                          companySlug: organization?.slug ?? "your-company-slug",
                          formSlug: form.slug,
                          isDefault: form.isDefault,
                        })}
                      </p>
                      {form.archivedAt ? (
                        <p className="mt-1 text-[0.65rem] text-foreground-subtle">
                          Archived {formatArchivedDate(form.archivedAt)}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[0.65rem] leading-relaxed text-foreground-muted">
                        Permanently unavailable while archived. Restore to reactivate this link.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      <RestoreIntakeFormButton formId={form.id} formName={form.name} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </>
  );
}
