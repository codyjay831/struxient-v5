import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { Users } from "lucide-react";
import { updateLeadAction } from "../../lead-form-actions";
import { LeadRecordForm } from "../../lead-record-form";
import { parseStoredPublicIntakeServiceLocation } from "@/lib/public-lead-service-location";
import { loadAvailableLineItemTemplates } from "@/lib/line-item-template-loader";
import { loadLeadCustomFieldDefs } from "@/lib/lead-custom-field-loader";

export const dynamic = "force-dynamic";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default async function EditLeadPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = await params;
  const ctx = await getRequestContextOrThrow();
  const [lead, availableTemplates, customFieldDefs] = await Promise.all([
    db.lead.findFirst({
      where: {
        id: leadId,
        organizationId: ctx.organizationId,
      },
      include: {
        visitRequests: {
          where: { status: "PENDING" },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        customFieldValues: true,
      },
    }),
    loadAvailableLineItemTemplates(ctx.organizationId),
    loadLeadCustomFieldDefs(ctx.organizationId),
  ]);

  if (!lead) {
    return (
      <div className="mx-auto max-w-5xl">
        <WorkspaceBreadcrumb
          items={[
            { label: "Sales", href: "/leads" },
            { label: "Not found" },
          ]}
        />
        <PageHeader
          title="Edit opportunity"
          description="No record exists for this id in your organization. Links only resolve within your tenant scope—not across organizations."
          actions={
            <Link href="/leads" className={listLinkClass}>
              ← Sales pipeline
            </Link>
          }
        />
        <WorkspacePanel padding="compact" className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
            Requested id
          </p>
          <p className="mt-1 break-all font-mono text-sm text-foreground">{leadId}</p>
        </WorkspacePanel>
        <EmptyState
          icon={Users}
          title="Opportunity not found"
          description="This id is not a valid sales record in your organization, or it belongs to another tenant."
        >
          <Link href="/leads" className={listLinkClass}>
            Back to Sales pipeline
          </Link>
        </EmptyState>
      </div>
    );
  }

  const intakeSnap = parseStoredPublicIntakeServiceLocation(lead.publicIntakeServiceLocation);
  const serviceLocationDefaults =
    intakeSnap &&
    (intakeSnap.formattedAddress.trim().length > 0 || intakeSnap.addressLine1.trim().length > 0)
      ? {
          defaultDisplayAddress:
            intakeSnap.formattedAddress.trim() || intakeSnap.addressLine1.trim(),
          initialStructuredJson: JSON.stringify(intakeSnap),
        }
      : undefined;

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
          items={[
            { label: "Sales", href: "/leads" },
            { label: lead.title, href: `/leads/${lead.id}` },
            { label: "Edit" },
          ]}
      />
      <PageHeader
        title={`Edit ${lead.title}`}
        description="Update intake fields for your organization. Status and customer link are not editable here yet."
        actions={
          <>
            <Link href={`/leads/${lead.id}`} className={listLinkClass}>
              ← Opportunity detail
            </Link>
            <Link href="/leads" className={listLinkClass}>
              Sales pipeline
            </Link>
          </>
        }
      />

      <WorkspacePanel className="mb-6">
        <SectionHeading
          title="Intake record"
          description="Title is required. Leave optional fields blank to clear stored values. Empty optional values normalize to null on the server."
        />
        <LeadRecordForm
          updateFormAction={updateLeadAction.bind(null, lead.id)}
          cancelHref={`/leads/${lead.id}`}
          googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ""}
          availableTemplates={availableTemplates}
          customFieldDefs={customFieldDefs}
          initial={{
            title: lead.title,
            contactName: lead.contactName,
            companyName: lead.companyName,
            email: lead.email,
            phone: lead.phone,
            requestType: lead.requestType,
            neededByBucket: lead.neededByBucket,
            neededByDate: lead.neededByDate,
            scopeSummary: lead.scopeSummary,
            source: lead.source,
            sourceDetail: lead.sourceDetail,
            notes: lead.notes,
            /** suggestedTemplateIds now lives inside the request JSONB; safely access. */
            suggestedTemplateIds: ((lead.request as { suggestedTemplateIds?: string[] } | null)?.suggestedTemplateIds) ?? [],
            customFieldValues: lead.customFieldValues.map((v) => ({
              fieldDefId: v.fieldDefId,
              value: v.value,
            })),
          }}
          initialVisitRequest={lead.visitRequests[0] ? {
            requestedDate: lead.visitRequests[0].requestedDate,
            requestedWindow: lead.visitRequests[0].requestedWindow,
            notes: lead.visitRequests[0].notes,
          } : undefined}
          serviceLocationDefaults={serviceLocationDefaults}
        />
      </WorkspacePanel>
    </div>
  );
}
