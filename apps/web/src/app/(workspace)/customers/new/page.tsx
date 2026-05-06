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
        eyebrow="Relationships"
        title="New customer"
        description="Create a durable relationship record in your development organization. Required: display name. Other fields are optional and stored only on this customer row."
        actions={
          <Link href="/customers" className={listLinkClass}>
            ← Customers list
          </Link>
        }
      />

      <WorkspacePanel className="mb-6">
        <SectionHeading
          title="Customer record"
          description="Contact methods and notes stay on this anchor until dedicated systems (tags, related parties, activity) ship later."
        />
        <CustomerRecordForm mode="create" cancelHref="/customers" />
      </WorkspacePanel>
    </div>
  );
}
