import Link from "next/link";
import { QuoteStatus } from "@prisma/client";
import {
  QuoteArchivedRestorePanel,
  QuoteDraftArchivePanel,
} from "@/components/quotes/quote-archive-controls";
import {
  ArchivedQuoteReadOnlyNotice,
  QuoteDraftWorkspaceControls,
} from "@/components/quotes/quote-draft-workspace-controls";
import { QuoteSendCheckpointsStaffPanel } from "@/components/quotes/quote-send-checkpoints-staff-panel";
import {
  HandoffPanel,
  handoffMutedLinkClass,
} from "@/components/ui/handoff-panel";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { PlaceholderButton } from "@/components/ui/placeholder-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SignalCard } from "@/components/ui/signal-card";
import { QuoteLineItemScanBlock } from "@/components/quotes/quote-line-item-display";
import type { LineItemTemplatePickerRow } from "@/lib/line-item-template-display";
import {
  formatMoneyCents,
  formatQuoteStatus,
  quoteStatusBadgeTone,
  type QuoteDetailPayload,
  type QuoteSendCheckpointSummary,
} from "@/lib/quote-display";
import {
  ListOrdered,
  Wallet,
  Wrench,
  MessageSquare,
  Eye,
  UserRound,
} from "lucide-react";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export type QuoteWorkspaceShellProps = {
  quote: QuoteDetailPayload;
  lineItemTemplates: LineItemTemplatePickerRow[];
  sendCheckpoints: QuoteSendCheckpointSummary[];
  workspaceDiffersFromLastSend: boolean;
};

