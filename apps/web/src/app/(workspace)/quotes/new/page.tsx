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
  leadId?: string | string[];
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
  const rawLead = firstString(sp.leadId);
  const rawCustomer = firstString(sp.customerId);

  let paramWarning: string | null = null;
  let validatedLeadId: string | null = null;
  let validatedCustomerId: string | null = null;
  const contextLines: { label: string; value: string }[] = [];
  let defaultTitle = "";

  const lead = rawLead
    ? await db.lead.findFirst({
        where: { id: rawLead, organizationId: ctx.organizationId },
        select: { id: true, title: true, customerId: true },
      })
    : null;
  if (rawLead && !lead) {
    paramWarning =
      "The opportunity id in the link was not found in your organization—it was ignored. You can still create a title-only draft or return to Sales.";
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

  if (lead && customer) {
    if (lead.customerId != null && lead.customerId !== customer.id) {
      paramWarning =
        "This opportunity is linked to a different customer than the one in the URL. Context was cleared—open Create quote from the record that should anchor the quote.";
    } else {
      validatedLeadId = lead.id;
      validatedCustomerId = customer.id;
      contextLines.push({ label: "Opportunity", value: lead.title });
      contextLines.push({ label: "Customer", value: customer.displayName });
      defaultTitle = customer.displayName;
    }
  } else if (lead && !rawCustomer) {
    validatedLeadId = lead.id;
    contextLines.push({ label: "Opportunity", value: lead.title });
    if (lead.customerId) {
      const linked = await db.customer.findFirst({
        where: { id: lead.customerId, organizationId: ctx.organizationId },
        select: { id: true, displayName: true },
      });
      if (linked) {
        validatedCustomerId = linked.id;
        contextLines.push({
          label: "Customer (from opportunity)",
          value: `${linked.displayName} — this quote will attach to both the opportunity and that customer because the opportunity already references them.`,
        });
        defaultTitle = linked.displayName;
      } else {
        defaultTitle = lead.title;
      }
    } else {
      defaultTitle = lead.title;
    }
  } else if (customer && !rawLead) {
    validatedCustomerId = customer.id;
    contextLines.push({ label: "Customer", value: customer.displayName });
    defaultTitle = customer.displayName;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Sales", href: "/leads" },
          { label: "New quote" },
        ]}
      />
      <PageHeader
        title="New quote"
        description="Create a draft working quote in your organization. It saves as Draft with zero totals; open the quote to add line items, optional proposal wording, and guided send flow."
        actions={
          <Link href="/leads" className={listLinkClass}>
            ← Sales pipeline
          </Link>
        }
      />

      <WorkspacePanel className="mb-6">
        <SectionHeading
          title="Draft quote"
          description="Organization scope is applied on the server from your session context. Lead and customer ids from the URL are validated here; create re-validates before insert."
        />
        <QuoteDraftForm
          cancelHref="/leads"
          defaultTitle={defaultTitle}
          validatedLeadId={validatedLeadId}
          validatedCustomerId={validatedCustomerId}
          contextLines={contextLines}
          paramWarning={paramWarning}
        />
      </WorkspacePanel>
    </div>
  );
}
