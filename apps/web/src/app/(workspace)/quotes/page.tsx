import Link from "next/link";
import {
  HandoffPanel,
  handoffMutedLinkClass,
} from "@/components/ui/handoff-panel";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { PlaceholderButton } from "@/components/ui/placeholder-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBadge } from "@/components/ui/status-badge";
import { db, getDevOrganizationOrThrow } from "@/lib/db";
import {
  formatMoneyCents,
  formatQuoteStatus,
  quoteStatusBadgeTone,
} from "@/lib/quote-display";
import { FileText } from "lucide-react";

export const dynamic = "force-dynamic";

const primaryLinkClass =
  "inline-flex items-center rounded-lg border border-border bg-accent px-3 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90";

export default async function QuotesPage() {
  const org = await getDevOrganizationOrThrow();
  const quotes = await db.quote.findMany({
    where: { organizationId: org.id },
    orderBy: { updatedAt: "desc" },
    include: {
      customer: { select: { id: true, displayName: true } },
      lead: { select: { id: true, title: true } },
    },
  });

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[{ label: "Sales" }, { label: "Quotes" }]}
      />
      <PageHeader
        eyebrow="Sales"
        title="Quotes"
        description="Commercial drafts for this organization—read from the database in your development tenant. Create, edit, send, approval, and payment collection are not wired yet."
        actions={
          <>
            <Link href="/quotes/new" className={primaryLinkClass}>
              New quote
            </Link>
            <PlaceholderButton>Templates (soon)</PlaceholderButton>
          </>
        }
      />

      <HandoffPanel
        title="Commercial handoff"
        description="Quotes carry line items before any future job activation. This list is org-scoped; nothing here implies send or approval."
      >
        <Link href="/leads" className={handoffMutedLinkClass}>
          Go to Leads
        </Link>
      </HandoffPanel>

      <WorkspacePanel className="mb-8" padding="compact">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          Quote status (persisted)
        </p>
        <p className="mt-2 text-sm text-foreground-muted">
          Only Draft and Archived exist in the data model for this phase—no Sent or Approved rows yet.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StatusBadge label={formatQuoteStatus("DRAFT")} tone={quoteStatusBadgeTone("DRAFT")} />
          <StatusBadge
            label={formatQuoteStatus("ARCHIVED")}
            tone={quoteStatusBadgeTone("ARCHIVED")}
          />
        </div>
      </WorkspacePanel>

      <div className="mb-10 grid gap-6 lg:grid-cols-[1fr_minmax(0,17rem)]">
        <div>
          <SectionHeading
            title="Quote list"
            description={`Quotes in ${org.name}. Search and filters attach in a later phase.`}
          />
          {quotes.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No quotes on file"
              description="Run prisma db seed to load [dev seed] quotes, or add records manually in the database. Create and edit routes are not implemented yet."
            >
              <Link href="/quotes/new" className={primaryLinkClass}>
                New quote (shell)
              </Link>
            </EmptyState>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {quotes.map((q) => {
                const updated = new Date(q.updatedAt).toLocaleString();
                const created = new Date(q.createdAt).toLocaleString();
                const contextBits: string[] = [];
                if (q.customer) contextBits.push(q.customer.displayName);
                if (q.lead) contextBits.push(`Lead: ${q.lead.title}`);
                const contextLine =
                  contextBits.length > 0 ? contextBits.join(" · ") : "No customer or lead linked";
                return (
                  <li key={q.id} className="px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/quotes/${q.id}`}
                          className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
                        >
                          {q.title}
                        </Link>
                        <p className="mt-1 text-xs text-foreground-muted">
                          <span className="break-words">{contextLine}</span>
                        </p>
                        <dl className="mt-2 grid gap-1 text-xs text-foreground-muted sm:grid-cols-2">
                          <div>
                            <dt className="font-medium uppercase tracking-wide text-foreground-subtle">
                              Created
                            </dt>
                            <dd className="mt-0.5 text-foreground">{created}</dd>
                          </div>
                          <div>
                            <dt className="font-medium uppercase tracking-wide text-foreground-subtle">
                              Updated
                            </dt>
                            <dd className="mt-0.5 text-foreground">{updated}</dd>
                          </div>
                        </dl>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
                        <StatusBadge
                          label={formatQuoteStatus(q.status)}
                          tone={quoteStatusBadgeTone(q.status)}
                        />
                        <span className="text-sm font-medium tabular-nums text-foreground">
                          {formatMoneyCents(q.totalCents)}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <WorkspacePanel padding="compact">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
            Detail surface
          </p>
          <ul className="mt-3 space-y-2 text-sm text-foreground-muted">
            <li>Open a quote for read-only line items and rollups.</li>
            <li>Tax, shipping, and payment milestones are deferred.</li>
            <li>Send, PDF, e-sign, and approval stay future work.</li>
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/quotes/new" className={primaryLinkClass}>
              New quote (shell)
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
