import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { loadAvailableLineItemTemplates } from "@/lib/line-item-template-loader";
import { getOfficeIntakeFormBundle } from "@/lib/intake/load-office-intake-form";
import { StaffIntakeClient } from "./staff-intake-client";

export const dynamic = "force-dynamic";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default async function NewLeadPage() {
  const ctx = await getRequestContextOrThrow();
  const [availableTemplates, officeBundle, organization] = await Promise.all([
    loadAvailableLineItemTemplates(ctx.organizationId),
    getOfficeIntakeFormBundle(ctx.organizationId),
    db.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { name: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Add lead"
        description="After saving, open the lead to link a customer and start a quote."
        actions={
          <Link href="/leads" className={listLinkClass}>
            ← Sales
          </Link>
        }
      />

      <WorkspacePanel className="mb-6">
        <SectionHeading
          title="Request details"
          description="Office request entry uses its own form definition. Changes to public customer forms do not affect this page."
        />
        <StaffIntakeClient
          formDefinition={officeBundle.formDefinition}
          organizationDisplayName={organization?.name ?? "your organization"}
          googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ""}
          requestTypeOptions={officeBundle.requestTypeOptions}
          availableTemplates={availableTemplates}
        />
      </WorkspacePanel>
    </div>
  );
}
