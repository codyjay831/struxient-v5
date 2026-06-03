import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import {
  LeadsListClient,
} from "@/components/leads/lead-list-client";
import {
  serializeLeadListRow,
  type SerializedLeadRow,
} from "@/lib/serialize-lead-list-row";
import { LeadListSearchForm } from "@/components/leads/lead-list-search-form";
import { LeadListFiltersClient } from "@/components/leads/lead-list-filters-client";
import { LeadScaffoldingDialog } from "@/components/leads/lead-scaffolding-dialog";
import { ButtonLink, buttonClassName } from "@/components/ui/button";
import {
  parseLeadListSearchParams,
  leadListWhere,
  leadListOrderBy,
  serializeLeadListHref,
  LEAD_LIST_DEFAULT_SORT,
  type LeadListSortParam,
} from "@/lib/lead-list-query";
import { workstationReturnHref } from "@/lib/workstation-return-href";
import { Users, Search } from "lucide-react";

export const dynamic = "force-dynamic";

const primaryLinkClass = buttonClassName({ variant: "primary", size: "sm" });
const mutedLinkClass = buttonClassName({ variant: "muted", size: "sm" });

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

  const serializedLeads: SerializedLeadRow[] = leads.map((lead) =>
    serializeLeadListRow(lead, ctx.organizationId, now),
  );

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
      <WorkspaceBreadcrumb items={[{ label: "Sales" }]} />
      <PageHeader
        title="Sales"
        description="Manage your commercial pipeline from intake to approved quote. Track every opportunity and its associated quotes in one unified view."
        actions={
          <>
            {fromWorkstation ? (
              <ButtonLink href={workstationReturnHref(returnSection)} variant="muted" size="sm">
                ← Workstation
              </ButtonLink>
            ) : null}
            <ButtonLink href="/leads/new" variant="primary" size="sm">
              New request
            </ButtonLink>
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
                title="No sales opportunities yet"
                description="No opportunities yet. Add a request manually or share your public request link."
              >
                <ButtonLink href="/leads/new" variant="primary" size="sm">
                  New request
                </ButtonLink>
              </EmptyState>
            </div>
          ) : matchingCount === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Search}
                title="No opportunities match this view"
                description="Try a different search term or change sort. Records still exist in your organization—they are just filtered out here."
              >
                <ButtonLink href="/leads" scroll={false} variant="primary" size="sm">
                  Clear filters
                </ButtonLink>
                <ButtonLink href="/leads/new" variant="muted" size="sm">
                  New request
                </ButtonLink>
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
