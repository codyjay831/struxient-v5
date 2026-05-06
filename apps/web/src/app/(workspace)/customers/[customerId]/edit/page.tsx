import Link from "next/link";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { db, getDevOrganizationOrThrow } from "@/lib/db";
import { UserRound } from "lucide-react";
import { updateCustomerAction } from "../../customer-form-actions";
import { CustomerRecordForm } from "../../customer-record-form";

export const dynamic = "force-dynamic";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  const org = await getDevOrganizationOrThrow();
  const customer = await db.customer.findFirst({
    where: {
      id: customerId,
      organizationId: org.id,
    },
  });

  if (!customer) {
    return (
      <div className="mx-auto max-w-5xl">
        <WorkspaceBreadcrumb
          items={[
            { label: "Relationships" },
            { label: "Customers", href: "/customers" },
            { label: "Not found" },
          ]}
        />
        <PageHeader
          eyebrow="Relationships"
          title="Edit customer"
          description="No customer exists for this id in the current development organization. Links only resolve within your tenant scope—not across organizations."
          actions={
            <Link href="/customers" className={listLinkClass}>
              ← Customers list
            </Link>
          }
        />
        <WorkspacePanel padding="compact" className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
            Requested id
          </p>
          <p className="mt-1 break-all font-mono text-sm text-foreground">{customerId}</p>
        </WorkspacePanel>
        <EmptyState
          icon={UserRound}
          title="Customer not found"
          description="This id is not a customer record in the development organization, or it belongs to another tenant. When auth exists, routing will follow your real org context."
        >
          <Link href="/customers" className={listLinkClass}>
            Back to customers
          </Link>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Relationships" },
          { label: "Customers", href: "/customers" },
          { label: customer.displayName, href: `/customers/${customer.id}` },
          { label: "Edit" },
        ]}
      />
      <PageHeader
        eyebrow="Relationships"
        title={`Edit ${customer.displayName}`}
        description="Update fields stored on this customer for your development organization only. Organization cannot be changed from this form."
        actions={
          <>
            <Link href={`/customers/${customer.id}`} className={listLinkClass}>
              ← Customer detail
            </Link>
            <Link href="/customers" className={listLinkClass}>
              All customers
            </Link>
          </>
        }
      />

      <WorkspacePanel className="mb-6">
        <SectionHeading
          title="Customer record"
          description="Display name is required. Leave optional fields blank to clear stored values."
        />
        <CustomerRecordForm
          mode="edit"
          updateFormAction={updateCustomerAction.bind(null, customer.id)}
          cancelHref={`/customers/${customer.id}`}
          initial={{
            displayName: customer.displayName,
            companyName: customer.companyName,
            email: customer.email,
            phone: customer.phone,
            notes: customer.notes,
          }}
        />
      </WorkspacePanel>
    </div>
  );
}
