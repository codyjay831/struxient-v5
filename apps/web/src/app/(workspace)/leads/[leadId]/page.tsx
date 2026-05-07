import Link from "next/link";
import { QuoteCheckpointKind, QuoteStatus } from "@prisma/client";
import { LeadWorkspaceShell } from "@/components/shells/lead-workspace-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { findCustomerMatchHints } from "@/lib/lead-customer-match-hints";
import type { LeadDetailPayload } from "@/lib/lead-display";
import {
  getLeadCommercialProgress,
  type LeadProgressQuoteInput,
} from "@/lib/lead-commercial-progress";
import { db, getDevOrganizationOrThrow } from "@/lib/db";
import { workstationReturnHref } from "@/lib/workstation-return-href";
import { Inbox } from "lucide-react";
import {
  createCustomerFromLeadAction,
  linkLeadToCustomerAction,
  updateLeadStatusAction,
} from "../lead-form-actions";

export const dynamic = "force-dynamic";

/**
 * In-memory hint scan is capped for small-org / dev foundation. Customers beyond this
 * window (by displayName sort) are not compared until indexed or targeted queries exist.
 */
const CUSTOMER_HINT_FETCH_CAP = 500;

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ leadId: string }>;
  searchParams?: Promise<{ from?: string; section?: string }>;
}) {
  const emptySearchParams: { from?: string; section?: string } = {};
  const [{ leadId }, sq] = await Promise.all([
    params,
    searchParams ?? Promise.resolve(emptySearchParams),
  ]);
  const fromWorkstation = sq["from"] === "workstation";
  const returnSection = typeof sq["section"] === "string" ? sq["section"] : "investigate";
  const returnHref = fromWorkstation ? workstationReturnHref(returnSection) : undefined;
  const org = await getDevOrganizationOrThrow();
  const row = await db.lead.findFirst({
    where: {
      id: leadId,
      organizationId: org.id,
    },
    include: {
      customer: {
        select: { id: true, displayName: true, organizationId: true },
      },
    },
  });

  if (!row) {
    return (
      <div className="mx-auto max-w-5xl">
        <WorkspaceBreadcrumb
          items={[
            { label: "Sales" },
            { label: "Leads", href: "/leads" },
            { label: "Not found" },
          ]}
        />
        <PageHeader
          eyebrow="Sales"
          title="Lead"
          description="No lead exists for this id in the current development organization. Links only resolve within your tenant scope—not across organizations."
          actions={
            <Link href="/leads" className={listLinkClass}>
              ← Leads list
            </Link>
          }
        />
        <WorkspacePanel padding="compact" className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
            Requested id
          </p>
          <p className="mt-1 break-all font-mono text-sm text-foreground">{leadId}</p>
        </WorkspacePanel>
        <EmptyState
          icon={Inbox}
          title="Lead not found"
          description="This id is not a lead record in the development organization, or it belongs to another tenant. When auth exists, routing will follow your real org context."
        >
          <Link href="/leads" className={listLinkClass}>
            Back to leads
          </Link>
        </EmptyState>
      </div>
    );
  }

  const customer =
    row.customer && row.customer.organizationId === org.id
      ? { id: row.customer.id, displayName: row.customer.displayName }
      : null;

  const lead: LeadDetailPayload = {
    id: row.id,
    title: row.title,
    status: row.status,
    source: row.source,
    sourceDetail: row.sourceDetail,
    contactName: row.contactName,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    customerId: row.customerId,
    convertedAt: row.convertedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    customer,
  };

  const showLinkForm = row.customerId == null;

  let customersForLink:
    | { id: string; displayName: string }[]
    | undefined;
  let matchHints: ReturnType<typeof findCustomerMatchHints> | undefined;

  const linkedQuotes = await db.quote.findMany({
    where: {
      organizationId: org.id,
      leadId: row.id,
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      totalCents: true,
      updatedAt: true,
      _count: { select: { lineItems: true } },
      job: { select: { id: true, status: true, organizationId: true } },
    },
  });

  const progressQuoteInputs: LeadProgressQuoteInput[] = linkedQuotes.map((q) => ({
    id: q.id,
    title: q.title,
    status: q.status,
    totalCents: q.totalCents,
    lineItemCount: q._count.lineItems,
    updatedAt: q.updatedAt,
    job:
      q.job && q.job.organizationId === org.id
        ? { id: q.job.id, status: q.job.status }
        : null,
  }));

  const provisionalProgress = getLeadCommercialProgress({
    lead: {
      status: row.status,
      customerId: row.customerId,
      email: row.email,
      phone: row.phone,
    },
    quotes: progressQuoteInputs,
  });

  let revisionDriftSinceLastProof = false;
  if (
    provisionalProgress.activeQuote &&
    (provisionalProgress.state === "SENT_AWAITING_CUSTOMER" ||
      provisionalProgress.state === "APPROVED_READY_TO_ACTIVATE") &&
    provisionalProgress.activeQuote.status !== QuoteStatus.ARCHIVED
  ) {
    const latestProof = await db.quoteCheckpoint.findFirst({
      where: {
        organizationId: org.id,
        quoteId: provisionalProgress.activeQuote.id,
        kind: { in: [QuoteCheckpointKind.SEND, QuoteCheckpointKind.APPROVAL] },
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    revisionDriftSinceLastProof = Boolean(
      latestProof &&
        provisionalProgress.activeQuote.updatedAt.getTime() >
          latestProof.createdAt.getTime(),
    );
  }

  const commercialProgress = getLeadCommercialProgress({
    lead: {
      status: row.status,
      customerId: row.customerId,
      email: row.email,
      phone: row.phone,
    },
    quotes: progressQuoteInputs,
    revisionDriftSinceLastProof,
  });

  const linkedQuotesForShell = linkedQuotes.map((q) => ({
    id: q.id,
    title: q.title,
    status: q.status,
    totalCents: q.totalCents,
    updatedAt: q.updatedAt,
  }));

  if (showLinkForm) {
    const customers = await db.customer.findMany({
      where: { organizationId: org.id },
      orderBy: { displayName: "asc" },
      take: CUSTOMER_HINT_FETCH_CAP,
      select: {
        id: true,
        displayName: true,
        companyName: true,
        email: true,
        phone: true,
      },
    });
    customersForLink = customers.map((c) => ({ id: c.id, displayName: c.displayName }));
    matchHints = findCustomerMatchHints(
      customers,
      row.email,
      row.phone,
      CUSTOMER_HINT_FETCH_CAP,
    );
  }

  return (
    <LeadWorkspaceShell
      lead={lead}
      updateStatusAction={updateLeadStatusAction.bind(null, row.id)}
      linkedQuotes={linkedQuotesForShell}
      commercialProgress={commercialProgress}
      returnHref={returnHref}
      {...(showLinkForm
        ? {
            customersForLink,
            linkLeadAction: linkLeadToCustomerAction.bind(null, row.id),
            createFromLeadAction: createCustomerFromLeadAction.bind(null, row.id),
            matchHints,
          }
        : {})}
    />
  );
}
