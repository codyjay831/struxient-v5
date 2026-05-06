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
import {
  formatLeadSource,
  formatLeadStatus,
  leadStatusBadgeTone,
} from "@/lib/lead-display";
import { StatusBadge } from "@/components/ui/status-badge";
import { db, getDevOrganizationOrThrow } from "@/lib/db";
import { Inbox, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

const primaryLinkClass =
  "inline-flex items-center rounded-lg border border-border bg-accent px-3 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90";

const rowLinkClass =
  "group block rounded-md outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export default async function LeadsPage() {
  const org = await getDevOrganizationOrThrow();
  const leads = await db.lead.findMany({
    where: { organizationId: org.id },
    orderBy: { createdAt: "desc" },
    include: {
      customer: { select: { id: true, displayName: true } },
    },
  });

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[{ label: "Sales" }, { label: "Leads" }]}
      />
      <PageHeader
        eyebrow="Sales"
        title="Leads"
        description="Intake for this organization—status and source are stored per lead; link or create a customer from each lead’s detail page. Scoped with the development tenant until auth exists."
        actions={
          <>
            <Link href="/leads/new" className={primaryLinkClass}>
              New lead
            </Link>
            <PlaceholderButton>Connect channel (soon)</PlaceholderButton>
          </>
        }
      />

      <HandoffPanel
        title="Sales handoff"
        description="When a lead is qualified—customer, rough scope, and timing are clear—Sales continues in Quotes. Nothing moves automatically without explicit flows."
      >
        <Link href="/quotes" className={handoffPrimaryLinkClass}>
          Go to Quotes
        </Link>
        <Link href="/leads/new" className={handoffMutedLinkClass}>
          Start new lead
        </Link>
      </HandoffPanel>

      <WorkspacePanel padding="compact" className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          Persistence
        </p>
        <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
          This route reads <span className="font-medium text-foreground">Lead</span> rows from{" "}
          <span className="font-medium text-foreground">PostgreSQL</span> via{" "}
          <span className="font-medium text-foreground">Prisma</span>, scoped with{" "}
          <span className="font-medium text-foreground">getDevOrganizationOrThrow()</span> (development
          tenant only — not production org resolution).
        </p>
      </WorkspacePanel>

      <div className="mb-10 grid gap-6 lg:grid-cols-[1fr_minmax(0,18rem)]">
        <div>
          <SectionHeading
            title="Intake queue"
            description="Single list, newest first—not a Kanban board. Rows open the lead workspace; customer link is explicit on the detail page."
          />
          <WorkspacePanel padding="none" className="overflow-hidden">
            <div className="border-b border-border bg-foreground/[0.02] px-4 py-2">
              <p className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                All leads
              </p>
            </div>
            <div className="p-0">
              {leads.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={Inbox}
                    title="Queue is empty"
                    description="No leads exist for this organization yet. Run the development seed after migration, or create one with New lead."
                  >
                    <Link href="/leads/new" className={primaryLinkClass}>
                      New lead
                    </Link>
                  </EmptyState>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[42rem] text-left text-sm">
                    <thead>
                      <tr className="border-b border-border text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                        <th className="px-4 pb-3 pt-4 font-medium">Lead</th>
                        <th className="pr-4 pb-3 pt-4 font-medium">Status</th>
                        <th className="pr-4 pb-3 pt-4 font-medium">Source</th>
                        <th className="pr-4 pb-3 pt-4 font-medium">Customer</th>
                        <th className="pr-4 pb-3 pt-4 font-medium">Contact</th>
                        <th className="pb-3 pt-4 font-medium">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leads.map((lead) => (
                        <tr
                          key={lead.id}
                          className="border-b border-border/50 last:border-0"
                        >
                          <td className="px-4 py-4">
                            <Link href={`/leads/${lead.id}`} className={rowLinkClass}>
                              <div className="font-medium text-foreground transition-colors group-hover:text-foreground group-hover:underline">
                                {lead.title}
                              </div>
                              <div className="break-all font-mono text-xs text-foreground-subtle">
                                {lead.id}
                              </div>
                            </Link>
                          </td>
                          <td className="py-4 pr-4 align-top">
                            <StatusBadge
                              label={formatLeadStatus(lead.status)}
                              tone={leadStatusBadgeTone(lead.status)}
                            />
                          </td>
                          <td className="py-4 pr-4 text-foreground-muted">
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
                              <span className="text-sm text-foreground-subtle">Not linked</span>
                            )}
                          </td>
                          <td className="py-4 pr-4">
                            <div className="text-foreground-muted">{lead.email || "—"}</div>
                            <div className="text-xs text-foreground-subtle">{lead.phone || "—"}</div>
                          </td>
                          <td className="py-4 pr-4 text-foreground-subtle">
                            {new Date(lead.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </WorkspacePanel>
        </div>

        <aside className="space-y-6">
          <WorkspacePanel padding="compact">
            <div className="flex gap-2">
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0 text-foreground-subtle"
                strokeWidth={1.5}
                aria-hidden
              />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
                  Customer match hints
                </p>
                <p className="mt-2 text-sm text-foreground-muted">
                  On each lead’s detail page, warn-only possible matches appear when the lead has
                  an email or phone—same organization, exact normalized match, never auto-link or
                  merge. This list view stays lightweight.
                </p>
              </div>
            </div>
          </WorkspacePanel>
          <WorkspacePanel padding="compact">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
              Channels (placeholder)
            </p>
            <p className="mt-2 text-sm text-foreground-muted">
              Phone, email, and partner referrals map to the same intake pipeline; integrations are
              out of scope for this pass.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <PlaceholderButton title="No web form intake in this build">
                Web form (soon)
              </PlaceholderButton>
              <PlaceholderButton title="No CSV import in this build">
                CSV import (soon)
              </PlaceholderButton>
            </div>
          </WorkspacePanel>
        </aside>
      </div>
    </div>
  );
}
