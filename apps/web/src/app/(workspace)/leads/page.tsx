import Link from "next/link";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import {
  LeadsListClient,
  type SerializedLeadRow,
} from "@/components/leads/lead-list-client";
import { LeadListSearchForm } from "@/components/leads/lead-list-search-form";
import { LeadListFiltersClient } from "@/components/leads/lead-list-filters-client";
import { LeadScaffoldingDialog } from "@/components/leads/lead-scaffolding-dialog";
import {
  parseLeadListSearchParams,
  leadListWhere,
  leadListOrderBy,
  serializeLeadListHref,
  LEAD_LIST_DEFAULT_SORT,
  type LeadListSortParam,
} from "@/lib/lead-list-query";
import {
  readSignals,
} from "@/lib/lead/lead-projection";
import {
  formatLeadStatus,
  leadStatusBadgeTone,
  formatLeadChannel,
} from "@/lib/lead-display";
import {
  getLeadCommercialProgress,
  serializeLeadProgressAction,
} from "@/lib/lead-commercial-progress";
import { jobsiteLineFromLead } from "@/lib/jobsite-address";
import { formatQuoteStatus, quoteStatusBadgeTone } from "@/lib/quote-display";
import { workstationReturnHref } from "@/lib/workstation-return-href";
import { formatCompactAge } from "@/lib/compact-age";
import { Users, Search, Globe } from "lucide-react";

export const dynamic = "force-dynamic";

const primaryLinkClass =
  "inline-flex items-center rounded-lg border border-border bg-accent px-3 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90";

const mutedLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

const sortLinkBase =
  "inline-flex items-center rounded-md border px-2.5 py-1 text-[0.7rem] font-medium transition-colors";
const sortLinkActive = `${sortLinkBase} border-border-strong bg-foreground/[0.04] text-foreground`;
const sortLinkIdle = `${sortLinkBase} border-transparent text-foreground-muted hover:border-border hover:bg-foreground/[0.02] hover:text-foreground`;

