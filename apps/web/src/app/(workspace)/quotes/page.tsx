import Link from "next/link";
import { QuoteStatus } from "@prisma/client";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { PlaceholderButton } from "@/components/ui/placeholder-button";
import { SignalCard } from "@/components/ui/signal-card";
import {
  QuotesListClient,
  type SerializedQuoteListRow,
} from "@/components/quotes/quotes-list-client";
import { QuoteListFiltersClient } from "@/components/quotes/quote-list-filters-client";
import { QuoteListSearchForm } from "@/components/quotes/quote-list-search-form";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";

import { getQuoteReadiness } from "@/lib/quote-readiness";
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
import { workstationReturnHref } from "@/lib/workstation-return-href";
import { formatCompactAge } from "@/lib/compact-age";
import { FileText, Search } from "lucide-react";

const quoteListTimestampOpts: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

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

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const { q, status, sort } = parseQuoteListSearchParams(sp);
  const fromWorkstation = sp["from"] === "workstation";
  const returnSection = typeof sp["section"] === "string" ? sp["section"] : "investigate";
  const ctx = await getRequestContextOrThrow();
  const now = new Date();

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

  /**
   * Build the serialized rows for `QuotesListClient`. Readiness is derived
   * from the cheap inputs available on the list query (no per-row activation
   * check, no per-row checkpoint queries) — the popup lazy-loads the full
   * QuoteWorkSurfaceData on open via `loadQuoteWorkSurfaceAction`.
   */
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

      activationReadiness: null, // Skip expensive activation check on list
      revisionDriftSinceLastProof: false, // Skip expensive drift check on list
    });

    const primaryIdentity =
      r.lead?.title || r.customer?.displayName || r.title;
    const secondaryIdentity =
      r.title !== primaryIdentity ? r.title : null;

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
      contextBits.length > 0
        ? contextBits.join(" · ")
        : "No customer or lead linked";

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
  const hasActiveListFilters =
    q.length > 0 || status !== "all" || sort !== QUOTE_LIST_DEFAULT_SORT;

  const sortOptions: QuoteListSortParam[] = [
    "updated",
    "created",
    "title",
    "total_desc",
    "total_asc",
  ];

  const statusNavItems = STATUS_FILTER_PILLS.map(({ param: s, label }) => ({
    key: s,
    href: serializeQuotesListHref({ q, status: s, sort }),
    label,
    active: status === s,
  }));
  const sortNavItems = sortOptions.map((s) => ({
    key: s,
    href: serializeQuotesListHref({ q, status, sort: s }),
    label: sortLabel(s),
    active: sort === s,
  }));

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb items={[{ label: "Sales" }, { label: "Quotes" }]} />
      <PageHeader
        title="Quotes"
        description="Commercial documents for this organization. Quotes carry pricing, scope, and rollups. For the full sales pipeline and intake context, use the Leads workspace."
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
            <Link href="/leads" className={mutedLinkClass}>
              ← Leads
            </Link>
            <PlaceholderButton title="No template library in this build">
              Browse templates (soon)
            </PlaceholderButton>
            <Link href="/quotes/new" className={primaryLinkClass}>
              New quote
            </Link>
          </>
        }
      />

      <section className="mb-6">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <li>
            <SignalCard label="Quotes (all)" value={String(totalInOrg)} hint="Rows in this org." />
          </li>
          <li>
            <SignalCard label="Draft quotes" value={String(draftCount)} hint="Commercial editing on detail." />
          </li>
          <li>
            <SignalCard label="Sent quotes" value={String(sentCount)} hint="Awaiting acceptance record." />
          </li>
          <li>
            <SignalCard label="Approved quotes" value={String(approvedCount)} hint="Commercial terms accepted." />
          </li>
          <li>
            <SignalCard
              label="Archived quotes"
              value={String(archivedCount)}
              hint="Read-only until restored."
            />
          </li>
          <li>
            <SignalCard
              label="Draft quoted total"
              value={formatMoneyCents(draftValueCents)}
              hint="Sum of stored quote totals (drafts only)."
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
            title="No quotes yet"
            description="There are no quote records for this organization. Create a draft from New quote, or run the development seed if your database is empty."
          >
            <Link href="/quotes/new" className={primaryLinkClass}>
              New quote
            </Link>
          </EmptyState>
        ) : matchingCount === 0 ? (
          <EmptyState
            icon={Search}
            title="No quotes match this view"
            description="Try a different search term, switch status to All, or change sort. Quotes still exist in your organization—they are just filtered out here."
          >
            <Link href="/quotes" scroll={false} className={primaryLinkClass}>
              Clear filters
            </Link>
            <Link href="/quotes/new" className={mutedLinkClass}>
              New quote
            </Link>
          </EmptyState>
        ) : (
          <QuotesListClient quotes={serializedQuotes} />
        )}
      </div>
    </div>
  );
}
