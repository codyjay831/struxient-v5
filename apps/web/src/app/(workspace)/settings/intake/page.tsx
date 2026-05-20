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
  INTAKE_PUBLIC_COPY_PATH,
} from "@/lib/intake-settings-hierarchy";

export const dynamic = "force-dynamic";

const cardLinkClass =
  "inline-flex items-center justify-center rounded-lg border border-border bg-accent px-3 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90";

const mutedLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default async function IntakeSettingsHubPage() {
  const ctx = await getRequestContextOrThrow();
  const [publicSettings, organization, customFormCount] = await Promise.all([
    db.publicRequestSettings.findUnique({
      where: { organizationId: ctx.organizationId },
      select: { enabled: true, formTitle: true },
    }),
    db.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { name: true, slug: true },
    }),
    db.intakeFormDefinition.count({
      where: { organizationId: ctx.organizationId, archivedAt: null },
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
        description="Configure how new requests enter Struxient. Start with your public link and copy; advanced form structure is optional."
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
            title="Public request"
            description="Presentation policy for your customer-facing request page — title, intro, submit button, and request type labels."
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
          <div className="mt-4">
            <Link href={INTAKE_PUBLIC_COPY_PATH} className={cardLinkClass}>
              Edit public copy & request types
            </Link>
          </div>
        </WorkspacePanel>

        <WorkspacePanel>
          <SectionHeading
            title="Default intake"
            description="Every organization gets a working public intake without setup. Custom forms are optional."
          />
          <p className="mt-3 text-sm text-foreground-muted">
            Your public request link uses the built-in default form when you have not published a
            custom default form. Core fields (contact, location, request type, scope, timing) are
            always collected for Lead Review.
          </p>
          <div className="mt-3">
            <StatusBadge label="Always on" tone="approved" />
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

        <WorkspacePanel>
          <SectionHeading
            title="Advanced"
            description="Power settings for custom form definitions. Not required for most contractors."
          />
          <p className="mt-3 text-sm text-foreground-muted">
            Atom-level form editing stays internal. Use custom forms only when you need alternate
            public slugs or non-default field layouts.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={INTAKE_CUSTOM_FORMS_PATH} className={mutedLinkClass}>
              Custom intake forms
              {customFormCount > 0 ? ` (${customFormCount})` : ""}
            </Link>
          </div>
        </WorkspacePanel>
      </div>
    </div>
  );
}
