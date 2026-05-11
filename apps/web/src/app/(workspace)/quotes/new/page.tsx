import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { QuoteDraftForm } from "../quote-draft-form";

export const dynamic = "force-dynamic";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

type SearchRecord = {
  salesIntakeId?: string | string[];
  customerId?: string | string[];
};

function firstString(value: string | string[] | undefined): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string") {
    return value[0].trim();
  }
  return "";
}

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<SearchRecord>;
}) {
  const sp = await searchParams;
  const ctx = await getRequestContextOrThrow();
  const rawSalesIntake = firstString(sp.salesIntakeId);
  const rawCustomer = firstString(sp.customerId);

  let paramWarning: string | null = null;
  let validatedSalesIntakeId: string | null = null;
  let validatedCustomerId: string | null = null;
  const contextLines: { label: string; value: string }[] = [];
  let defaultTitle = "";

  const salesIntake = rawSalesIntake
    ? await db.salesIntake.findFirst({
        where: { id: rawSalesIntake, organizationId: ctx.organizationId },
        select: { id: true, title: true, customerId: true },
      })
    : null;
  if (rawSalesIntake && !salesIntake) {
    paramWarning =
      "The sales intake id in the link was not found in your organization—it was ignored. You can still create a title-only draft or return to Sales Intakes.";
  }

  const customer = rawCustomer
    ? await db.customer.findFirst({
        where: { id: rawCustomer, organizationId: ctx.organizationId },
        select: { id: true, displayName: true },
      })
    : null;
  if (rawCustomer && !customer) {
    const extra =
      "The customer id in the link was not found in your organization—it was ignored.";
    paramWarning = paramWarning ? `${paramWarning} ${extra}` : extra;
  }

  if (salesIntake && customer) {
    if (salesIntake.customerId != null && salesIntake.customerId !== customer.id) {
      paramWarning =
        "This sales intake is linked to a different customer than the one in the URL. Sales intake and customer context were cleared—open Create quote from the sales intake or customer record that should anchor the quote.";
    } else {
      validatedSalesIntakeId = salesIntake.id;
      validatedCustomerId = customer.id;
      contextLines.push({ label: "Sales intake", value: salesIntake.title });
      contextLines.push({ label: "Customer", value: customer.displayName });
      defaultTitle = customer.displayName;
    }
  } else if (salesIntake && !rawCustomer) {
    validatedSalesIntakeId = salesIntake.id;
    contextLines.push({ label: "Sales intake", value: salesIntake.title });
    if (salesIntake.customerId) {
      const linked = await db.customer.findFirst({
        where: { id: salesIntake.customerId, organizationId: ctx.organizationId },
        select: { id: true, displayName: true },
      });
      if (linked) {
        validatedCustomerId = linked.id;
        contextLines.push({
          label: "Customer (from sales intake)",
          value: `${linked.displayName} — this quote will attach to both the sales intake and that customer because the sales intake already references them.`,
        });
        defaultTitle = linked.displayName;
      } else {
        defaultTitle = salesIntake.title;
      }
    } else {
      defaultTitle = salesIntake.title;
    }
  } else if (customer && !rawSalesIntake) {
    validatedCustomerId = customer.id;
    contextLines.push({ label: "Customer", value: customer.displayName });
    defaultTitle = customer.displayName;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Sales" },
          { label: "Quotes", href: "/sales?tab=proposals" },
          { label: "New" },
        ]}
      />
      <PageHeader
        title="New quote"
        description="Create a draft working quote in your development organization. It saves as Draft with zero totals; open the quote to add line items, optional proposal wording, live proposal preview from the saved record, and staff-only recorded send checkpoints when you want proof—not delivery or approval."
        actions={
          <Link href="/sales?tab=proposals" className={listLinkClass}>
            ← Quotes list
          </Link>
        }
      />

      <WorkspacePanel className="mb-6">
        <SectionHeading
          title="Draft quote"
          description="Organization scope is applied on the server from your session context—never from hidden fields alone. Sales intake and customer ids from the URL are validated here; create re-validates before insert."
        />
        <QuoteDraftForm
          cancelHref="/sales?tab=proposals"
          defaultTitle={defaultTitle}
          validatedSalesIntakeId={validatedSalesIntakeId}
          validatedCustomerId={validatedCustomerId}
          contextLines={contextLines}
          paramWarning={paramWarning}
        />
      </WorkspacePanel>
    </div>
  );
}
