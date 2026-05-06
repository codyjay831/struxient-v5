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

export type QuoteWorkspaceShellProps =
  | { mode: "new" }
  | {
      mode: "detail";
      quote: QuoteDetailPayload;
      lineItemTemplates: LineItemTemplatePickerRow[];
      sendCheckpoints: QuoteSendCheckpointSummary[];
      workspaceDiffersFromLastSend: boolean;
    };

/** Suggested authoring order — copy only, no workflow engine. */
function QuoteBuildOrderStrip() {
  const steps = [
    "Link customer or lead",
    "Build line items (scope)",
    "Set payment plan (money)",
    "Add execution detail if helpful",
    "Review customer-facing terms",
  ];
  return (
    <WorkspacePanel padding="compact" className="mb-6 border-border-strong">
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
        Suggested order (new quote)
      </p>
      <ol className="mt-3 flex list-none flex-col gap-2 text-sm text-foreground-muted sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-1 sm:gap-y-2">
        {steps.map((label, i) => (
          <li key={label} className="flex items-center gap-1">
            <span className="tabular-nums text-foreground-subtle">{i + 1}.</span>
            <span>{label}</span>
            {i < steps.length - 1 ? (
              <span
                className="mx-1 hidden text-foreground-subtle sm:inline"
                aria-hidden
              >
                →
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </WorkspacePanel>
  );
}

function QuoteNewShell() {
  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Sales" },
          { label: "Quotes", href: "/quotes" },
          { label: "New" },
        ]}
      />
      <PageHeader
        eyebrow="Sales"
        title="New quote"
        description="Authoring and save are not wired yet—list and detail read persisted quotes from your development organization. Send, approve, and payment collection stay out of scope for this phase."
        actions={
          <>
            <Link href="/quotes" className={listLinkClass}>
              ← Quotes list
            </Link>
            <PlaceholderButton title="Create quote server action not implemented yet">
              Save draft (soon)
            </PlaceholderButton>
            <PlaceholderButton title="No send pipeline in this build">
              Send to customer
            </PlaceholderButton>
          </>
        }
      />

      <QuoteBuildOrderStrip />

      <div className="space-y-6">
        <WorkspacePanel>
          <SectionHeading
            title="Customer / lead context"
            description="Pickers and persistence for linking ship with the create-quote phase. Browse existing customers or leads to copy context manually for now."
          />
          <div className="rounded-lg border border-dashed border-border bg-foreground/[0.02] px-4 py-8 text-center sm:py-10">
            <UserRound
              className="mx-auto mb-3 size-9 text-foreground-subtle opacity-70"
              strokeWidth={1.25}
              aria-hidden
            />
            <p className="text-sm text-foreground-muted">
              No customer or lead linked yet—nothing saves on this route until create is implemented.
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
        </WorkspacePanel>

        <WorkspacePanel className="border-border-strong shadow-md ring-1 ring-ring/30">
          <SectionHeading
            title="Line items"
            description="Line items are the commercial anchor on saved quotes. This workspace is a shell until create and editors exist."
            actions={
              <PlaceholderButton title="Line item editor not implemented yet">
                Add line item
              </PlaceholderButton>
            }
          />
          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            <SignalCard
              label="Quoted total (from lines)"
              value="—"
              hint="Appears on detail after line items exist on a saved quote."
            />
            <SignalCard
              label="Line item count"
              value="—"
              hint="Honest empty shell—no sample rows here."
            />
          </div>
          <EmptyState
            icon={ListOrdered}
            title="No line items yet"
            description="Open an existing quote from the list to see persisted line items, or wait for create and editing in a later phase."
          >
            <Link href="/quotes" className={listLinkClass}>
              Browse quotes
            </Link>
          </EmptyState>
        </WorkspacePanel>

        <WorkspacePanel className="border border-border border-l-[3px] border-l-accent">
          <SectionHeading
            title="Payment plan"
            description="Quote-level payment schedules are deferred—no persisted plan rows in this phase."
            actions={
              <PlaceholderButton title="Payment plan editor not implemented yet">
                Add payment step
              </PlaceholderButton>
            }
          />
          <p className="mb-4 rounded-lg border border-border bg-foreground/[0.02] px-3 py-2 text-xs leading-relaxed text-foreground-muted">
            After send and approval exist, terms should not be silently rewritten—versioning and audit belong with those features. Operational payment tracking will live under{" "}
            <Link
              href="/payments"
              className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
            >
              Finance → Payments
            </Link>{" "}
            later.
          </p>
          <EmptyState
            icon={Wallet}
            title="No payment plan yet"
            description="Persisted payment milestones are out of scope until a dedicated phase."
          >
            <PlaceholderButton title="Payment plan editor not implemented yet">
              Add payment step
            </PlaceholderButton>
          </EmptyState>
        </WorkspacePanel>

        <WorkspacePanel
          padding="compact"
          className="border-dashed border-border bg-surface/80"
        >
          <SectionHeading
            title="Execution detail (optional)"
            description="Rough phases and internal notes on quotes are future work—no task engine here."
          />
          <EmptyState
            icon={Wrench}
            title="No execution notes"
            description="Execution planning attaches after activation and job models exist."
          >
            <PlaceholderButton title="No notes store on this route yet">
              Add note
            </PlaceholderButton>
          </EmptyState>
        </WorkspacePanel>

        <WorkspacePanel>
          <SectionHeading
            title="Preview & approval"
            description="Customer-facing preview, PDF, e-sign, and approval capture are explicitly deferred."
          />
          <EmptyState
            icon={Eye}
            title="Preview not built yet"
            description="No customer-facing snapshot or approval recording in this phase."
          >
            <PlaceholderButton title="No preview engine in this build">
              Open preview (soon)
            </PlaceholderButton>
            <PlaceholderButton title="No approval capture in this build">
              Record approval (soon)
            </PlaceholderButton>
          </EmptyState>
        </WorkspacePanel>

        <WorkspacePanel padding="compact">
          <SectionHeading
            title="Notes & activity"
            description="Internal timeline and chatter—separate from any future customer-facing snapshot."
          />
          <EmptyState
            icon={MessageSquare}
            title="No activity yet"
            description="Edits, sends, and handoffs will show here when events exist."
          />
        </WorkspacePanel>

        <HandoffPanel
          title="Quoting spine"
          description="Lines carry scope; payment plans carry money expectations later. This route is an honest shell until create is implemented."
        >
          <Link href="/quotes" className={handoffMutedLinkClass}>
            Quotes list
          </Link>
        </HandoffPanel>
      </div>
    </div>
  );
}

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
            ? "This is the current working quote in your development organization—edits below save to this record. Line totals roll up to the quote; archive freezes edits (restore brings it back). Recorded proposal sends are staff-only proof rows, not delivery or approval. Payments and job activation stay out of scope for this build."
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
          <p className="text-sm font-medium text-foreground">Workspace differs from last recorded send</p>
          <p className="mt-2 text-xs leading-relaxed text-foreground-muted">
            The working quote has changed since your latest recorded send. Review the live proposal preview, then
            record another send when you want updated staff-only proof. This is not customer delivery and not a list
            of editable versions.
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
            title="Payment plan"
            description="Persisted payment schedules are deferred—no rows yet."
            actions={
              <PlaceholderButton title="Payment plan editor not implemented yet">
                Add payment step
              </PlaceholderButton>
            }
          />
          <p className="mb-4 rounded-lg border border-border bg-foreground/[0.02] px-3 py-2 text-xs leading-relaxed text-foreground-muted">
            Send, approval, and customer-visible terms are out of scope. Operational payment tracking will live under{" "}
            <Link
              href="/payments"
              className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
            >
              Finance → Payments
            </Link>{" "}
            later.
          </p>
          <EmptyState
            icon={Wallet}
            title="No payment plan persisted"
            description="Quote-level milestones and deposits ship in a later phase—not stubbed as fake rows here."
          >
            <PlaceholderButton title="Payment plan editor not implemented yet">
              Add payment step
            </PlaceholderButton>
          </EmptyState>
        </WorkspacePanel>

        <WorkspacePanel
          padding="compact"
          className="border-dashed border-border bg-surface/80"
        >
          <SectionHeading
            title="Execution detail (optional)"
            description="Progressive execution fields on quotes are deferred—no task engine."
          />
          <EmptyState
            icon={Wrench}
            title="No execution notes persisted"
            description="Optional quote-time execution hints ship after job and task foundations exist."
          >
            <PlaceholderButton title="No execution store on quotes yet">
              Add note
            </PlaceholderButton>
          </EmptyState>
        </WorkspacePanel>

        <WorkspacePanel>
          <SectionHeading
            title="Preview & approval"
            description="Live internal preview always reflects the current saved quote. PDF, e-sign, and approval capture stay deferred."
          />
          <EmptyState
            icon={Eye}
            title="See the quote as your customer would"
            description="Opens the proposal preview built from this working quote as it exists now. Recorded sends below are separate staff-only proof—not a second editable copy."
          >
            <Link href={`/quotes/${quote.id}/preview`} className={listLinkClass}>
              Preview as customer
            </Link>
            <PlaceholderButton title="No approval capture in this build">
              Record approval (soon)
            </PlaceholderButton>
          </EmptyState>
        </WorkspacePanel>

        {!isDraft ? (
          <WorkspacePanel padding="compact">
            <SectionHeading
              title="Internal notes"
              description="Staff-only notes on the quote record—never a customer-facing snapshot in this phase."
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
            description="Internal timeline when edit and send events exist—no fabricated history."
          />
          <EmptyState
            icon={MessageSquare}
            title="No activity yet"
            description="Event logging for quotes is future work."
          />
        </WorkspacePanel>

        <HandoffPanel
          title="After this quote matures"
          description="This screen is for your team’s draft and archive workflow. Recorded send checkpoints are internal proof only—no implied customer delivery. Approval, payment schedules, and activation stay off this surface until their dedicated phases."
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
  if (props.mode === "new") {
    return <QuoteNewShell />;
  }
  return (
    <QuoteDetailShell
      quote={props.quote}
      lineItemTemplates={props.lineItemTemplates}
      sendCheckpoints={props.sendCheckpoints}
      workspaceDiffersFromLastSend={props.workspaceDiffersFromLastSend}
    />
  );
}
