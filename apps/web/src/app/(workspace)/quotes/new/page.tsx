import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { db } from "@/lib/db";
import { getCommercialRequestContextOrNull } from "@/lib/auth-context";
import { QuoteDraftForm } from "../quote-draft-form";
import { AccessDeniedPanel } from "@/components/ui/access-denied-panel";

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
  const ctx = await getCommercialRequestContextOrNull();
  if (!ctx) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title="New quote"
          description="Create and send customer proposals."
          actions={
            <Link href="/leads" className={listLinkClass}>
              ← Sales pipeline
            </Link>
          }
        />
        <AccessDeniedPanel description="This role cannot create quotes." />
      </div>
    );
  }
  const rawLead = firstString(sp.leadId);
  const rawCustomer = firstString(sp.customerId);

  let paramWarning: string | null = null;
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

  if (lead && !rawCustomer) {
    // Canonical handoff lives on the lead surface.
    redirect(`/leads/${lead.id}`);
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
    paramWarning =
      "Lead-linked quote start is now routed from Lead Review. Customer context was kept so you can still create an unlinked draft from this page.";
    if (lead.customerId != null && lead.customerId !== customer.id) {
      paramWarning =
        "This opportunity is linked to a different customer than the one in the URL. Context was cleared—open Create quote from the record that should anchor the quote.";
    } else {
      validatedCustomerId = customer.id;
      contextLines.push({ label: "Customer", value: customer.displayName });
      defaultTitle = customer.displayName;
    }
  } else if (customer && !rawLead) {
    validatedCustomerId = customer.id;
    contextLines.push({ label: "Customer", value: customer.displayName });
    defaultTitle = customer.displayName;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="New quote"
        description="Create a draft quote to begin building your proposal."
        actions={
          <Link href="/leads" className={listLinkClass}>
            ← Sales pipeline
          </Link>
        }
      />

      <WorkspacePanel className="mb-6">
        <>
          <SectionHeading title="Draft quote" />
          <QuoteDraftForm
            cancelHref="/leads"
            defaultTitle={defaultTitle}
            validatedLeadId={null}
            validatedCustomerId={validatedCustomerId}
            contextLines={contextLines}
            paramWarning={paramWarning}
          />
        </>
      </WorkspacePanel>
    </div>
  );
}
