import Link from "next/link";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBadge } from "@/components/ui/status-badge";
import { PublicRequestLinkPanel } from "@/components/leads/public-request-link-panel";
import { IntakePathPresetsPanel } from "@/components/settings/intake-path-presets-panel";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import {
  INTAKE_CUSTOM_FORMS_PATH,
  INTAKE_OFFICE_FORM_PATH,
  INTAKE_PUBLIC_COPY_PATH,
} from "@/lib/intake-settings-hierarchy";
import { OFFICE_INTAKE_FORM_WHERE, PUBLIC_INTAKE_FORM_WHERE } from "@/lib/intake/intake-form-surface";

export const dynamic = "force-dynamic";

const cardLinkClass =
  "inline-flex items-center justify-center rounded-lg border border-border bg-accent px-3 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90";

const mutedLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default async function IntakeSettingsHubPage() {
  const ctx = await getRequestContextOrThrow();
  const [publicSettings, organization, publicCustomFormCount, officeDefaultForm] =
    await Promise.all([
      db.publicRequestSettings.findUnique({
        where: { organizationId: ctx.organizationId },
        select: { enabled: true, formTitle: true },
      }),
      db.organization.findUnique({
        where: { id: ctx.organizationId },
        select: { name: true, slug: true },
      }),
      db.intakeFormDefinition.count({
        where: {
          organizationId: ctx.organizationId,
          archivedAt: null,
          ...PUBLIC_INTAKE_FORM_WHERE,
          isDefault: false,
        },
      }),
      db.intakeFormDefinition.findFirst({
        where: {
          organizationId: ctx.organizationId,
          archivedAt: null,
          ...OFFICE_INTAKE_FORM_WHERE,
          isDefault: true,
        },
        select: { id: true, name: true },
      }),
    ]);

  const publicLive = publicSettings?.enabled ?? true;

  return (
    <div className="mx-auto max-w-3xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Settings", href: "/settings" },
          { label: "Customer intake" },
        ]}
      />
      <PageHeader
        title="Customer intake"
        description="Set up how customers request work and how office staff logs requests. Start with the default flow, then open advanced options only when needed."
        actions={
          <Link href="/settings" className={mutedLinkClass}>
            ← Settings
          </Link>
        }
      />

      <PublicRequestLinkPanel
        organizationName={organization?.name ?? "your organization"}
        slug={organization?.slug ?? null}
        baseUrl={process.env.NEXT_PUBLIC_APP_URL ?? ""}
        publicRequestLive={publicLive}
        className="mb-6"
      />

      <div className="space-y-6">
        <WorkspacePanel>
          <SectionHeading
            title="Public customer request"
            description="Main customer request page. Keep this simple: one public page, clear copy, and one default request form."
          />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <StatusBadge
              label={publicLive ? "Accepting requests" : "Paused"}
              tone={publicLive ? "approved" : "warning"}
            />
            {publicSettings?.formTitle ? (
              <span className="text-xs text-foreground-muted truncate max-w-md">
                Form title: {publicSettings.formTitle}
              </span>
            ) : null}
          </div>
          <p className="mt-3 text-sm text-foreground-muted">
            Public form fields live with the form. Request-page settings control link status and customer-facing copy. This does not affect office intake at{" "}
            <span className="font-medium text-foreground">/leads/new</span>.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={INTAKE_PUBLIC_COPY_PATH} className={cardLinkClass}>
              Customer request page settings
            </Link>
            <details className="group rounded-lg border border-border px-3 py-2">
              <summary className="cursor-pointer list-none text-xs font-medium text-foreground-muted transition-colors group-open:text-foreground [&::-webkit-details-marker]:hidden">
                Advanced form options
              </summary>
              <p className="mt-2 text-xs text-foreground-muted">
                Use only when you need extra public slugs or specialized request forms.
              </p>
              <div className="mt-3">
                <Link href={INTAKE_CUSTOM_FORMS_PATH} className={mutedLinkClass}>
                  Additional public forms ({publicCustomFormCount})
                </Link>
              </div>
            </details>
          </div>
        </WorkspacePanel>

        <WorkspacePanel>
          <SectionHeading
            title="Office new lead form"
            description="Staff-only request intake at /leads/new. Keep this tuned for call/email/walk-in speed."
          />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <StatusBadge label="Always on" tone="approved" />
            {officeDefaultForm?.name ? (
              <span className="text-xs text-foreground-muted truncate max-w-md">
                Default: {officeDefaultForm.name}
              </span>
            ) : (
              <span className="text-xs text-foreground-muted">
                Default form is created on first office intake use
              </span>
            )}
          </div>
          <p className="mt-3 text-sm text-foreground-muted">
            Staff-only details (source channel, internal notes, template helper) stay outside the
            form schema. Changing public forms does not change this surface.
          </p>
          <div className="mt-4">
            <Link href={INTAKE_OFFICE_FORM_PATH} className={cardLinkClass}>
              Edit office intake form
            </Link>
          </div>
        </WorkspacePanel>

        <WorkspacePanel>
          <SectionHeading
            title="Intake paths"
            description="Future modes for trade templates and complex triage — not separate systems."
          />
          <div className="mt-4">
            <IntakePathPresetsPanel />
          </div>
        </WorkspacePanel>
      </div>
    </div>
  );
}
