import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { LeadRecordForm } from "../lead-record-form";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { loadAvailableLineItemTemplates } from "@/lib/line-item-template-loader";
import { loadLeadCustomFieldDefs } from "@/lib/lead-custom-field-loader";

export const dynamic = "force-dynamic";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default async function NewLeadPage() {
  const ctx = await getRequestContextOrThrow();
  const [availableTemplates, customFieldDefs] = await Promise.all([
    loadAvailableLineItemTemplates(ctx.organizationId),
    loadLeadCustomFieldDefs(ctx.organizationId),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Sales", href: "/leads" },
          { label: "New intake" },
        ]}
      />
      <PageHeader
        title="New intake"
        description="Create an intake record in your organization. After save you go to the opportunity detail page, where you can link a customer and start a quote."
        actions={
          <Link href="/leads" className={listLinkClass}>
            ← Sales pipeline
          </Link>
        }
      />

      <WorkspacePanel className="mb-6">
        <SectionHeading
          title="Intake record"
          description="Source and contact fields are optional. Organization scope is applied on the server."
        />
        <LeadRecordForm
          mode="create"
          cancelHref="/leads"
          googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ""}
          availableTemplates={availableTemplates}
          customFieldDefs={customFieldDefs}
        />
      </WorkspacePanel>
    </div>
  );
}
