import Link from "next/link";
import type { ReactNode } from "react";
import { ExternalLink, Globe, Users } from "lucide-react";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBadge } from "@/components/ui/status-badge";
import { PublicRequestLinkPanel } from "@/components/leads/public-request-link-panel";
import { IntakeFlowMap } from "@/components/settings/intake-flow-map";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import {
  INTAKE_CUSTOMER_FIELDS_PATH,
  INTAKE_PUBLIC_COPY_PATH,
  INTAKE_SPECIALIZED_PATH,
  INTAKE_SPECIALIZED_NEW_PATH,
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

function SetupNotice({
  tone,
  children,
}: {
  tone: "warning" | "info";
  children: ReactNode;
}) {
  const toneClass =
    tone === "warning"
      ? "border-warning/35 bg-warning/[0.07] text-foreground"
      : "border-border bg-foreground/[0.02] text-foreground-muted";
  return (
    <p className={`mt-3 rounded-lg border px-3 py-2 text-xs leading-relaxed ${toneClass}`}>
      {children}
    </p>
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
      select: { enabled: true, formTitle: true, submitButtonText: true },
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
      select: { id: true, name: true, slug: true },
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

  return (
    <div className="mx-auto max-w-4xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Settings", href: "/settings" },
          { label: "Customer intake" },
        ]}
      />
      <PageHeader
        title="Customer intake"
        description="Configure how customers and staff submit work requests."
        actions={
          <Link href="/settings" className={mutedLinkClass}>
            ← Settings
          </Link>
        }
      />

      <div className="mb-6">
        <IntakeFlowMap />
      </div>

      <PublicRequestLinkPanel
        organizationName={orgName}
        slug={slug}
        baseUrl={baseUrl}
        publicRequestLive={publicLive}
        className="mb-6"
      />

      <div className="space-y-6">
        <WorkspacePanel>
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-success/10 p-2 text-success">
              <Globe className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <SectionHeading
                title="Default customer intake"
                description="Your main public request page. Customers use this link to submit work requests."
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <StatusBadge
              label={publicLive ? "Accepting requests" : "Paused"}
              tone={publicLive ? "approved" : "warning"}
            />
            {defaultPublicForm?.name ? (
              <span className="max-w-md truncate text-xs text-foreground-muted">
                Form: {defaultPublicForm.name}
              </span>
            ) : null}
            {publicSettings?.formTitle ? (
              <span className="max-w-md truncate text-xs text-foreground-muted">
                Page title: {publicSettings.formTitle}
              </span>
            ) : null}
          </div>

          {!slug ? (
            <SetupNotice tone="warning">
              No company slug configured. Set one in{" "}
              <Link href="/settings/organization" className="text-accent hover:underline">
                Business profile
              </Link>{" "}
              before sharing a public customer link.
            </SetupNotice>
          ) : null}
          {!publicLive ? (
            <SetupNotice tone="warning">
              Public intake is paused. Turn intake back on under{" "}
              <Link href={INTAKE_PUBLIC_COPY_PATH} className="text-accent hover:underline">
                page copy & availability
              </Link>
              .
            </SetupNotice>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={INTAKE_CUSTOMER_FIELDS_PATH} className={primaryButtonClass}>
              Edit customer fields
            </Link>
            <Link href={INTAKE_PUBLIC_COPY_PATH} className={secondaryButtonClass}>
              Edit page copy & availability
            </Link>
            {publicPreviewHref ? (
              <a
                href={publicPreviewHref}
                target="_blank"
                rel="noopener noreferrer"
                className={secondaryButtonClass}
              >
                <ExternalLink className="mr-1.5 size-3.5" />
                Preview customer page
              </a>
            ) : (
              <span className={`${secondaryButtonClass} cursor-not-allowed opacity-60`}>
                Preview unavailable
              </span>
            )}
          </div>
        </WorkspacePanel>

        <WorkspacePanel>
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-accent/10 p-2 text-accent">
              <Users className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <SectionHeading
                title="Default internal intake"
                description="Staff-only form at /leads/new for phone, email, walk-in, and referral leads."
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <StatusBadge label="Always on" tone="approved" />
            {officeDefaultForm?.name ? (
              <span className="max-w-md truncate text-xs text-foreground-muted">
                Form: {officeDefaultForm.name}
              </span>
            ) : (
              <span className="text-xs text-foreground-muted">
                Form is created on first use of New intake
              </span>
            )}
          </div>

          {!officeFormProvisioned ? (
            <SetupNotice tone="info">
              Open{" "}
              <Link href="/leads/new" className="text-accent hover:underline">
                New intake
              </Link>{" "}
              once to provision the stored internal form, then return here to edit fields.
            </SetupNotice>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={INTAKE_STAFF_PATH} className={primaryButtonClass}>
              Edit staff fields
            </Link>
            <Link href="/leads/new" className={secondaryButtonClass}>
              Preview on New intake
            </Link>
          </div>
        </WorkspacePanel>

        <WorkspacePanel>
          <SectionHeading
            title="Specialized customer forms"
            description="Optional extra public links for campaigns, trade-specific landing pages, referral partners, or distinct service lines."
          />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <StatusBadge
              label={`${specializedFormCount} specialized form${specializedFormCount === 1 ? "" : "s"}`}
              tone={specializedFormCount > 0 ? "approved" : "neutral"}
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={INTAKE_SPECIALIZED_PATH} className={primaryButtonClass}>
              Manage specialized forms
            </Link>
            <Link href={INTAKE_SPECIALIZED_NEW_PATH} className={secondaryButtonClass}>
              Create specialized form
            </Link>
          </div>
        </WorkspacePanel>
      </div>
    </div>
  );
}
