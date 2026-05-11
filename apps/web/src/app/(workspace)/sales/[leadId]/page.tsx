import Link from "next/link";
import { QuoteCheckpointKind, QuoteStatus } from "@prisma/client";
import { LeadWorkspaceShell } from "@/components/shells/lead-workspace-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { findCustomerMatchHints } from "@/lib/lead-customer-match-hints";
import { loadQuoteWorkSurface } from "@/lib/quote-work-surface-loader";
import {
  intakeSnapshotForCustomerFromLead,
} from "@/lib/customer-service-location-from-lead";
import type { LeadServiceAddressContext } from "@/app/(workspace)/sales/sales-workspace-actions";
import type { LeadDetailPayload } from "@/lib/lead-display";
import {
  getLeadCommercialProgress,
  type LeadProgressQuoteInput,
} from "@/lib/lead-commercial-progress";
import { db } from "@/lib/db";
import { jobsiteLineFromLeadIntake } from "@/lib/jobsite-address";
import { intakeServiceLocationReflectedOnCustomer } from "@/lib/customer-service-location-from-lead";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { workstationReturnHref } from "@/lib/workstation-return-href";
import { Inbox } from "lucide-react";
import {
  createCustomerFromLeadAction,
  linkLeadToCustomerAction,
  updateLeadStatusAction,
} from "../sales-form-actions";

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
  const ctx = await getRequestContextOrThrow();
  const row = await db.lead.findFirst({
    where: {
      id: leadId,
      organizationId: ctx.organizationId,
    },
    include: {
      customer: {
        select: { id: true, displayName: true, organizationId: true },
      },
      visitRequests: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!row) {
    return (
      <div className="mx-auto max-w-5xl">
        <WorkspaceBreadcrumb
          items={[
            { label: "Sales" },
            { label: "Sales", href: "/sales" },
            { label: "Not found" },
          ]}
        />
        <PageHeader
          eyebrow="Sales"
          title="Lead"
          description="No lead exists for this id in the current development organization. Links only resolve within your tenant scope—not across organizations."
          actions={
            <Link href="/sales" className={listLinkClass}>
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
          <Link href="/sales" className={listLinkClass}>
            Back to leads
          </Link>
        </EmptyState>
      </div>
    );
  }

  const customer =
    row.customer && row.customer.organizationId === ctx.organizationId
      ? { id: row.customer.id, displayName: row.customer.displayName }
      : null;

  const intakeServiceLocationLinkedToCustomer =
    row.customerId != null
      ? await intakeServiceLocationReflectedOnCustomer(db, {
          organizationId: ctx.organizationId,
          customerId: row.customerId,
          leadId: row.id,
          publicIntakeServiceLocation: row.publicIntakeServiceLocation,
          notes: row.notes,
        })
      : false;

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
    requestType: row.requestType,
    neededByBucket: row.neededByBucket,
    neededByDate: row.neededByDate,
    scopeSummary: row.scopeSummary,
    jobsiteAddressLine: jobsiteLineFromLeadIntake({
      publicIntakeServiceLocation: row.publicIntakeServiceLocation,
      notes: row.notes,
    }),
    intakeServiceLocationLinkedToCustomer,
    customerId: row.customerId,
    convertedAt: row.convertedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    customer,
    visitRequests: row.visitRequests.map((vr) => ({
      id: vr.id,
      requestedDate: vr.requestedDate,
      requestedWindow: vr.requestedWindow,
      confirmedDate: vr.confirmedDate,
      status: vr.status,
      notes: vr.notes,
      createdAt: vr.createdAt,
    })),
  };

  const showLinkForm = row.customerId == null;

  let customersForLink:
    | { id: string; displayName: string }[]
    | undefined;
  let matchHints: ReturnType<typeof findCustomerMatchHints> | undefined;

  const linkedQuotes = await db.quote.findMany({
    where: {
      organizationId: ctx.organizationId,
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
      q.job && q.job.organizationId === ctx.organizationId
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
        organizationId: ctx.organizationId,
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
    lineItemCount: q._count.lineItems,
  }));

  /* Pre-load active-quote QuoteWorkSurface payload so the Lead Quote tab
   * embeds <QuoteWorkSurface mode="standard" /> with the same readiness state
   * the Quote full page sees. */
  const activeQuoteId = commercialProgress.activeQuote?.id ?? null;
  const activeQuoteWorkSurface = activeQuoteId
    ? await loadQuoteWorkSurface(activeQuoteId, ctx.organizationId)
    : null;

  /* Pre-load Service address context for the Lead workspace Customer Info
   * block. Loads the linked customer's service-location rows when present,
   * otherwise carries the lead's intake snapshot for the unlinked editor. */
  const intakeSnapshot = intakeSnapshotForCustomerFromLead({
    publicIntakeServiceLocation: row.publicIntakeServiceLocation,
    notes: row.notes,
  });
  const intakeForBlock = intakeSnapshot
    ? {
        defaultDisplayAddress:
          intakeSnapshot.formattedAddress.trim() ||
          intakeSnapshot.addressLine1.trim(),
        structuredJson: JSON.stringify(intakeSnapshot),
      }
    : { defaultDisplayAddress: "", structuredJson: "" };

  let serviceAddressContext: LeadServiceAddressContext;
  if (row.customerId) {
    const customerLocations = await db.customerServiceLocation.findMany({
      where: { customerId: row.customerId, organizationId: ctx.organizationId },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        formattedAddress: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        postalCode: true,
        country: true,
        googlePlaceId: true,
        latitude: true,
        longitude: true,
        source: true,
        isPrimary: true,
        createdFromLead: { select: { id: true, title: true, source: true } },
      },
    });
    serviceAddressContext = {
      customer: {
        customerId: row.customerId,
        customerHref: `/customers/${row.customerId}`,
        serviceLocations: customerLocations.map((loc) => ({
          id: loc.id,
          formattedAddress: loc.formattedAddress,
          addressLine1: loc.addressLine1,
          addressLine2: loc.addressLine2,
          city: loc.city,
          state: loc.state,
          postalCode: loc.postalCode,
          country: loc.country,
          googlePlaceId: loc.googlePlaceId,
          latitude: loc.latitude,
          longitude: loc.longitude,
          source: loc.source,
          isPrimary: loc.isPrimary,
          createdFromLead: loc.createdFromLead
            ? {
                id: loc.createdFromLead.id,
                title: loc.createdFromLead.title,
                source: loc.createdFromLead.source,
              }
            : null,
        })),
      },
      intake: intakeForBlock,
    };
  } else {
    serviceAddressContext = { customer: null, intake: intakeForBlock };
  }

  if (showLinkForm) {
    const customers = await db.customer.findMany({
      where: { organizationId: ctx.organizationId },
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
      activeQuoteWorkSurface={activeQuoteWorkSurface}
      serviceAddressContext={serviceAddressContext}
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
