import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { getCommercialRequestContextOrNull } from "@/lib/auth-context";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { LeadsListClient } from "@/components/leads/lead-list-client";
import {
  serializeLeadListRow,
  type SerializedLeadRow,
} from "@/lib/serialize-lead-list-row";
import { LeadListToolbar } from "@/components/leads/lead-list-toolbar";
import { ButtonLink } from "@/components/ui/button";
import {
  parseLeadListSearchParams,
  leadListWhere,
  leadListOrderBy,
  leadRowMatchesPipeline,
  LEAD_LIST_DEFAULT_SORT,
  LEAD_LIST_DEFAULT_PIPELINE,
} from "@/lib/lead-list-query";
import { workstationReturnHref } from "@/lib/workstation-return-href";
import { loadOrgCustomersForMatchGate } from "@/lib/lead-customer-match-gate";
import { Users, Search } from "lucide-react";
import { AccessDeniedPanel } from "@/components/ui/access-denied-panel";

export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}

function leadsHrefWithout(
  record: Record<string, string | string[] | undefined>,
  keysToRemove: string[],
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    if (keysToRemove.includes(key)) continue;
    if (typeof value === "string") {
      params.set(key, value);
    } else if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    }
  }
  const query = params.toString();
  return query ? `/leads?${query}` : "/leads";
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  if (sp.view) {
    redirect(leadsHrefWithout(sp, ["view"]));
  }
  const { q, sort, pipeline } = parseLeadListSearchParams(sp);
  const selectedLeadParam = firstParam(sp.lead);
  const fromWorkstation = sp["from"] === "workstation";
  const returnSection = typeof sp["section"] === "string" ? sp["section"] : "investigate";
  const ctx = await getCommercialRequestContextOrNull();
  if (!ctx) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader variant="compact" title="Sales" />
        <AccessDeniedPanel description="This role cannot access sales records." />
      </div>
    );
  }
  const now = new Date();

  const listWhere = leadListWhere(ctx.organizationId, q);
  const orderBy = leadListOrderBy(sort);

  const [leads, totalInOrg] = await Promise.all([
    db.lead.findMany({
      where: listWhere,
      orderBy,
      include: {
        customer: { select: { id: true, displayName: true } },
        visitRequests: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            status: true,
            requestedDate: true,
            requestedWindow: true,
            confirmedDate: true,
            completedAt: true,
            createdAt: true,
          },
        },
        quotes: {
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            title: true,
            status: true,
            totalCents: true,
            createdAt: true,
            updatedAt: true,
            revisionOfQuoteId: true,
            revisionNumber: true,
            _count: { select: { lineItems: true } },
            job: { select: { id: true, status: true, organizationId: true } },
            checkpoints: {
              where: { kind: { in: ["SEND", "APPROVAL"] } },
              orderBy: { createdAt: "desc" },
              select: { kind: true, createdAt: true },
            },
            changeRequests: {
              where: { resolvedAt: null },
              orderBy: { createdAt: "desc" },
              take: 5,
              select: {
                id: true,
                message: true,
                createdAt: true,
                resolvedAt: true,
                requiresVisit: true,
                resultingQuoteId: true,
              },
            },
          },
        },
      },
    }),
    db.lead.count({ where: { organizationId: ctx.organizationId } }),
  ]);
  const selectedLead =
    selectedLeadParam && selectedLeadParam.trim().length > 0
      ? await db.lead.findFirst({
          where: { id: selectedLeadParam, organizationId: ctx.organizationId },
          select: { id: true },
        })
      : null;
  if (selectedLeadParam && !selectedLead) {
    redirect(leadsHrefWithout(sp, ["lead"]));
  }

  const customerIds = [
    ...new Set(leads.map((lead) => lead.customerId).filter((id): id is string => Boolean(id))),
  ];
  const customerPrimaryLocations =
    customerIds.length > 0
      ? await db.customerServiceLocation.findMany({
          where: { organizationId: ctx.organizationId, customerId: { in: customerIds } },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          select: { customerId: true, googlePlaceId: true },
        })
      : [];
  const customerPrimaryById = new Map<string, { googlePlaceId: string }>();
  for (const row of customerPrimaryLocations) {
    if (row.customerId && !customerPrimaryById.has(row.customerId)) {
      customerPrimaryById.set(row.customerId, { googlePlaceId: row.googlePlaceId });
    }
  }

  const hasUnlinkedLeads = leads.some((lead) => lead.customerId == null);
  const orgCustomersForMatch = hasUnlinkedLeads
    ? await loadOrgCustomersForMatchGate(ctx.organizationId)
    : undefined;

  const serializedLeads: SerializedLeadRow[] = leads.map((lead) =>
    serializeLeadListRow(
      lead,
      ctx.organizationId,
      now,
      customerPrimaryById.get(lead.customerId ?? "") ?? null,
      orgCustomersForMatch,
    ),
  );
  const pipelineLeads = serializedLeads.filter((lead) =>
    leadRowMatchesPipeline(pipeline, lead.progressState),
  );
  const matchingCount = pipelineLeads.length;

  const hasActiveListFilters =
    q.length > 0 ||
    sort !== LEAD_LIST_DEFAULT_SORT ||
    pipeline !== LEAD_LIST_DEFAULT_PIPELINE;

  const pageWidthClass = "mx-auto w-full max-w-5xl";

  return (
    <div className={pageWidthClass}>
      <PageHeader
        variant="compact"
        title="Sales"
        actions={
          <>
            {fromWorkstation ? (
              <ButtonLink href={workstationReturnHref(returnSection)} variant="muted" size="sm">
                ← Workstation
              </ButtonLink>
            ) : null}
            <ButtonLink href="/leads/new" variant="primary" size="sm">
              Add lead
            </ButtonLink>
          </>
        }
      />

      <div className="mb-10">
        <LeadListToolbar
          q={q}
          sort={sort}
          pipeline={pipeline}
          matchingCount={matchingCount}
          totalInOrg={totalInOrg}
          hasActiveListFilters={hasActiveListFilters}
        />

        <div className="mt-4">
          {totalInOrg === 0 ? (
            <WorkspacePanel padding="none" className="overflow-hidden">
              <div className="p-6">
                <EmptyState
                  icon={Users}
                  title="No leads yet"
                  description="No leads yet. Add a lead manually or share your public request link."
                >
                  <ButtonLink href="/leads/new" variant="primary" size="sm">
                    Add lead
                  </ButtonLink>
                </EmptyState>
              </div>
            </WorkspacePanel>
          ) : matchingCount === 0 && !selectedLead ? (
            <WorkspacePanel padding="none" className="overflow-hidden">
              <div className="p-6">
                <EmptyState
                  icon={Search}
                  title="No leads match this view"
                  description="Try a different search term or change sort. Records still exist in your organization—they are just filtered out here."
                >
                  <ButtonLink href="/leads" scroll={false} variant="primary" size="sm">
                    Clear filters
                  </ButtonLink>
                  <ButtonLink href="/leads/new" variant="muted" size="sm">
                    Add lead
                  </ButtonLink>
                </EmptyState>
              </div>
            </WorkspacePanel>
          ) : (
            <LeadsListClient
              leads={pipelineLeads}
              orgHasLeads={totalInOrg > 0}
              selectedLeadId={selectedLead?.id ?? null}
            />
          )}
        </div>
      </div>
    </div>
  );
}
