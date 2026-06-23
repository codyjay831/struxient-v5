import Link from "next/link";
import type { ReactNode } from "react";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBadge } from "@/components/ui/status-badge";
import { PublicRequestLinkPanel } from "@/components/leads/public-request-link-panel";
import { PublicRequestSharingGuidance } from "@/components/settings/public-request-sharing-guidance";
import { CustomerIntakeModuleNav } from "@/components/settings/customer-intake-module-nav";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import {
  INTAKE_CUSTOMER_FIELDS_PATH,
  INTAKE_PUBLIC_COPY_PATH,
  INTAKE_SPECIALIZED_PATH,
  INTAKE_STAFF_PATH,
} from "@/lib/intake-settings-hierarchy";
import { OFFICE_INTAKE_FORM_WHERE, PUBLIC_INTAKE_FORM_WHERE } from "@/lib/intake/intake-form-surface";
import { buildPublicIntakeUrl } from "@/lib/public-intake-url";
import { isSyntheticDefaultOfficeIntakeFormDefinitionId } from "@/lib/intake/default-office-intake-form";

export const dynamic = "force-dynamic";

const primaryButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-border bg-accent px-3 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90";

const secondaryButtonClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

const mutedLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

function ConfigCard({
  title,
  description,
  status,
  primaryAction,
  secondaryAction,
}: {
  title: string;
  description: string;
  status?: ReactNode;
  primaryAction: ReactNode;
  secondaryAction?: ReactNode;
}) {
  return (
    <WorkspacePanel padding="compact">
      <SectionHeading title={title} description={description} />
      {status ? <div className="mt-3 flex flex-wrap items-center gap-2">{status}</div> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {primaryAction}
        {secondaryAction}
      </div>
    </WorkspacePanel>
  );
}

export default async function IntakeSettingsHubPage() {
  const ctx = await getRequestContextOrThrow();
  const [
    publicSettings,
    organization,
    specializedFormCount,
    officeDefaultForm,
    defaultPublicForm,
  ] = await Promise.all([
    db.publicRequestSettings.findUnique({
      where: { organizationId: ctx.organizationId },
      select: { enabled: true },
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
    db.intakeFormDefinition.findFirst({
      where: {
        organizationId: ctx.organizationId,
        archivedAt: null,
        ...PUBLIC_INTAKE_FORM_WHERE,
        isDefault: true,
      },
      select: { id: true, name: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const publicLive = publicSettings?.enabled ?? true;
  const orgName = organization?.name ?? "your organization";
  const slug = organization?.slug ?? null;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const publicPreviewHref =
    slug && publicLive ? buildPublicIntakeUrl({ baseUrl, companySlug: slug }) : null;
  const officeFormProvisioned =
    officeDefaultForm && !isSyntheticDefaultOfficeIntakeFormDefinitionId(officeDefaultForm.id);
  const defaultFormName = defaultPublicForm?.name ?? "Default customer form";

  return (
    <div className="mx-auto max-w-4xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Settings", href: "/settings" },
          { label: "Customer intake" },
        ]}
      />
      <CustomerIntakeModuleNav />
      <PageHeader
        variant="compact"
        title="Customer intake"
        actions={
          <Link href="/settings" className={mutedLinkClass}>
            ← Settings
          </Link>
        }
      />
      <p className="-mt-2 mb-4 text-sm text-foreground-muted">
        Set up your public request page, customer questions, and staff intake form.
      </p>

      <div className="mb-6 flex flex-wrap gap-2">
        <StatusBadge
          label={`Public intake: ${publicLive ? "Accepting" : "Paused"}`}
          tone={publicLive ? "approved" : "warning"}
        />
        <StatusBadge label={`Default form: ${defaultFormName}`} tone="neutral" />
        <StatusBadge
          label={`Staff intake: ${officeFormProvisioned ? "On" : "Needs setup"}`}
          tone={officeFormProvisioned ? "approved" : "warning"}
        />
      </div>

      <PublicRequestLinkPanel
        organizationName={orgName}
        slug={slug}
        baseUrl={baseUrl}
        publicRequestLive={publicLive}
        previewHref={publicPreviewHref}
        editCopyHref={INTAKE_PUBLIC_COPY_PATH}
        className="mb-5"
      />

      <div className="grid gap-4 md:grid-cols-3">
        <ConfigCard
          title="Customer fields"
          description="Main public request questions and request types."
          status={
            <>
              <StatusBadge
                label={publicLive ? "Accepting" : "Paused"}
                tone={publicLive ? "approved" : "warning"}
              />
              {defaultPublicForm?.name ? (
                <span className="max-w-full truncate text-xs text-foreground-muted">
                  {defaultPublicForm.name}
                </span>
              ) : null}
            </>
          }
          primaryAction={
            <Link href={INTAKE_CUSTOMER_FIELDS_PATH} className={primaryButtonClass}>
              Edit customer fields
            </Link>
          }
        />

        <ConfigCard
          title="Staff intake"
          description="Internal form used by office staff at /leads/new."
          status={
            <>
              <StatusBadge
                label={officeFormProvisioned ? "On" : "Needs setup"}
                tone={officeFormProvisioned ? "approved" : "warning"}
              />
              {officeDefaultForm?.name ? (
                <span className="max-w-full truncate text-xs text-foreground-muted">
                  {officeDefaultForm.name}
                </span>
              ) : null}
            </>
          }
          primaryAction={
            <Link href={INTAKE_STAFF_PATH} className={primaryButtonClass}>
              Edit staff fields
            </Link>
          }
          secondaryAction={
            <Link href="/leads/new" className={secondaryButtonClass}>
              Preview staff intake
            </Link>
          }
        />

        <ConfigCard
          title="Specialized forms"
          description="Extra public request links for campaigns, trades, or service lines."
          status={
            <StatusBadge
              label={`${specializedFormCount} active specialized form${specializedFormCount === 1 ? "" : "s"}`}
              tone={specializedFormCount > 0 ? "approved" : "neutral"}
            />
          }
          primaryAction={
            <Link href={INTAKE_SPECIALIZED_PATH} className={primaryButtonClass}>
              Manage specialized forms
            </Link>
          }
        />
      </div>

      <PublicRequestSharingGuidance className="mt-6" />
    </div>
  );
}