function QuoteDetailShell({
  quote,
  lineItemTemplates,
  sendCheckpoints,
  workspaceDiffersFromLastSend,
}: {
  quote: QuoteDetailPayload;
  lineItemTemplates: LineItemTemplatePickerRow[];
  sendCheckpoints: QuoteSendCheckpointSummary[];
  workspaceDiffersFromLastSend: boolean;
}) {
  const isDraft = quote.status === QuoteStatus.DRAFT;
  const createdLabel = new Date(quote.createdAt).toLocaleString();
  const updatedLabel = new Date(quote.updatedAt).toLocaleString();
  const hasCustomer = quote.customer != null;
  const hasLead = quote.lead != null;
  const lineCount = quote.lineItems.length;

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Sales" },
          { label: "Quotes", href: "/quotes" },
          { label: quote.title },
        ]}
      />
      <PageHeader
        eyebrow="Sales · Internal quote workspace"
        title={quote.title}
        description={
          isDraft
            ? "This is the current working quote in your development organization—edits below save to this record. Line totals roll up to the quote; archive freezes edits (restore brings it back). Recorded send checkpoints are staff-only proof rows, not delivery or approval. Live proposal preview follows the saved quote; checkpoints are separate proof captures."
            : "Archived read-only view in your development organization. Restore to draft to edit again; totals and links stay as stored. Existing recorded sends remain internal proof; restore is the only state change from here."
        }
        actions={
          <Link href="/quotes" className={listLinkClass}>
            ← Quotes list
          </Link>
        }
      />

      <WorkspacePanel padding="compact" className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          Working quote record
        </p>
        <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
          Single current-state row for this quote—what you edit on draft is what persists until you archive.
        </p>
        <p className="mt-2 break-all font-mono text-xs text-foreground-muted">{quote.id}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge
            label={formatQuoteStatus(quote.status)}
            tone={quoteStatusBadgeTone(quote.status)}
          />
          <span className="text-xs text-foreground-muted">
            {isDraft
              ? "Subtotal and total are stored rollups (cents) on the quote row; they are recomputed from line totals after each line change."
              : "Subtotal and total are stored rollups on the quote row. This archived view is read-only except restore below."}
          </span>
        </div>
        <dl className="mt-4 grid gap-2 text-xs text-foreground-muted sm:grid-cols-2">
          <div>
            <dt className="font-medium uppercase tracking-wide text-foreground-subtle">Created</dt>
            <dd className="mt-0.5 text-foreground">{createdLabel}</dd>
          </div>
          <div>
            <dt className="font-medium uppercase tracking-wide text-foreground-subtle">Updated</dt>
            <dd className="mt-0.5 text-foreground">{updatedLabel}</dd>
          </div>
        </dl>
      </WorkspacePanel>

      {isDraft && workspaceDiffersFromLastSend ? (
        <WorkspacePanel
          padding="compact"
          className="mb-6 border border-border border-l-[3px] border-l-danger/60 bg-danger/[0.03]"
        >
          <p className="text-sm font-medium text-foreground">Workspace differs from last recorded send checkpoint</p>
          <p className="mt-2 text-xs leading-relaxed text-foreground-muted">
            The working quote has changed since your latest recorded send checkpoint. Review the live proposal preview,
            then record another checkpoint when you want updated staff-only proof. This is not external delivery and not
            a version manager.
          </p>
        </WorkspacePanel>
      ) : null}

      <div className="space-y-6">
        <WorkspacePanel>
          <SectionHeading
            title="Linked customer and lead"
            description="Optional links for your team—neither is required. When both are set, they should match your org’s lead–customer rules. Open the record for more context."
          />
          {hasCustomer || hasLead ? (
            <div className="rounded-lg border border-border bg-surface px-4 py-5">
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                    Customer
                  </dt>
                  <dd className="mt-1 text-sm text-foreground">
                    {quote.customer ? (
                      <Link
                        href={`/customers/${quote.customer.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {quote.customer.displayName}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                    Lead
                  </dt>
                  <dd className="mt-1 text-sm text-foreground">
                    {quote.lead ? (
                      <Link
                        href={`/leads/${quote.lead.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {quote.lead.title}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-foreground/[0.02] px-4 py-8 text-center sm:py-10">
              <UserRound
                className="mx-auto mb-3 size-9 text-foreground-subtle opacity-70"
                strokeWidth={1.25}
                aria-hidden
              />
              <p className="text-sm text-foreground-muted">
                No customer or lead on this quote—that is allowed. The title above identifies this draft for your team; use Customers or Leads when you want a navigable link.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Link href="/customers" className={listLinkClass}>
                  Customers
                </Link>
                <Link href="/leads" className={listLinkClass}>
                  Leads
                </Link>
              </div>
            </div>
          )}
        </WorkspacePanel>

        {!isDraft ? <ArchivedQuoteReadOnlyNotice /> : null}
        {!isDraft ? <QuoteArchivedRestorePanel quoteId={quote.id} /> : null}

        {isDraft ? (
          <QuoteDraftWorkspaceControls
            quoteId={quote.id}
            initialTitle={quote.title}
            initialInternalNotes={quote.internalNotes}
            initialCustomerDocumentTitle={quote.customerDocumentTitle}
            subtotalCents={quote.subtotalCents}
            totalCents={quote.totalCents}
            lineItems={quote.lineItems}
            lineItemTemplates={lineItemTemplates}
          />
        ) : (
          <WorkspacePanel className="border-border-strong shadow-md ring-1 ring-ring/30">
            <SectionHeading
              title="Line items"
              description="Read-only scope rows as stored when archived. Subtotal and total on the quote row reflect line totals at archive time; no edits here."
            />
            <div className="mb-5 grid gap-3 sm:grid-cols-3">
              <SignalCard
                label="Subtotal"
                value={formatMoneyCents(quote.subtotalCents)}
                hint="Stored rollup (sum of line totals)."
              />
              <SignalCard
                label="Total"
                value={formatMoneyCents(quote.totalCents)}
                hint="Same as subtotal for now—no tax line."
              />
              <SignalCard
                label="Lines"
                value={String(lineCount)}
                hint="Persisted rows, ordered for display."
              />
            </div>
            {lineCount === 0 ? (
              <EmptyState
                icon={ListOrdered}
                title="No line items were captured before archive"
                description="Restore to draft if you need to add scope rows; this read-only view stays empty until lines exist on the record."
              />
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
                {quote.lineItems.map((line) => (
                  <li key={line.id} className="px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <QuoteLineItemScanBlock line={line} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </WorkspacePanel>
        )}

        {isDraft ? <QuoteDraftArchivePanel quoteId={quote.id} /> : null}

        <QuoteSendCheckpointsStaffPanel
          quoteId={quote.id}
          isDraft={isDraft}
          sendCheckpoints={sendCheckpoints}
        />

        <WorkspacePanel className="border border-border border-l-[3px] border-l-accent">
          <SectionHeading
            title="Deferred: holds and invoice timing"
            description="This build stores commercial totals from line items only—no per-quote milestone or hold rows on the quote record."
          />
          <p className="mb-4 rounded-lg border border-border bg-foreground/[0.02] px-3 py-2 text-xs leading-relaxed text-foreground-muted">
            Totals on the quote row are rollups from lines. Nothing here stores billing milestones on the quote—that would
            be a later product layer, not this placeholder panel.
          </p>
          <EmptyState
            icon={Wallet}
            title="No milestone rows on the quote"
            description="Subtotal and total follow line items on the working quote record only."
          />
        </WorkspacePanel>

        <WorkspacePanel
          padding="compact"
          className="border-dashed border-border bg-surface/80"
        >
          <SectionHeading
            title="Site & field context (deferred)"
            description="Field visit and install notes are not captured on quotes in this build—line items carry commercial scope and rollups only."
          />
          <EmptyState
            icon={Wrench}
            title="No field or install notes on this quote"
            description="Nothing stored here; this section stays empty in this build."
          >
            <PlaceholderButton title="No field/install store on quotes in this build">
              Add note
            </PlaceholderButton>
          </EmptyState>
        </WorkspacePanel>

        <WorkspacePanel>
          <SectionHeading
            title="Live proposal preview"
            description="Internal preview from the current saved working quote—not a portal, delivery channel, or approval capture."
          />
          <EmptyState
            icon={Eye}
            title="Open live proposal preview"
            description="Shows how optional proposal wording reads from this quote as saved now. Recorded send checkpoints below are separate staff-only proof—not a second editable copy."
          >
            <Link href={`/quotes/${quote.id}/preview`} className={listLinkClass}>
              Open live proposal preview
            </Link>
          </EmptyState>
          <p className="mt-3 text-xs leading-relaxed text-foreground-muted">
            External approval, e-sign, and delivery are outside the scope of this build—only internal preview and recorded
            checkpoints exist here.
          </p>
        </WorkspacePanel>

        {!isDraft ? (
          <WorkspacePanel padding="compact">
            <SectionHeading
              title="Internal notes"
              description="Staff-only notes on the quote record—omitted from live proposal preview and send checkpoint payloads."
            />
            {quote.internalNotes ? (
              <p className="rounded-lg border border-border bg-foreground/[0.02] px-4 py-3 text-sm leading-relaxed text-foreground-muted">
                {quote.internalNotes}
              </p>
            ) : (
              <p className="text-sm text-foreground-muted">No internal notes on this quote.</p>
            )}
          </WorkspacePanel>
        ) : null}

        <WorkspacePanel padding="compact">
          <SectionHeading
            title="Notes & activity"
            description="When edit and checkpoint events exist, they can surface here as an explanation layer—no fabricated history."
          />
          <EmptyState
            icon={MessageSquare}
            title="No activity yet"
            description="Nothing logged on this quote yet."
          />
        </WorkspacePanel>

        <HandoffPanel
          title="Quote workspace scope"
          description="Draft and archive for the working quote record. Recorded send checkpoints are staff-only proof—not external delivery. Live proposal preview reflects the saved quote; checkpoints are point-in-time captures."
        >
          <Link href="/quotes" className={handoffMutedLinkClass}>
            Quotes list
          </Link>
        </HandoffPanel>
      </div>
    </div>
  );
}

export function QuoteWorkspaceShell(props: QuoteWorkspaceShellProps) {
  return (
    <QuoteDetailShell
      quote={props.quote}
      lineItemTemplates={props.lineItemTemplates}
      sendCheckpoints={props.sendCheckpoints}
      workspaceDiffersFromLastSend={props.workspaceDiffersFromLastSend}
    />
  );
}
