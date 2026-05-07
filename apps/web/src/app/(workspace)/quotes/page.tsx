import Link from "next/link";
import { QuoteStatus } from "@prisma/client";
import {
  HandoffPanel,
} from "@/components/ui/handoff-panel";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { PlaceholderButton } from "@/components/ui/placeholder-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBadge } from "@/components/ui/status-badge";
import { SignalCard } from "@/components/ui/signal-card";
import {
  QuotesListClient,
  type SerializedQuoteListRow,
} from "@/components/quotes/quotes-list-client";
import { db, getDevOrganizationOrThrow } from "@/lib/db";
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
import { FileText, Search } from "lucide-react";

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

const fieldLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";
const controlClass =
  "mt-1 w-full min-w-[12rem] rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

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

function statusFilterLabel(status: QuoteListStatusParam): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "active":
      return "Active (not archived)";
    case "archived":
      return "Archived";
    case "all":
    default:
      return "All statuses";
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
  const org = await getDevOrganizationOrThrow();

  const listWhere = quoteListWhere(org.id, status, q);
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
        lead: { select: { id: true, title: true, contactName: true } },
        job: { select: { id: true, status: true, organizationId: true } },
        _count: { select: { lineItems: true } },
      },
    }),
    db.quote.count({ where: listWhere }),
    db.quote.count({ where: { organizationId: org.id } }),
    db.quote.count({ where: { organizationId: org.id, status: QuoteStatus.DRAFT } }),
    db.quote.count({ where: { organizationId: org.id, status: QuoteStatus.SENT } }),
    db.quote.count({ where: { organizationId: org.id, status: QuoteStatus.APPROVED } }),
    db.quote.count({ where: { organizationId: org.id, status: QuoteStatus.ARCHIVED } }),
    db.quote.aggregate({
      where: { organizationId: org.id, status: QuoteStatus.DRAFT },
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
        r.job && r.job.organizationId === org.id
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

    return {
      id: r.id,
      primaryIdentity,
      secondaryIdentity,
      contextLine,
      totalCents: r.totalCents,
      totalLabel: formatMoneyCents(r.totalCents),
      status: r.status,
      statusLabel: formatQuoteStatus(r.status),
      statusTone: quoteStatusBadgeTone(r.status),
      readinessLabel: readiness.label,
      readinessTone: readiness.badgeTone,
      createdLabel: new Date(r.createdAt).toLocaleString(),
      updatedLabel: new Date(r.updatedAt).toLocaleString(),
      href: `/quotes/${r.id}`,
    };
  });
  const hasActiveListFilters =
    q.length > 0 || status !== "all" || sort !== QUOTE_LIST_DEFAULT_SORT;

  const listDescription =
    totalInOrg === 0
      ? `No quotes in ${org.name} yet.`
      : `Showing ${matchingCount} of ${totalInOrg} quote${totalInOrg === 1 ? "" : "s"} in ${org.name}.`;

  const sortOptions: QuoteListSortParam[] = [
    "updated",
    "created",
    "title",
    "total_desc",
    "total_asc",
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb items={[{ label: "Sales" }, { label: "Quotes" }]} />
      <PageHeader
        title="Quotes"
        description="Commercial documents for this organization. Quotes carry pricing, scope, and rollups. For the full sales pipeline and opportunity context, use the Leads/Opportunities workspace."
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
              ← Opportunities
            </Link>
            <Link href="/quotes/new" className={primaryLinkClass}>
              New quote
            </Link>
          </>
        }
      />

      <HandoffPanel
        title="Commercial documents"
        description="Quotes are document-centric records. They are typically created as a step within a sales opportunity. Use the Opportunities workspace to manage the overall customer relationship and sales flow."
      >
        <Link href="/leads" className={primaryLinkClass}>
          Go to Opportunities
        </Link>
      </HandoffPanel>

      <section className="mb-8">
        <SectionHeading
          title="Organization overview"
          description="Counts and draft rollups are real database aggregates for this development tenant only."
        />
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

      <WorkspacePanel padding="compact" className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          Quote status (persisted)
        </p>
        <p className="mt-2 text-sm text-foreground-muted">
          Draft → Sent (Send quote) → Approved (Mark approved) → Archived. Restore from archive returns to Draft. Use
          filters below to narrow the list.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StatusBadge label={formatQuoteStatus("DRAFT")} tone={quoteStatusBadgeTone("DRAFT")} />
          <StatusBadge label={formatQuoteStatus("SENT")} tone={quoteStatusBadgeTone("SENT")} />
          <StatusBadge label={formatQuoteStatus("APPROVED")} tone={quoteStatusBadgeTone("APPROVED")} />
          <StatusBadge
            label={formatQuoteStatus("ARCHIVED")}
            tone={quoteStatusBadgeTone("ARCHIVED")}
          />
        </div>
      </WorkspacePanel>

      <WorkspacePanel className="mb-6">
        <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle">
          Search & filters
        </p>
        <p className="mt-1 text-xs text-foreground-muted">
          Matches quote title, linked customer name or company, and linked lead title or contact name.
          URL query params keep this view shareable.
        </p>

        <form method="get" action="/quotes" className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 sm:max-w-md">
            <label className="block">
              <span className={fieldLabelClass}>Search</span>
              <input
                name="q"
                type="search"
                defaultValue={q}
                maxLength={200}
                placeholder="Title, customer, lead…"
                className={controlClass}
                autoComplete="off"
              />
            </label>
          </div>
          {status !== "all" ? <input type="hidden" name="status" value={status} /> : null}
          {sort !== QUOTE_LIST_DEFAULT_SORT ? <input type="hidden" name="sort" value={sort} /> : null}
          <button type="submit" className={primaryLinkClass}>
            Apply search
          </button>
        </form>

        <div className="mt-4">
          <p className={`${fieldLabelClass} mb-2`}>Status</p>
          <div className="flex flex-wrap gap-2">
            {(["all", "draft", "active", "archived"] as const).map((s) => (
              <Link
                key={s}
                href={serializeQuotesListHref({ q, status: s, sort })}
                className={status === s ? pillActive : pillIdle}
                aria-current={status === s ? "page" : undefined}
              >
                {s === "all" ? "All" : s === "draft" ? "Draft" : s === "active" ? "Active" : "Archived"}
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <p className={`${fieldLabelClass} mb-2`}>Sort</p>
          <div className="flex flex-wrap gap-1.5">
            {sortOptions.map((s) => (
              <Link
                key={s}
                href={serializeQuotesListHref({ q, status, sort: s })}
                className={sort === s ? sortLinkActive : sortLinkIdle}
                aria-current={sort === s ? "true" : undefined}
              >
                {sortLabel(s)}
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4 text-xs text-foreground-muted">
          <span>
            <span className="font-medium text-foreground">Active view:</span>{" "}
            {statusFilterLabel(status)}
            {" · "}
            {sortLabel(sort)}
            {q ? (
              <>
                {" · "}
                <span className="break-all">
                  Search &quot;{q}&quot;
                </span>
              </>
            ) : null}
          </span>
          {hasActiveListFilters ? (
            <Link href="/quotes" className={mutedLinkClass}>
              Clear filters
            </Link>
          ) : null}
        </div>
      </WorkspacePanel>

      <div className="mb-10 grid gap-6 lg:grid-cols-[1fr_minmax(0,17rem)]">
        <div>
          <SectionHeading title="Quote list" description={listDescription} />
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
              <Link href="/quotes" className={primaryLinkClass}>
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
        <WorkspacePanel padding="compact">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
            Detail surface
          </p>
          <ul className="mt-3 space-y-2 text-sm text-foreground-muted">
            <li>Open a quote for line items and rollups; drafts are editable, archived are read-only.</li>
            <li>Totals follow line items on the quote row—no separate billing or tax lines in this build.</li>
            <li>Live proposal preview and recorded send checkpoints are staff-only views on the same working record.</li>
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/quotes/new" className={primaryLinkClass}>
              New quote
            </Link>
            <PlaceholderButton title="No template library in this build">
              Browse templates (soon)
            </PlaceholderButton>
          </div>
        </WorkspacePanel>
      </div>
    </div>
  );
}
