import Link from "next/link";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { PlaceholderButton } from "@/components/ui/placeholder-button";
import { LeadsScaffoldingDialog } from "@/components/leads/leads-scaffolding-dialog";
import {
  LeadSourcesProvider,
  LeadSourcesToolbarButton,
} from "@/components/leads/lead-sources-provider";
import { PublicRequestLinkPanel } from "@/components/leads/public-request-link-panel";
import {
  LeadsListClient,
  type SerializedLeadRow,
} from "@/components/leads/leads-list-client";
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
  formatQuoteStatus,
  quoteStatusBadgeTone,
} from "@/lib/quote-display";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";

import { workstationReturnHref } from "@/lib/workstation-return-href";
import { Inbox } from "lucide-react";

export const dynamic = "force-dynamic";

const primaryLinkClass =
  "inline-flex items-center rounded-lg border border-border bg-accent px-3 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90";

const returnLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams?: Promise<{ from?: string; section?: string }>;
}) {
  const sq = await (searchParams ?? Promise.resolve({} as { from?: string; section?: string }));
  const fromWorkstation = sq["from"] === "workstation";
  const returnSection = typeof sq["section"] === "string" ? sq["section"] : "investigate";
  const ctx = await getRequestContextOrThrow();
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

  /* ── Serialize leads for the client component ─────────────────────────── */

  function serializeProgressAction(
    action: LeadCommercialProgressAction,
    leadId: string,
  ): SerializedLeadRow["progressPrimaryAction"] {
    const href = resolveLeadCommercialProgressActionHref(action, { leadId });
    const opensQuoteTab =
      action.kind === "OPEN_DRAFT_QUOTE" ||
      action.kind === "OPEN_QUOTE" ||
      action.kind === "START_QUOTE";
    const opensContactTab =
      action.kind === "ATTACH_OR_CREATE_CUSTOMER" ||
      action.kind === "EDIT_CONTACT_INFO";
    return { href, label: action.label, opensQuoteTab, opensContactTab };
  }

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
          ? { id: q.job.id, status: q.job.status }
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

    const customer = lead.customer;

    return {
      id: lead.id,
      title: lead.title,
      contactName: lead.contactName,
      email: lead.email,
      phone: lead.phone,
      notes: lead.notes,
      sourceLabel: formatLeadSource(lead.source),
      statusLabel: formatLeadStatus(lead.status),
      statusTone: leadStatusBadgeTone(lead.status),
      customerId: lead.customerId,
      customerDisplayName: customer?.displayName ?? null,
      customerHref: customer ? `/customers/${customer.id}` : null,
      /* Use a fixed locale so the string is identical on server SSR and any
         client re-render of this prop value. */
      createdAtLabel: lead.createdAt.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
      progressLabel: progress.label,
      progressDescription: progress.description,
      progressTone: progress.badgeTone,
      progressPrimaryAction: progress.primaryAction
        ? serializeProgressAction(progress.primaryAction, lead.id)
        : null,
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
      leadHref: `/leads/${lead.id}`,
      newQuoteHref: `/quotes/new?leadId=${encodeURIComponent(lead.id)}`,
    };
  });

  /* ── Render ────────────────────────────────────────────────────────────── */

  const sourcesPanel = (
    <>
      <PublicRequestLinkPanel
        organizationName={ctx.organizationName}
        slug={ctx.organizationSlug || null}
        baseUrl={publicSiteBaseUrl}
        publicRequestLive={publicRequestLive}
      />
      <WorkspacePanel padding="compact">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          More lead sources (soon)
        </p>
        <p className="mt-2 text-sm text-foreground-muted">
          Your Public Request Link sends leads here automatically. Email, phone, text, and
          file imports will land in this queue as integrations roll out. You can always add
          leads by hand from the New lead action.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <PlaceholderButton title="CSV import is not connected in this build.">
            CSV import (soon)
          </PlaceholderButton>
        </div>
      </WorkspacePanel>
    </>
  );

  return (
    <LeadSourcesProvider sourcesPanel={sourcesPanel}>
      <div className="mx-auto max-w-5xl">
        <WorkspaceBreadcrumb
          items={[{ label: "Sales" }, { label: "Leads" }]}
        />
        <PageHeader
          title="Leads"
          description="Capture and move new sales opportunities toward quotes. Open a lead to review intake details, verify the customer, and track its progress."
          actions={
            <>
              {fromWorkstation ? (
                <Link
                  href={workstationReturnHref(returnSection)}
                  className={returnLinkClass}
                >
                  ← Workstation
                </Link>
              ) : null}
              <Link href="/leads/new" className={primaryLinkClass}>
                New lead
              </Link>
              <LeadSourcesToolbarButton />
              <LeadsScaffoldingDialog />
            </>
          }
        />

        <WorkspacePanel padding="none" className="mb-6 overflow-hidden">
          {leads.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Inbox}
                title="Queue is empty"
                description="No leads yet. Add one when a call, walk-in, or message comes in—or when you are ready to log the next opportunity."
              >
                <Link href="/leads/new" className={primaryLinkClass}>
                  New lead
                </Link>
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
