import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { QuoteWorkspaceShell } from "@/components/shells/quote-workspace-shell";
import { db, getDevOrganizationOrThrow } from "@/lib/db";
import type { QuoteDetailPayload, QuoteLineItemPayload } from "@/lib/quote-display";
import { FileText } from "lucide-react";

export const dynamic = "force-dynamic";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ quoteId: string }>;
}) {
  const { quoteId } = await params;
  const org = await getDevOrganizationOrThrow();
  const row = await db.quote.findFirst({
    where: {
      id: quoteId,
      organizationId: org.id,
    },
    include: {
      customer: {
        select: { id: true, displayName: true, organizationId: true },
      },
      lead: {
        select: { id: true, title: true, organizationId: true },
      },
      lineItems: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!row) {
    return (
      <div className="mx-auto max-w-5xl">
        <WorkspaceBreadcrumb
          items={[
            { label: "Sales" },
            { label: "Quotes", href: "/quotes" },
            { label: "Not found" },
          ]}
        />
        <PageHeader
          eyebrow="Sales"
          title="Quote"
          description="No quote exists for this id in the current development organization. Links only resolve within your tenant scope—not across organizations."
          actions={
            <Link href="/quotes" className={listLinkClass}>
              ← Quotes list
            </Link>
          }
        />
        <WorkspacePanel padding="compact" className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
            Requested id
          </p>
          <p className="mt-1 break-all font-mono text-sm text-foreground">{quoteId}</p>
        </WorkspacePanel>
        <EmptyState
          icon={FileText}
          title="Quote not found"
          description="This id is not a quote record in the development organization, or it belongs to another tenant. When auth exists, routing will follow your real org context."
        >
          <Link href="/quotes" className={listLinkClass}>
            Back to quotes
          </Link>
        </EmptyState>
      </div>
    );
  }

  const customer =
    row.customer && row.customer.organizationId === org.id
      ? { id: row.customer.id, displayName: row.customer.displayName }
      : null;
  const lead =
    row.lead && row.lead.organizationId === org.id
      ? { id: row.lead.id, title: row.lead.title }
      : null;

  const lineItems: QuoteLineItemPayload[] = row.lineItems.map((line) => ({
    id: line.id,
    sortOrder: line.sortOrder,
    description: line.description,
    quantityDisplay: line.quantity.toString(),
    unitAmountCents: line.unitAmountCents,
    lineTotalCents: line.lineTotalCents,
    internalNotes: line.internalNotes,
  }));

  const quote: QuoteDetailPayload = {
    id: row.id,
    title: row.title,
    status: row.status,
    internalNotes: row.internalNotes,
    subtotalCents: row.subtotalCents,
    totalCents: row.totalCents,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    customerId: row.customerId,
    leadId: row.leadId,
    customer,
    lead,
    lineItems,
  };

  return <QuoteWorkspaceShell mode="detail" quote={quote} />;
}
