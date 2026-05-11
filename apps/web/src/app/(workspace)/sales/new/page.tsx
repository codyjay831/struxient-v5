import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SalesRecordForm } from "../sales-record-form";
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
          { label: "Sales" },
          { label: "Sales", href: "/sales" },
          { label: "New" },
        ]}
      />
      <PageHeader
        title="New lead"
        description="Create an intake record in your development organization. Required: title. Status defaults to Open. After save you go to the lead detail page, where you can link an existing customer or create one from the lead, then start a draft quote from that lead when you are ready."
        actions={
          <Link href="/sales" className={listLinkClass}>
            ← Sales list
          </Link>
        }
      />

      <WorkspacePanel className="mb-6">
        <SectionHeading
          title="Lead record"
          description="Source and contact fields are optional; empty optional values are normalized to null on the server. Organization scope is applied on the server—never from the form."
        />
        <SalesRecordForm
          mode="create"
          cancelHref="/sales"
          googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ""}
          availableTemplates={availableTemplates}
          customFieldDefs={customFieldDefs}
        />
      </WorkspacePanel>
    </div>
  );
}
