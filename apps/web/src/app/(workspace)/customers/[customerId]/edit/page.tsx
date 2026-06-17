import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { db } from "@/lib/db";
import { getCommercialRequestContextOrNull } from "@/lib/auth-context";
import { UserRound } from "lucide-react";
import { updateCustomerAction } from "../../customer-form-actions";
import { CustomerRecordForm } from "../../customer-record-form";
import { AccessDeniedPanel } from "@/components/ui/access-denied-panel";

export const dynamic = "force-dynamic";

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  const ctx = await getCommercialRequestContextOrNull();
  if (!ctx) {
    return (
      <div className="mx-auto max-w-5xl">
        <WorkspaceBreadcrumb
          items={[
            { label: "Customers", href: "/customers" },
            { label: "Edit" },
          ]}
        />
        <PageHeader title="Edit customer" />
        <AccessDeniedPanel description="This role cannot edit customer records." />
      </div>
    );
  }
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
            { label: "Customers", href: "/customers" },
            { label: "Not found" },
          ]}
        />
        <PageHeader
          title="Customer not found"
          actions={
            <ButtonLink href="/customers" variant="muted" size="sm">
              ← Customers
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
          { label: "Customers", href: "/customers" },
          { label: customer.displayName, href: `/customers/${customer.id}` },
          { label: "Edit" },
        ]}
      />
      <PageHeader
        title={`Edit ${customer.displayName}`}
        actions={
          <>
            <ButtonLink href={`/customers/${customer.id}`} variant="muted" size="sm">
              ← Customer
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
