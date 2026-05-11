import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { Inbox } from "lucide-react";
import { updateSalesIntakeAction } from "../../sales-form-actions";
import { SalesRecordForm } from "../../sales-record-form";
import { parseStoredPublicIntakeServiceLocation } from "@/lib/public-intake-service-location";
import { loadAvailableLineItemTemplates } from "@/lib/line-item-template-loader";
import { loadSalesCustomFieldDefs } from "@/lib/sales-custom-field-loader";

export const dynamic = "force-dynamic";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default async function EditSalesIntakePage({
  params,
}: {
  params: Promise<{ salesIntakeId: string }>;
}) {
  const { salesIntakeId } = await params;
  const ctx = await getRequestContextOrThrow();
  const [salesIntake, availableTemplates, customFieldDefs] = await Promise.all([
    db.salesIntake.findFirst({
      where: {
        id: salesIntakeId,
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
    loadSalesCustomFieldDefs(ctx.organizationId),
  ]);

  if (!salesIntake) {
    return (
      <div className="mx-auto max-w-5xl">
        <WorkspaceBreadcrumb
          items={[
            { label: "Sales" },
            { label: "Sales", href: "/sales" },
            { label: "Not found" },
          ]}
        />
        <PageHeader
          title="Edit sales intake"
          description="No sales intake exists for this id in the current development organization. Links only resolve within your tenant scope—not across organizations."
          actions={
            <Link href="/sales" className={listLinkClass}>
              ← Sales intakes list
            </Link>
          }
        />
        <WorkspacePanel padding="compact" className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
            Requested id
          </p>
          <p className="mt-1 break-all font-mono text-sm text-foreground">{salesIntakeId}</p>
        </WorkspacePanel>
        <EmptyState
          icon={Inbox}
          title="Sales intake not found"
          description="This id is not a sales intake record in the development organization, or it belongs to another tenant. When auth exists, routing will follow your real org context."
        >
          <Link href="/sales" className={listLinkClass}>
            Back to sales intakes
          </Link>
        </EmptyState>
      </div>
    );
  }

  const intakeSnap = parseStoredPublicIntakeServiceLocation(salesIntake.publicIntakeServiceLocation);
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
          { label: "Sales" },
          { label: "Sales", href: "/sales" },
          { label: salesIntake.title, href: `/sales/${salesIntake.id}` },
          { label: "Edit" },
        ]}
      />
      <PageHeader
        title={`Edit ${salesIntake.title}`}
        description="Update intake fields for your development organization only. Status and customer link are not editable here yet. Organization cannot be changed from this form."
        actions={
          <>
            <Link href={`/sales/${salesIntake.id}`} className={listLinkClass}>
              ← Sales intake detail
            </Link>
            <Link href="/sales" className={listLinkClass}>
              All sales intakes
            </Link>
          </>
        }
      />

      <WorkspacePanel className="mb-6">
        <SectionHeading
          title="Sales intake record"
          description="Title is required. Leave optional fields blank to clear stored values. Empty optional values normalize to null on the server."
        />
        <SalesRecordForm
          mode="edit"
          updateFormAction={updateSalesIntakeAction.bind(null, salesIntake.id)}
          cancelHref={`/sales/${salesIntake.id}`}
          googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ""}
          availableTemplates={availableTemplates}
          customFieldDefs={customFieldDefs}
          initial={{
            title: salesIntake.title,
            contactName: salesIntake.contactName,
            email: salesIntake.email,
            phone: salesIntake.phone,
            requestType: salesIntake.requestType,
            neededByBucket: salesIntake.neededByBucket,
            neededByDate: salesIntake.neededByDate,
            scopeSummary: salesIntake.scopeSummary,
            source: salesIntake.source,
            sourceDetail: salesIntake.sourceDetail,
            notes: salesIntake.notes,
            suggestedTemplateIds: salesIntake.suggestedTemplateIds,
            customFieldValues: salesIntake.customFieldValues.map((v) => ({
              fieldDefId: v.fieldDefId,
              value: v.value,
            })),
          }}
          initialVisitRequest={salesIntake.visitRequests[0] ? {
            requestedDate: salesIntake.visitRequests[0].requestedDate,
            requestedWindow: salesIntake.visitRequests[0].requestedWindow,
            notes: salesIntake.visitRequests[0].notes,
          } : undefined}
          serviceLocationDefaults={serviceLocationDefaults}
        />
      </WorkspacePanel>
    </div>
  );
}
