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
        description="One intake engine with separate form definitions for customer requests and office new leads. Editing one surface does not change the other."
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
            description="Customer-facing request page — copy, request type labels, and public form definitions."
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
            Structural fields come from your default public form and optional custom public slugs.
            Does not affect office intake at <span className="font-medium text-foreground">/leads/new</span>.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={INTAKE_PUBLIC_COPY_PATH} className={cardLinkClass}>
              Edit public copy & request types
            </Link>
            <Link href={INTAKE_CUSTOM_FORMS_PATH} className={mutedLinkClass}>
              Advanced public forms
              {publicCustomFormCount > 0 ? ` (${publicCustomFormCount})` : ""}
            </Link>
          </div>
        </WorkspacePanel>

        <WorkspacePanel>
          <SectionHeading
            title="Office new lead form"
            description="Form used by staff at /leads/new — separate from public customer forms."
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
