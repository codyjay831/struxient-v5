import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { UserRound } from "lucide-react";
import { updateCustomerAction } from "../../customer-form-actions";
import { CustomerRecordForm } from "../../customer-record-form";

export const dynamic = "force-dynamic";

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  const ctx = await getRequestContextOrThrow();
  const customer = await db.customer.findFirst({
    where: {
      id: customerId,
      organizationId: ctx.organizationId,
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
          description="This customer record could not be found."
          actions={
            <ButtonLink href="/customers" variant="muted" size="sm">
              ← Customers list
            </ButtonLink>
          }
        />
        <EmptyState
          icon={UserRound}
          title="Customer not found"
          description="The customer may have been removed, or you may not have access to it."
        >
          <ButtonLink href="/customers" variant="muted" size="sm">
            Back to customers
          </ButtonLink>
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
        description="Update this customer's profile and contact details."
        actions={
          <>
            <ButtonLink href={`/customers/${customer.id}`} variant="muted" size="sm">
              ← Customer detail
            </ButtonLink>
            <ButtonLink href="/customers" variant="muted" size="sm">
              All customers
            </ButtonLink>
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
