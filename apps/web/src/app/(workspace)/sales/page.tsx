import Link from "next/link";
import { QuoteStatus } from "@prisma/client";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { PlaceholderButton } from "@/components/ui/placeholder-button";
import { SignalCard } from "@/components/ui/signal-card";
import { LeadsScaffoldingDialog } from "@/components/sales/sales-scaffolding-dialog";
import {
  LeadSourcesProvider,
  LeadSourcesToolbarButton,
} from "@/components/sales/sales-sources-provider";
import { PublicRequestLinkPanel } from "@/components/sales/public-request-link-panel";
import {
  LeadsListClient,
  type SerializedLeadRow,
} from "@/components/sales/sales-list-client";
import {
  QuotesListClient,
  type SerializedQuoteListRow,
} from "@/components/quotes/quotes-list-client";
import { QuoteListFiltersClient } from "@/components/quotes/quote-list-filters-client";
import { QuoteListSearchForm } from "@/components/quotes/quote-list-search-form";
import { resolvePublicSiteBaseUrl } from "@/lib/public-site-base-url";
import {
  formatLeadSource,
  formatLeadStatus,
  leadStatusBadgeTone,
} from "@/lib/lead-display";
import {
  getLeadCommercialProgress,
  resolveLeadCommercialProgressActionHref,
  type LeadCommercialProgressAction,
} from "@/lib/lead-commercial-progress";
import {
  formatMoneyCents,
  formatQuoteStatus,
  quoteStatusBadgeTone,
} from "@/lib/quote-display";
import {
  parseQuoteListSearchParams,
  quoteListOrderBy,
  quoteListWhere,
  serializeQuotesListHref,
  QUOTE_LIST_DEFAULT_SORT,
  type QuoteListSortParam,
  type QuoteListStatusParam,
} from "@/lib/quote-list-query";
import { getQuoteReadiness } from "@/lib/quote-readiness";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { workstationReturnHref } from "@/lib/workstation-return-href";
import { formatCompactAge } from "@/lib/compact-age";
import { jobsiteLineFromLeadIntake } from "@/lib/jobsite-address";
import { Inbox, FileText, Search } from "lucide-react";

export const dynamic = "force-dynamic";

const primaryLinkClass =
  "inline-flex items-center rounded-lg border border-border bg-accent px-3 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90";

const mutedLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

const pillBase =
  "inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors";
const pillActive = `${pillBase} border-border-strong bg-foreground/[0.04] text-foreground`;
const pillIdle = `${pillBase} border-border text-foreground-muted hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground`;

const sortLinkBase =
  "inline-flex items-center rounded-md border px-2.5 py-1 text-[0.7rem] font-medium transition-colors";
const sortLinkActive = `${sortLinkBase} border-border-strong bg-foreground/[0.04] text-foreground`;
const sortLinkIdle = `${sortLinkBase} border-transparent text-foreground-muted hover:border-border hover:bg-foreground/[0.02] hover:text-foreground`;

const STATUS_FILTER_PILLS: { param: Exclude<QuoteListStatusParam, "active">; label: string }[] = [
  { param: "all", label: "All" },
  { param: "draft", label: "Draft" },
  { param: "sent", label: "Sent" },
  { param: "approved", label: "Approved" },
  { param: "archived", label: "Archived" },
];

const controlClass =
  "w-full min-w-[12rem] rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function sortLabel(sort: QuoteListSortParam): string {
  switch (sort) {
    case "created":
      return "Newest created";
    case "title":
      return "Title A–Z";
    case "total_desc":
      return "Highest total";
    case "total_asc":
      return "Lowest total";
    case "updated":
    default:
      return "Recently updated";
  }
}

const quoteListTimestampOpts: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

