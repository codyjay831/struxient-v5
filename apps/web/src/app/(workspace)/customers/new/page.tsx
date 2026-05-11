import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import Link from "next/link";
import { CustomerRecordForm } from "../customer-record-form";

export const dynamic = "force-dynamic";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default function NewCustomerPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Relationships" },
          { label: "Customers", href: "/customers" },
          { label: "New" },
        ]}
      />
      <PageHeader
        title="New customer"
        description="Add who they are, how to reach them, and where the work happens. Only the customer name is required; everything else is optional."
        actions={
          <Link href="/customers" className={listLinkClass}>
            ← Customers list
          </Link>
        }
      />

      <WorkspacePanel className="mb-6">
        <SectionHeading
          title="Customer record"
          description="Save contact details and an optional service address. You can add or edit addresses later from the customer profile."
        />
        <CustomerRecordForm
          mode="create"
          cancelHref="/customers"
          googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ""}
        />
      </WorkspacePanel>
    </div>
  );
}
