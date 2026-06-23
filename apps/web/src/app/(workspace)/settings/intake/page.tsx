import { PageHeader } from "@/components/ui/page-header";
import { PublicRequestLinkPanel } from "@/components/leads/public-request-link-panel";
import { PublicRequestSharingGuidance } from "@/components/settings/public-request-sharing-guidance";
import { IntakeFlowMap } from "@/components/settings/intake-flow-map";
import { IntakeOverviewSetupChecklist } from "@/components/settings/intake-overview-setup-checklist";
import { PublicRequestEnabledToggle } from "@/components/settings/public-request-enabled-toggle";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { ensureDefaultPublicIntakeFormDefinition } from "@/lib/intake/ensure-default-public-intake-form";
import { countIntakeFormFields } from "@/lib/intake/count-intake-form-fields";
import { resolvePublicPageCopyDisplay } from "@/lib/intake/public-page-copy-status";
import { OFFICE_INTAKE_FORM_WHERE, PUBLIC_INTAKE_FORM_WHERE } from "@/lib/intake/intake-form-surface";
import { buildPublicIntakeUrl } from "@/lib/public-intake-url";
import { isSyntheticDefaultOfficeIntakeFormDefinitionId } from "@/lib/intake/default-office-intake-form";

export const dynamic = "force-dynamic";

export default async function IntakeSettingsHubPage() {
  const ctx = await getRequestContextOrThrow();
  const [
    publicSettings,
    organization,
    specializedFormCount,
    officeDefaultForm,
    publicIntakeForm,
  ] = await Promise.all([
    db.publicRequestSettings.findUnique({
      where: { organizationId: ctx.organizationId },
      select: {
        enabled: true,
        formTitle: true,
        introMessage: true,
        emergencyWarningText: true,
        submitButtonText: true,
      },
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
    ensureDefaultPublicIntakeFormDefinition(ctx.organizationId),
  ]);

  const publicLive = publicSettings?.enabled ?? true;
  const orgName = organization?.name ?? "your organization";
  const slug = organization?.slug ?? null;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const publicPreviewHref =
    slug && publicLive ? buildPublicIntakeUrl({ baseUrl, companySlug: slug }) : null;
  const absoluteUrl =
    slug && baseUrl ? buildPublicIntakeUrl({ baseUrl, companySlug: slug }) : null;
  const officeFormProvisioned =
    officeDefaultForm && !isSyntheticDefaultOfficeIntakeFormDefinitionId(officeDefaultForm.id);
  const pageCopy = resolvePublicPageCopyDisplay(publicSettings);
  const customerFieldCount = countIntakeFormFields(publicIntakeForm.schema);

  return (
    <>
      <PageHeader
        title="Customer intake"
        description="Share your customer link, then tune the page and questions when you're ready."
        actions={<PublicRequestEnabledToggle initialEnabled={publicLive} compact />}
      />

      <div className="space-y-5">
        <PublicRequestLinkPanel
          organizationName={orgName}
          slug={slug}
          baseUrl={baseUrl}
          publicRequestLive={publicLive}
          previewHref={publicPreviewHref}
          specializedFormCount={specializedFormCount}
        />

        <IntakeOverviewSetupChecklist
          slug={slug}
          publicLive={publicLive}
          formTitle={pageCopy.formTitle}
          hasIntro={pageCopy.hasIntro}
          hasSettingsRow={Boolean(publicSettings)}
          pageCopyCustomized={pageCopy.customized}
          customerFieldCount={customerFieldCount}
          officeFormProvisioned={Boolean(officeFormProvisioned)}
          specializedFormCount={specializedFormCount}
        />

        <IntakeFlowMap />

        <PublicRequestSharingGuidance url={absoluteUrl} />
      </div>
    </>
  );
}
