import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { db, getDevOrganizationOrThrow } from "@/lib/db";
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
  const org = await getDevOrganizationOrThrow();
  const rawLead = firstString(sp.leadId);
  const rawCustomer = firstString(sp.customerId);

  let paramWarning: string | null = null;
  let validatedLeadId: string | null = null;
  let validatedCustomerId: string | null = null;
  const contextLines: { label: string; value: string }[] = [];
  let defaultTitle = "";

  const lead = rawLead
    ? await db.lead.findFirst({
        where: { id: rawLead, organizationId: org.id },
        select: { id: true, title: true, customerId: true },
      })
    : null;
  if (rawLead && !lead) {
    paramWarning =
      "The lead id in the link was not found in your organization—it was ignored. You can still create a title-only draft or return to Leads.";
  }

  const customer = rawCustomer
    ? await db.customer.findFirst({
        where: { id: rawCustomer, organizationId: org.id },
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
        "This lead is linked to a different customer than the one in the URL. Lead and customer context were cleared—open Create quote from the lead or customer record that should anchor the quote.";
    } else {
      validatedLeadId = lead.id;
      validatedCustomerId = customer.id;
      contextLines.push({ label: "Lead", value: lead.title });
      contextLines.push({ label: "Customer", value: customer.displayName });
      defaultTitle = `Quote — ${customer.displayName}`;
    }
  } else if (lead && !rawCustomer) {
    validatedLeadId = lead.id;
    contextLines.push({ label: "Lead", value: lead.title });
    if (lead.customerId) {
      const linked = await db.customer.findFirst({
        where: { id: lead.customerId, organizationId: org.id },
        select: { id: true, displayName: true },
      });
      if (linked) {
        validatedCustomerId = linked.id;
        contextLines.push({
          label: "Customer (from lead)",
          value: `${linked.displayName} — this quote will attach to both the lead and that customer because the lead already references them.`,
        });
        defaultTitle = `Quote — ${linked.displayName}`;
      } else {
        defaultTitle = `Quote — ${lead.title}`;
      }
    } else {
      defaultTitle = `Quote — ${lead.title}`;
    }
  } else if (customer && !rawLead) {
    validatedCustomerId = customer.id;
    contextLines.push({ label: "Customer", value: customer.displayName });
    defaultTitle = `Quote — ${customer.displayName}`;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Sales" },
          { label: "Quotes", href: "/quotes" },
          { label: "New" },
        ]}
      />
      <PageHeader
        title="New quote"
        description="Create a draft working quote in your development organization. It saves as Draft with zero totals; open the quote to add line items, optional proposal wording, live proposal preview from the saved record, and staff-only recorded send checkpoints when you want proof—not delivery or approval."
        actions={
          <Link href="/quotes" className={listLinkClass}>
            ← Quotes list
          </Link>
        }
      />

      <WorkspacePanel className="mb-6">
        <SectionHeading
          title="Draft quote"
          description="Organization scope is applied on the server from your session context—never from hidden fields alone. Lead and customer ids from the URL are validated here; create re-validates before insert."
        />
        <QuoteDraftForm
          cancelHref="/quotes"
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
