import Link from "next/link";
import {
  HandoffPanel,
  handoffMutedLinkClass,
  handoffPrimaryLinkClass,
} from "@/components/ui/handoff-panel";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { PlaceholderButton } from "@/components/ui/placeholder-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { LeadsScaffoldingDialog } from "@/components/leads/leads-scaffolding-dialog";
import { PublicRequestLinkPanel } from "@/components/leads/public-request-link-panel";
import { resolvePublicSiteBaseUrl } from "@/lib/public-site-base-url";
import {
  formatLeadSource,
  formatLeadStatus,
  leadStatusBadgeTone,
} from "@/lib/lead-display";
import { getLeadCommercialProgress } from "@/lib/lead-commercial-progress";
import { StatusBadge } from "@/components/ui/status-badge";
import { db, getDevOrganizationOrThrow } from "@/lib/db";
import { workstationReturnHref } from "@/lib/workstation-return-href";
import { Inbox } from "lucide-react";

export const dynamic = "force-dynamic";

const primaryLinkClass =
  "inline-flex items-center rounded-lg border border-border bg-accent px-3 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90";

const rowLinkClass =
  "group block rounded-md outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

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
  const org = await getDevOrganizationOrThrow();
  const publicSiteBaseUrl = await resolvePublicSiteBaseUrl();
  const publicRequestGate = await db.publicRequestSettings.findUnique({
    where: { organizationId: org.id },
    select: { enabled: true },
  });
  const publicRequestLive = publicRequestGate ? publicRequestGate.enabled : true;
  const leads = await db.lead.findMany({
    where: { organizationId: org.id },
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

  const leadProgressById = new Map(
    leads.map((lead) => [
      lead.id,
      getLeadCommercialProgress({
        lead: {
          status: lead.status,
          customerId: lead.customerId,
          email: lead.email,
          phone: lead.phone,
        },
        quotes: lead.quotes.map((q) => ({
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
        })),
      }),
    ]),
  );

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[{ label: "Sales" }, { label: "Leads" }]}
      />
      <PageHeader
        title="Leads"
        description="Capture, review, and move new sales opportunities toward quotes. New leads from website forms, email, phone calls, texts, and manual entry can land here for review—match each lead to a customer, follow up, and move qualified work toward a quote."
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
            <LeadsScaffoldingDialog />
            <PlaceholderButton title="Channel integrations are planned; not connected in this build.">
              Channel setup (soon)
            </PlaceholderButton>
          </>
        }
      />

      <HandoffPanel
        title="Ready for a quote?"
        description="When you have enough detail to price the work, continue in Quotes. Each step stays explicit—nothing moves between leads and quotes automatically yet."
      >
        <Link href="/quotes" className={handoffPrimaryLinkClass}>
          Go to Quotes
        </Link>
        <Link href="/leads/new" className={handoffMutedLinkClass}>
          Start new lead
        </Link>
      </HandoffPanel>

      <div className="mb-10 grid gap-6 lg:grid-cols-[1fr_minmax(0,18rem)]">
        <div>
          <SectionHeading
            title="Intake queue"
            description="New leads appear here, newest first. Open a row to update follow-up, match to a customer, and get ready for a quote."
          />
          <WorkspacePanel padding="none" className="overflow-hidden">
            <div className="border-b border-border bg-foreground/[0.02] px-4 py-2">
              <p className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                New leads
              </p>
            </div>
            <div className="p-0">
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
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[48rem] text-left text-sm">
                    <thead>
                      <tr className="border-b border-border text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                        <th className="px-4 pb-3 pt-4 font-medium">Lead</th>
                        <th className="pr-4 pb-3 pt-4 font-medium">Commercial progress</th>
                        <th className="pr-4 pb-3 pt-4 font-medium">Status</th>
                        <th className="pr-4 pb-3 pt-4 font-medium">Lead source</th>
                        <th className="pr-4 pb-3 pt-4 font-medium">Customer</th>
                        <th className="pb-3 pt-4 font-medium">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leads.map((lead) => {
                        const progress = leadProgressById.get(lead.id);
                        return (
                          <tr
                            key={lead.id}
                            className="border-b border-border/50 last:border-0"
                          >
                            <td className="px-4 py-4 align-top">
                              <Link href={`/leads/${lead.id}`} className={rowLinkClass}>
                                <div className="font-medium text-foreground transition-colors group-hover:text-foreground group-hover:underline">
                                  {lead.title}
                                </div>
                                <div className="mt-1 text-xs text-foreground-subtle">
                                  {lead.email || lead.phone || "No contact yet"}
                                </div>
                              </Link>
                            </td>
                            <td className="py-4 pr-4 align-top">
                              {progress ? (
                                <StatusBadge
                                  label={progress.label}
                                  tone={progress.badgeTone}
                                />
                              ) : (
                                <span className="text-xs text-foreground-subtle">—</span>
                              )}
                            </td>
                            <td className="py-4 pr-4 align-top">
                              <StatusBadge
                                label={formatLeadStatus(lead.status)}
                                tone={leadStatusBadgeTone(lead.status)}
                              />
                            </td>
                            <td className="py-4 pr-4 align-top text-foreground-muted">
                              {formatLeadSource(lead.source)}
                            </td>
                            <td className="py-4 pr-4 align-top">
                              {lead.customer ? (
                                <Link
                                  href={`/customers/${lead.customer.id}`}
                                  className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
                                >
                                  {lead.customer.displayName}
                                </Link>
                              ) : (
                                <span className="text-sm text-foreground-subtle">No customer</span>
                              )}
                            </td>
                            <td className="py-4 pr-4 align-top text-foreground-subtle">
                              {new Date(lead.createdAt).toLocaleDateString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </WorkspacePanel>
        </div>

        <aside>
          <PublicRequestLinkPanel
            organizationName={org.name}
            slug={org.slug}
            baseUrl={publicSiteBaseUrl}
            publicRequestLive={publicRequestLive}
          />
          <WorkspacePanel padding="compact">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
              Connected channels
            </p>
            <p className="mt-2 text-sm text-foreground-muted">
              Your Public Request Link sends leads here automatically. Other channels—email,
              phone, text, imports—will land in this queue as integrations roll out. You can
              always add leads by hand from the New lead action.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <PlaceholderButton title="CSV import is not connected in this build.">
                CSV import (soon)
              </PlaceholderButton>
            </div>
          </WorkspacePanel>
        </aside>
      </div>
    </div>
  );
}