export default async function SalesHubPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" ? sp.tab : "intake";
  const fromWorkstation = sp["from"] === "workstation";
  const returnSection = typeof sp["section"] === "string" ? sp["section"] : "investigate";
  const ctx = await getRequestContextOrThrow();
  const now = new Date();

  if (tab === "proposals") {
    const { q, status, sort } = parseQuoteListSearchParams(sp);
    const listWhere = quoteListWhere(ctx.organizationId, status, q);
    const orderBy = quoteListOrderBy(sort);

    const [
      rows,
      matchingCount,
      totalInOrg,
      draftCount,
      sentCount,
      approvedCount,
      archivedCount,
      draftTotalsAgg,
    ] = await Promise.all([
      db.quote.findMany({
        where: listWhere,
        orderBy,
        include: {
          customer: { select: { id: true, displayName: true, companyName: true } },
          lead: { select: { id: true, title: true, contactName: true, createdAt: true } },
          job: { select: { id: true, status: true, organizationId: true } },
          _count: { select: { lineItems: true } },
        },
      }),
      db.quote.count({ where: listWhere }),
      db.quote.count({ where: { organizationId: ctx.organizationId } }),
      db.quote.count({ where: { organizationId: ctx.organizationId, status: QuoteStatus.DRAFT } }),
      db.quote.count({ where: { organizationId: ctx.organizationId, status: QuoteStatus.SENT } }),
      db.quote.count({ where: { organizationId: ctx.organizationId, status: QuoteStatus.APPROVED } }),
      db.quote.count({ where: { organizationId: ctx.organizationId, status: QuoteStatus.ARCHIVED } }),
      db.quote.aggregate({
        where: { organizationId: ctx.organizationId, status: QuoteStatus.DRAFT },
        _sum: { totalCents: true },
      }),
    ]);

    const draftValueCents = draftTotalsAgg._sum.totalCents ?? 0;

    const serializedQuotes: SerializedQuoteListRow[] = rows.map((r) => {
      const readiness = getQuoteReadiness({
        quote: {
          status: r.status,
          lineItemCount: r._count.lineItems,
          subtotalCents: r.subtotalCents,
          totalCents: r.totalCents,
        },
        job:
          r.job && r.job.organizationId === ctx.organizationId
            ? { id: r.job.id, status: r.job.status }
            : null,
        activationReadiness: null,
        revisionDriftSinceLastProof: false,
      });

      const primaryIdentity = r.lead?.title || r.customer?.displayName || r.title;
      const secondaryIdentity = r.title !== primaryIdentity ? r.title : null;

      const contextBits: string[] = [];
      if (r.customer) {
        const c = r.customer.displayName;
        const co = r.customer.companyName?.trim();
        contextBits.push(co ? `${c} · ${co}` : c);
      }
      if (r.lead) {
        const leadBits = [`Lead: ${r.lead.title}`];
        const cn = r.lead.contactName?.trim();
        if (cn) leadBits.push(cn);
        contextBits.push(leadBits.join(" · "));
      }
      const contextLine =
        contextBits.length > 0 ? contextBits.join(" · ") : "No customer or lead linked";

      const quoteAge = formatCompactAge(r.createdAt, now);
      const ageLine = r.lead
        ? `Lead ${formatCompactAge(r.lead.createdAt, now)} · Quote ${quoteAge}`
        : `Quote ${quoteAge}`;

      return {
        id: r.id,
        primaryIdentity,
        secondaryIdentity,
        contextLine,
        ageLine,
        totalCents: r.totalCents,
        totalLabel: formatMoneyCents(r.totalCents),
        status: r.status,
        statusLabel: formatQuoteStatus(r.status),
        statusTone: quoteStatusBadgeTone(r.status),
        readinessLabel: readiness.label,
        readinessTone: readiness.badgeTone,
        createdLabel: new Date(r.createdAt).toLocaleString("en-US", quoteListTimestampOpts),
        updatedLabel: new Date(r.updatedAt).toLocaleString("en-US", quoteListTimestampOpts),
        href: `/quotes/${r.id}`,
      };
    });

    const hasActiveListFilters = q.length > 0 || status !== "all" || sort !== QUOTE_LIST_DEFAULT_SORT;

    const sortOptions: QuoteListSortParam[] = ["updated", "created", "title", "total_desc", "total_asc"];

    const statusNavItems = STATUS_FILTER_PILLS.map(({ param: s, label }) => ({
      key: s,
      href: serializeQuotesListHref({ q, status: s, sort }).replace("/quotes", "/sales?tab=proposals"),
      label,
      active: status === s,
    }));
    const sortNavItems = sortOptions.map((s) => ({
      key: s,
      href: serializeQuotesListHref({ q, status, sort: s }).replace("/quotes", "/sales?tab=proposals"),
      label: sortLabel(s),
      active: sort === s,
    }));

    return (
      <div className="mx-auto max-w-5xl">
        <WorkspaceBreadcrumb items={[{ label: "Sales" }, { label: "Proposals" }]} />
        <PageHeader
          title="Sales Hub"
          description="Manage your intake queue and active proposals in one place."
          actions={
            <>
              {fromWorkstation ? (
                <Link href={workstationReturnHref(returnSection)} className={mutedLinkClass}>
                  ← Workstation
                </Link>
              ) : null}
              <Link href="/sales?tab=intake" className={mutedLinkClass}>
                Intake
              </Link>
              <Link href="/sales?tab=proposals&new=true" className={primaryLinkClass}>
                New proposal
              </Link>
            </>
          }
        />

        <div className="mb-8 border-b border-border">
          <nav className="-mb-px flex gap-6">
            <Link
              href="/sales?tab=intake"
              className={`pb-4 text-sm font-medium transition-colors ${
                sp.tab !== "proposals"
                  ? "border-b-2 border-accent text-foreground"
                  : "text-foreground-muted hover:text-foreground"
              }`}
            >
              Intake (Leads)
            </Link>
            <Link
              href="/sales?tab=proposals"
              className={`pb-4 text-sm font-medium transition-colors ${
                sp.tab === "proposals"
                  ? "border-b-2 border-accent text-foreground"
                  : "text-foreground-muted hover:text-foreground"
              }`}
            >
              Proposals (Quotes)
            </Link>
          </nav>
        </div>

        <section className="mb-6">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <li>
              <SignalCard label="Quotes (all)" value={String(totalInOrg)} hint="Rows in this org." />
            </li>
            <li>
              <SignalCard label="Draft" value={String(draftCount)} hint="Commercial editing." />
            </li>
            <li>
              <SignalCard label="Sent" value={String(sentCount)} hint="Awaiting signature." />
            </li>
            <li>
              <SignalCard label="Approved" value={String(approvedCount)} hint="Ready for Job." />
            </li>
            <li>
              <SignalCard label="Archived" value={String(archivedCount)} hint="Read-only." />
            </li>
            <li>
              <SignalCard
                label="Draft total"
                value={formatMoneyCents(draftValueCents)}
                hint="Sum of draft totals."
              />
            </li>
          </ul>
        </section>

        <div className="mb-10">
          <div className="mb-4 space-y-3 border-y border-border py-3">
            <QuoteListSearchForm
              q={q}
              status={status}
              sort={sort}
              matchingCount={matchingCount}
              totalInOrg={totalInOrg}
              hasActiveListFilters={hasActiveListFilters}
              controlClass={controlClass}
              primaryLinkClass={primaryLinkClass}
              mutedLinkClass={mutedLinkClass}
            />

            <QuoteListFiltersClient
              statusItems={statusNavItems}
              sortItems={sortNavItems}
              pillActiveClass={pillActive}
              pillIdleClass={pillIdle}
              sortActiveClass={sortLinkActive}
              sortIdleClass={sortLinkIdle}
            />
          </div>
          {totalInOrg === 0 ? (
            <EmptyState
              icon={FileText}
              title="No proposals yet"
              description="Create a draft from New proposal to get started."
            >
              <Link href="/sales?tab=proposals&new=true" className={primaryLinkClass}>
                New proposal
              </Link>
            </EmptyState>
          ) : matchingCount === 0 ? (
            <EmptyState
              icon={Search}
              title="No proposals match this view"
              description="Try a different search term or filter."
            >
              <Link href="/sales?tab=proposals" scroll={false} className={primaryLinkClass}>
                Clear filters
              </Link>
            </EmptyState>
          ) : (
            <QuotesListClient quotes={serializedQuotes} />
          )}
        </div>
      </div>
    );
  }

  // Default: Intake (Leads) tab
  const publicSiteBaseUrl = await resolvePublicSiteBaseUrl();
  const publicRequestGate = await db.publicRequestSettings.findUnique({
    where: { organizationId: ctx.organizationId },
    select: { enabled: true },
  });
  const publicRequestLive = publicRequestGate ? publicRequestGate.enabled : true;

  const leads = await db.lead.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { createdAt: "desc" },
    include: {
      customer: { select: { id: true, displayName: true } },
      quotes: {
        where: { status: { not: QuoteStatus.ARCHIVED } },
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
  });

  const intakeLeads = leads.filter((l) => l.quotes.length === 0);

  function serializeProgressAction(
    action: LeadCommercialProgressAction,
    leadId: string,
  ): SerializedLeadRow["progressPrimaryAction"] {
    const href = resolveLeadCommercialProgressActionHref(action, { leadId });
    const opensQuoteTab =
      action.kind === "OPEN_DRAFT_QUOTE" || action.kind === "OPEN_QUOTE" || action.kind === "START_QUOTE";
    const opensContactTab = action.kind === "ATTACH_OR_CREATE_CUSTOMER" || action.kind === "EDIT_CONTACT_INFO";
    return { href, label: action.label, opensQuoteTab, opensContactTab };
  }

  const serializedLeads: SerializedLeadRow[] = intakeLeads.map((lead) => {
    const progressQuoteInputs = lead.quotes.map((q) => ({
      id: q.id,
      title: q.title,
      status: q.status,
      totalCents: q.totalCents,
      lineItemCount: q._count.lineItems,
      updatedAt: q.updatedAt,
      job: q.job && q.job.organizationId === ctx.organizationId ? { id: q.job.id, status: q.job.status } : null,
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

    const customer = lead.customer;

    return {
      id: lead.id,
      title: lead.title,
      contactName: lead.contactName,
      email: lead.email,
      phone: lead.phone,
      notes: lead.notes,
      source: lead.source,
      sourceLabel: formatLeadSource(lead.source),
      statusLabel: formatLeadStatus(lead.status),
      statusTone: leadStatusBadgeTone(lead.status),
      customerId: lead.customerId,
      customerDisplayName: customer?.displayName ?? null,
      customerHref: customer ? `/customers/${customer.id}` : null,
      createdAtLabel: lead.createdAt.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
      ageLabel: `Age ${formatCompactAge(lead.createdAt, now)}`,
      progressLabel: progress.label,
      progressDescription: progress.description,
      progressTone: progress.badgeTone,
      progressPrimaryAction: progress.primaryAction ? serializeProgressAction(progress.primaryAction, lead.id) : null,
      progressSecondaryAction: progress.secondaryAction
        ? serializeProgressAction(progress.secondaryAction, lead.id)
        : null,
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
      progressState: progress.state,
      activeJobId: progress.activeJob?.id ?? null,
      activeJobStatus: progress.activeJob?.status ?? null,
      leadHref: `/sales/${lead.id}`,
      newQuoteHref: `/sales?tab=proposals&new=true?leadId=${encodeURIComponent(lead.id)}`,
      jobsiteAddressLine: jobsiteLineFromLeadIntake({
        publicIntakeServiceLocation: lead.publicIntakeServiceLocation,
        notes: lead.notes,
      }),
      valueLabel: lead.quotes.length > 0 ? formatMoneyCents(lead.quotes[0].totalCents) : null,
    };
  });

  const sourcesPanel = (
    <>
      <PublicRequestLinkPanel
        organizationName={ctx.organizationName}
        slug={ctx.organizationSlug || null}
        baseUrl={publicSiteBaseUrl}
        publicRequestLive={publicRequestLive}
      />
      <WorkspacePanel padding="compact">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">More lead sources (soon)</p>
        <p className="mt-2 text-sm text-foreground-muted">
          Your Public Request Link sends leads here automatically. Email, phone, text, and file imports will land in
          this queue as integrations roll out. You can always add leads by hand from the New lead action.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <PlaceholderButton title="CSV import is not connected in this build.">CSV import (soon)</PlaceholderButton>
        </div>
      </WorkspacePanel>
    </>
  );

  return (
    <LeadSourcesProvider sourcesPanel={sourcesPanel}>
      <div className="mx-auto max-w-5xl">
        <WorkspaceBreadcrumb items={[{ label: "Sales" }, { label: "Intake" }]} />
        <PageHeader
          title="Sales Hub"
          description="Manage your intake queue and active proposals in one place."
          actions={
            <>
              {fromWorkstation ? (
                <Link href={workstationReturnHref(returnSection)} className={mutedLinkClass}>
                  ← Workstation
                </Link>
              ) : null}
              <Link href="/sales?tab=proposals" className={mutedLinkClass}>
                Proposals
              </Link>
              <Link href="/sales/new" className={primaryLinkClass}>
                New lead
              </Link>
              <LeadSourcesToolbarButton />
              <LeadsScaffoldingDialog />
            </>
          }
        />

        <div className="mb-8 border-b border-border">
          <nav className="-mb-px flex gap-6">
            <Link
              href="/sales?tab=intake"
              className={`pb-4 text-sm font-medium transition-colors ${
                tab === "intake"
                  ? "border-b-2 border-accent text-foreground"
                  : "text-foreground-muted hover:text-foreground"
              }`}
            >
              Intake (Leads)
            </Link>
            <Link
              href="/sales?tab=proposals"
              className={`pb-4 text-sm font-medium transition-colors ${
                tab === "proposals"
                  ? "border-b-2 border-accent text-foreground"
                  : "text-foreground-muted hover:text-foreground"
              }`}
            >
              Proposals (Quotes)
            </Link>
          </nav>
        </div>

        <WorkspacePanel padding="none" className="mb-6 overflow-hidden">
          {intakeLeads.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Inbox}
                title="Queue is empty"
                description={leads.length > 0 ? "All active leads have progressed to proposals." : "No leads yet. Add one when a call, walk-in, or message comes in."}
              >
                <div className="flex flex-col items-center gap-4">
                  {leads.length > 0 && (
                    <Link href="/sales?tab=proposals" className={mutedLinkClass}>
                      View Proposals
                    </Link>
                  )}
                  <Link href="/sales/new" className={primaryLinkClass}>
                    New lead
                  </Link>
                </div>
              </EmptyState>
            </div>
          ) : (
            <LeadsListClient leads={serializedLeads} />
          )}
        </WorkspacePanel>
      </div>
    </LeadSourcesProvider>
  );
}