function sortLabel(sort: LeadListSortParam): string {
  switch (sort) {
    case "title":
      return "Title A–Z";
    case "age_asc":
      return "Oldest first";
    case "created":
    default:
      return "Newest created";
  }
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const { q, sort } = parseLeadListSearchParams(sp);
  const fromWorkstation = sp["from"] === "workstation";
  const returnSection = typeof sp["section"] === "string" ? sp["section"] : "investigate";
  const ctx = await getRequestContextOrThrow();
  const now = new Date();

  const listWhere = leadListWhere(ctx.organizationId, q);
  const orderBy = leadListOrderBy(sort);

  const [leads, matchingCount, totalInOrg] = await Promise.all([
    db.lead.findMany({
      where: listWhere,
      orderBy,
      include: {
        customer: { select: { id: true, displayName: true } },
        quotes: {
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
        },
      },
    }),
    db.lead.count({ where: listWhere }),
    db.lead.count({ where: { organizationId: ctx.organizationId } }),
  ]);

  const serializedLeads: SerializedLeadRow[] = leads.map((lead) => {
    const progressQuoteInputs = lead.quotes.map((q) => ({
      id: q.id,
      title: q.title,
      status: q.status,
      totalCents: q.totalCents,
      lineItemCount: q._count.lineItems,
      updatedAt: q.updatedAt,
      job:
        q.job && q.job.organizationId === ctx.organizationId
          ? { id: q.id, status: q.job.status }
          : null,
    }));

    const progress = getLeadCommercialProgress({
      lead: {
        status: lead.status,
        customerId: lead.customerId,
        email: lead.email,
        phone: lead.phone,
      },
      quotes: progressQuoteInputs,
    });

    const signals = readSignals(lead.signals);

    return {
      id: lead.id,
      title: lead.title,
      contactName: lead.contactName,
      email: lead.email,
      phone: lead.phone,
      notes: typeof signals.notes === "string" ? signals.notes : null,
      source: lead.channel,
      sourceLabel: formatLeadChannel(lead.channel),
      statusLabel: formatLeadStatus(lead.status),
      statusTone: leadStatusBadgeTone(lead.status),
      customerId: lead.customerId,
      customerDisplayName: lead.customer?.displayName ?? null,
      customerHref: lead.customer ? `/customers/${lead.customer.id}` : null,
      createdAtLabel: lead.createdAt.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
      ageLabel: `Age ${formatCompactAge(lead.createdAt, now)}`,
      progressLabel: progress.label,
      progressDescription: progress.description,
      progressTone: progress.badgeTone,
      progressState: progress.state,
      progressPrimaryAction: serializeLeadProgressAction(progress.primaryAction, {
        leadId: lead.id,
      }),
      progressSecondaryAction: serializeLeadProgressAction(progress.secondaryAction, {
        leadId: lead.id,
      }),
      activeJobId: progress.activeJob?.id ?? null,
      activeJobStatus: progress.activeJob?.status ?? null,
      quotes: lead.quotes
        .filter((q) => q.status !== "ARCHIVED")
        .map((q) => ({
          id: q.id,
          title: q.title,
          statusLabel: formatQuoteStatus(q.status),
          statusTone: quoteStatusBadgeTone(q.status),
          totalCents: q.totalCents,
          lineItemCount: q._count.lineItems,
          href: `/quotes/${q.id}`,
        })),
      leadHref: `/leads/${lead.id}`,
      newQuoteHref: `/quotes/new?leadId=${encodeURIComponent(lead.id)}`,
      jobsiteAddressLine: jobsiteLineFromLead(lead),
    };
  });

  const hasActiveListFilters = q.length > 0 || sort !== LEAD_LIST_DEFAULT_SORT;

  const sortOptions: LeadListSortParam[] = ["created", "title", "age_asc"];

  const sortNavItems = sortOptions.map((s) => ({
    key: s,
    href: serializeLeadListHref({ q, sort: s }),
    label: sortLabel(s),
    active: sort === s,
  }));

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb items={[{ label: "Leads" }]} />
      <PageHeader
        title="Leads"
        description="Capture and move new sales opportunities toward quotes. Open a lead to review intake details, verify the customer, and track its progress."
        actions={
          <>
            {fromWorkstation ? (
              <Link
                href={workstationReturnHref(returnSection)}
                className={mutedLinkClass}
              >
                ← Workstation
              </Link>
            ) : null}
            <Link href="/leads/inbox" className={mutedLinkClass}>
              ← Inbox
            </Link>
            <Link href="/leads/public-request-settings" className={mutedLinkClass}>
              <Globe className="size-3.5 mr-1.5" />
              Public Link
            </Link>
            <Link href="/leads/new" className={primaryLinkClass}>
              New lead
            </Link>
            <LeadScaffoldingDialog />
          </>
        }
      />

      <div className="mb-10">
        <div className="mb-4 space-y-3 border-y border-border py-3">
          <LeadListSearchForm
            q={q}
            sort={sort}
            matchingCount={matchingCount}
            totalInOrg={totalInOrg}
            hasActiveListFilters={hasActiveListFilters}
            controlClass="w-full min-w-[12rem] rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            primaryLinkClass={primaryLinkClass}
            mutedLinkClass={mutedLinkClass}
          />

          <LeadListFiltersClient
            sortItems={sortNavItems}
            sortActiveClass={sortLinkActive}
            sortIdleClass={sortLinkIdle}
          />
        </div>

        <WorkspacePanel padding="none" className="mb-6 overflow-hidden">
          {totalInOrg === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Users}
                title="No leads yet"
                description="There are no lead records for this organization. Add one manually or share your Public Request Link."
              >
                <Link href="/leads/new" className={primaryLinkClass}>
                  New lead
                </Link>
              </EmptyState>
            </div>
          ) : matchingCount === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Search}
                title="No leads match this view"
                description="Try a different search term or change sort. Leads still exist in your organization—they are just filtered out here."
              >
                <Link href="/leads" scroll={false} className={primaryLinkClass}>
                  Clear filters
                </Link>
                <Link href="/leads/new" className={mutedLinkClass}>
                  New lead
                </Link>
              </EmptyState>
            </div>
          ) : (
            <LeadsListClient leads={serializedLeads} orgHasLeads={totalInOrg > 0} />
          )}
        </WorkspacePanel>
      </div>
    </div>
  );
}
