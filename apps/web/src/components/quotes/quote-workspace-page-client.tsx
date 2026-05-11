"use client";

/**
 * QuoteWorkspacePageClient — client component for the full Quote record page.
 *
 * Renders a tabbed workspace (Overview, Scope, Customer & Lead, Send & Accept,
 * Record) that sits below the server-rendered identity header and readiness panel.
 * Receives pre-fetched data directly — Date objects are serialized transparently
 * by Next.js App Router across the server→client boundary.
 *
 * Tab overview:
 *   Overview       — status, total, lines, linked context, readiness summary
 *   Scope          — QuoteDraftWorkspaceControls (draft) or read-only line items
 *   Customer&Lead  — customer card, lead context, intake notes
 *   Send & Accept  — commercial checkpoints, proposal preview link
 *   Record         — archive controls, internal notes, record details, activity
 */

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronRight, Eye, ListOrdered, MessageSquare, UserRound } from "lucide-react";
import {
  ArchivedQuoteReadOnlyNotice,
  QuoteDraftWorkspaceControls,
} from "@/components/quotes/quote-draft-workspace-controls";
import {
  QuoteArchivedRestorePanel,
  QuoteDraftArchivePanel,
} from "@/components/quotes/quote-archive-controls";
import { QuoteSendCheckpointsStaffPanel } from "@/components/quotes/quote-send-checkpoints-staff-panel";
import {
  QuoteLineDraftExecutionSummary,
  QuoteLineItemScanBlock,
} from "@/components/quotes/quote-line-item-display";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { SignalCard } from "@/components/ui/signal-card";
import {
  formatMoneyCents,
  formatQuoteStatus,
  quoteStatusBadgeTone,
  type QuoteDetailPayload,
  type QuoteSendCheckpointSummary,
} from "@/lib/quote-display";
import {
  quoteStatusAllowsCommercialEdits,
  quoteStatusAllowsExecutionEdits,
  quoteStatusIsArchived,
} from "@/lib/quote-status-workflow";
import { quoteExecutionReviewPreviewPath } from "@/lib/quote-execution-review-path";
import { jobDetailPath } from "@/lib/job-path";
import type { LineItemTemplatePickerRow } from "@/lib/line-item-template-display";
import type { QuoteLineDraftExecutionTaskRow } from "@/components/quotes/quote-line-draft-execution-panel";
import type { ReusableTaskPickerOption } from "@/lib/line-item-template-default-execution-display";
import type { QuoteReadiness } from "@/lib/quote-readiness";

/* ─── Shared style constants ─────────────────────────────────────────────── */

const sectionLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

/* ─── Tab type ───────────────────────────────────────────────────────────── */

type QuoteWorkspaceTab = "overview" | "scope" | "context" | "sendaccept" | "record";

const WS_TABS: { id: QuoteWorkspaceTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "scope", label: "Scope" },
  { id: "context", label: "Customer & Lead" },
  { id: "sendaccept", label: "Send & Accept" },
  { id: "record", label: "Record" },
];

/* ─── Tab: Overview ──────────────────────────────────────────────────────── */

function OverviewTab({
  quote,
  quoteReadiness,
  activatedJobId,
}: {
  quote: QuoteDetailPayload;
  quoteReadiness: QuoteReadiness;
  activatedJobId: string | null;
}) {
  const locale = "en-US";
  const dateOpts: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" };
  const createdAtLabel = new Date(quote.createdAt).toLocaleDateString(locale, dateOpts);
  const updatedAtLabel = new Date(quote.updatedAt).toLocaleDateString(locale, dateOpts);

  return (
    <div className="space-y-4">
      {/* ── Summary cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className={`${sectionLabelClass} mb-1`}>Status</p>
          <StatusBadge
            label={formatQuoteStatus(quote.status)}
            tone={quoteStatusBadgeTone(quote.status)}
          />
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className={`${sectionLabelClass} mb-0.5`}>Total</p>
          <p className="text-sm font-semibold text-foreground tabular-nums">
            {formatMoneyCents(quote.totalCents)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className={`${sectionLabelClass} mb-0.5`}>Lines</p>
          <p className="text-sm font-semibold text-foreground">{quote.lineItems.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className={`${sectionLabelClass} mb-0.5`}>Customer</p>
          <p className="text-sm font-medium text-foreground truncate">
            {quote.customer?.displayName ?? "Not linked"}
          </p>
        </div>
      </div>

      {/* ── Linked context compact ──────────────────────────────────────── */}
      {(quote.customer || quote.lead) && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className={`${sectionLabelClass} mb-3`}>Linked context</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {quote.customer && (
              <div>
                <p className={`${sectionLabelClass} mb-0.5`}>Customer</p>
                <Link
                  href={`/customers/${quote.customer.id}`}
                  className="text-sm font-medium text-foreground hover:underline underline-offset-2 inline-flex items-center gap-1"
                >
                  {quote.customer.displayName}
                  <ArrowUpRight className="w-3 h-3 opacity-50" strokeWidth={1.5} />
                </Link>
              </div>
            )}
            {quote.lead && (
              <div>
                <p className={`${sectionLabelClass} mb-0.5`}>Lead</p>
                <Link
                  href={`/sales/${quote.lead.id}`}
                  className="text-sm font-medium text-foreground hover:underline underline-offset-2 inline-flex items-center gap-1"
                >
                  {quote.lead.title}
                  <ArrowUpRight className="w-3 h-3 opacity-50" strokeWidth={1.5} />
                </Link>
                {quote.lead.contactName && (
                  <p className="text-xs text-foreground-muted mt-0.5">{quote.lead.contactName}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Active job link ─────────────────────────────────────────────── */}
      {activatedJobId && (
        <Link
          href={jobDetailPath(activatedJobId)}
          className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 hover:border-border-strong transition-colors"
        >
          <div>
            <p className={sectionLabelClass}>Active job</p>
            <p className="mt-0.5 text-sm font-medium text-foreground">Job activated from this quote</p>
          </div>
          <ArrowUpRight className="w-4 h-4 text-foreground-subtle" strokeWidth={1.5} />
        </Link>
      )}

      {/* ── Revision drift warning ──────────────────────────────────────── */}
      {quoteReadiness.showsRevisionDrift && (
        <div className="rounded-xl border border-border bg-foreground/[0.02] px-4 py-3">
          <p className="text-sm font-medium text-foreground">Quote revised since last send</p>
          <p className="mt-0.5 text-xs leading-relaxed text-foreground-muted">
            The quote record has been updated after the most recent send checkpoint. The customer
            may not have seen the latest scope and pricing.
          </p>
        </div>
      )}

      {/* ── Record details (collapsible) ────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
            <ChevronRight
              className="size-3.5 shrink-0 text-foreground-subtle transition-transform group-open:rotate-90"
              aria-hidden
            />
            <span className={sectionLabelClass}>Record details</span>
            <span className="ml-auto text-[0.65rem] text-foreground-subtle">
              Created {createdAtLabel}
            </span>
          </summary>
          <div className="mt-4 space-y-3 border-t border-border pt-4">
            <dl className="grid gap-2 text-xs sm:grid-cols-2">
              <div>
                <dt className={sectionLabelClass}>Created</dt>
                <dd className="mt-0.5 text-foreground-muted">{createdAtLabel}</dd>
              </div>
              <div>
                <dt className={sectionLabelClass}>Updated</dt>
                <dd className="mt-0.5 text-foreground-muted">{updatedAtLabel}</dd>
              </div>
            </dl>
            <div>
              <p className={sectionLabelClass}>Record ID</p>
              <p className="mt-1 break-all font-mono text-xs text-foreground-muted">{quote.id}</p>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}

/* ─── Tab: Scope ─────────────────────────────────────────────────────────── */

function ScopeTab({
  quote,
  lineItemTemplates,
  draftTasksByLineId,
  reusableTaskOptions,
}: {
  quote: QuoteDetailPayload;
  lineItemTemplates: LineItemTemplatePickerRow[];
  draftTasksByLineId: Record<string, QuoteLineDraftExecutionTaskRow[]>;
  reusableTaskOptions: ReusableTaskPickerOption[];
}) {
  const isCommercialEditable = quoteStatusAllowsCommercialEdits(quote.status);
  const executionPlanningEditable = quoteStatusAllowsExecutionEdits(quote.status);
  const isArchived = quoteStatusIsArchived(quote.status);
  const lineCount = quote.lineItems.length;

  if (isCommercialEditable) {
    return (
      <QuoteDraftWorkspaceControls
        id="line-items"
        quoteId={quote.id}
        initialTitle={quote.title}
        initialInternalNotes={quote.internalNotes}
        initialCustomerDocumentTitle={quote.customerDocumentTitle}
        hasLeadNotes={Boolean(quote.lead?.notes)}
        subtotalCents={quote.subtotalCents}
        totalCents={quote.totalCents}
        lineItems={quote.lineItems}
        lineItemTemplates={lineItemTemplates}
        draftTasksByLineId={draftTasksByLineId}
        reusableTaskOptions={reusableTaskOptions}
      />
    );
  }

  return (
    <WorkspacePanel id="line-items" className="border-border-strong shadow-md ring-1 ring-ring/30">
      <SectionHeading
        title="Line items"
        description={
          isArchived
            ? "Read-only scope rows as stored when archived. Restore to draft to edit."
            : "Commercial scope and pricing are read-only after send. Internal draft execution can still be edited from each line."
        }
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
        <SignalCard label="Lines" value={String(lineCount)} hint="Persisted rows, ordered for display." />
      </div>
      {lineCount === 0 ? (
        <EmptyState
          icon={ListOrdered}
          title="No line items"
          description={
            isArchived
              ? "No scope rows were captured before archive. Restore to draft to add line items."
              : "No scope rows on this quote."
          }
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {quote.lineItems.map((line) => (
            <li key={line.id} className="px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <QuoteLineItemScanBlock line={line} />
                  <QuoteLineDraftExecutionSummary
                    quoteId={quote.id}
                    line={line}
                    isExecutionEditable={executionPlanningEditable}
                    draftTasks={draftTasksByLineId[line.id] ?? []}
                    reusableOptions={reusableTaskOptions}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </WorkspacePanel>
  );
}

/* ─── Tab: Customer & Lead ───────────────────────────────────────────────── */

function ContextTab({ quote }: { quote: QuoteDetailPayload }) {
  const hasCustomer = quote.customer != null;
  const hasLead = quote.lead != null;

  return (
    <div className="space-y-4">
      {/* ── Customer ─────────────────────────────────────────────────────── */}
      <WorkspacePanel>
        <SectionHeading
          title="Customer"
          description="The customer this quote is issued for. Open the record to edit or update the link."
        />
        {hasCustomer ? (
          <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3">
            <div>
              <p className={sectionLabelClass}>Linked customer</p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {quote.customer!.displayName}
              </p>
            </div>
            <Link href={`/customers/${quote.customer!.id}`} className={listLinkClass}>
              Customer record
              <ArrowUpRight className="w-3 h-3 ml-1" strokeWidth={1.5} />
            </Link>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-foreground/[0.02] px-4 py-8 text-center sm:py-10">
            <UserRound
              className="mx-auto mb-3 size-9 text-foreground-subtle opacity-70"
              strokeWidth={1.25}
              aria-hidden
            />
            <p className="text-sm text-foreground-muted">No customer linked to this quote.</p>
            <p className="mt-1 text-xs leading-relaxed text-foreground-subtle max-w-xs mx-auto">
              Linking is optional. When set, it connects this quote to a billing record for your team.
            </p>
            <Link href="/customers" className={`mt-4 ${listLinkClass}`}>
              Customers
            </Link>
          </div>
        )}
      </WorkspacePanel>

      {/* ── Lead ─────────────────────────────────────────────────────────── */}
      <WorkspacePanel>
        <SectionHeading
          title="Lead"
          description="The lead this quote is tied to. Intake notes and contact context are shown when linked."
        />
        {hasLead ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3">
              <div>
                <p className={sectionLabelClass}>Linked lead</p>
                <p className="mt-1 text-sm font-medium text-foreground">{quote.lead!.title}</p>
              </div>
              <Link href={`/sales/${quote.lead!.id}`} className={listLinkClass}>
                Lead record
                <ArrowUpRight className="w-3 h-3 ml-1" strokeWidth={1.5} />
              </Link>
            </div>

            {/* Lead intake context */}
            <div className="rounded-lg border border-border bg-foreground/[0.01] px-4 py-5">
              <h4 className="mb-4 text-[0.65rem] font-bold uppercase tracking-wider text-foreground-subtle">
                Lead intake context
              </h4>
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-4">
                  {quote.lead!.source && (
                    <div>
                      <p className={sectionLabelClass}>Source</p>
                      <p className="mt-1 text-sm text-foreground">{quote.lead!.source}</p>
                    </div>
                  )}
                  {(quote.lead!.contactName || quote.lead!.email || quote.lead!.phone) && (
                    <div>
                      <p className={sectionLabelClass}>Contact</p>
                      <div className="mt-1 space-y-0.5 text-sm">
                        {quote.lead!.contactName && (
                          <p className="text-foreground">{quote.lead!.contactName}</p>
                        )}
                        {quote.lead!.email && (
                          <p className="text-foreground-muted">{quote.lead!.email}</p>
                        )}
                        {quote.lead!.phone && (
                          <p className="text-foreground-muted">{quote.lead!.phone}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <p className={sectionLabelClass}>Intake notes</p>
                  <div className="mt-2">
                    {quote.lead!.notes ? (
                      <div className="rounded border border-border bg-surface px-3 py-2 text-sm leading-relaxed text-foreground">
                        {quote.lead!.notes}
                      </div>
                    ) : (
                      <p className="text-sm text-foreground-muted italic">No intake notes provided.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-foreground/[0.02] px-4 py-6 text-center">
            <p className="text-sm text-foreground-muted">No lead linked to this quote.</p>
            <p className="mt-1 text-xs text-foreground-subtle">
              Linking is optional. Use it when this quote comes from a tracked lead.
            </p>
            <Link href="/sales" className={`mt-4 ${listLinkClass}`}>
              Leads
            </Link>
          </div>
        )}
      </WorkspacePanel>
    </div>
  );
}

/* ─── Tab: Send & Accept ─────────────────────────────────────────────────── */

function SendAcceptTab({
  quote,
  sendCheckpoints,
  approvalCheckpoints,
  activatedJobId,
}: {
  quote: QuoteDetailPayload;
  sendCheckpoints: QuoteSendCheckpointSummary[];
  approvalCheckpoints: QuoteSendCheckpointSummary[];
  activatedJobId: string | null;
}) {
  return (
    <div className="space-y-4">
      <QuoteSendCheckpointsStaffPanel
        id="commercial-send-acceptance"
        quoteId={quote.id}
        quoteStatus={quote.status}
        sendCheckpoints={sendCheckpoints}
        approvalCheckpoints={approvalCheckpoints}
      />

      {/* Proposal preview */}
      <WorkspacePanel>
        <SectionHeading
          title="Proposal preview"
          description="Internal preview from the current saved quote — not a customer portal. Commercial checkpoints above capture send and acceptance separately."
        />
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/quotes/${quote.id}/preview`} className={listLinkClass}>
            <Eye className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.5} />
            Open live proposal preview
          </Link>
          <Link href={quoteExecutionReviewPreviewPath(quote.id)} className={listLinkClass}>
            Open execution preview
          </Link>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-foreground-muted">
          E-sign and automated delivery are not wired in this build — use Send quote and Mark
          approved as staff workflow steps when those moments matter.
        </p>
      </WorkspacePanel>

      {/* Active job (when activated) */}
      {activatedJobId && (
        <WorkspacePanel>
          <SectionHeading
            title="Active job"
            description="This quote has been activated into a running job."
          />
          <Link href={jobDetailPath(activatedJobId)} className={listLinkClass}>
            Open job
            <ArrowUpRight className="w-3 h-3 ml-1" strokeWidth={1.5} />
          </Link>
        </WorkspacePanel>
      )}
    </div>
  );
}

/* ─── Tab: Record ────────────────────────────────────────────────────────── */

function RecordTab({ quote }: { quote: QuoteDetailPayload }) {
  const isArchived = quoteStatusIsArchived(quote.status);
  const isCommercialEditable = quoteStatusAllowsCommercialEdits(quote.status);
  const locale = "en-US";
  const dateOpts: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" };
  const createdAtLabel = new Date(quote.createdAt).toLocaleDateString(locale, dateOpts);
  const updatedAtLabel = new Date(quote.updatedAt).toLocaleDateString(locale, dateOpts);

  return (
    <div className="space-y-4">
      {/* Archive / Restore controls */}
      {isArchived ? (
        <>
          <ArchivedQuoteReadOnlyNotice />
          <QuoteArchivedRestorePanel id="archive-restore" quoteId={quote.id} />
        </>
      ) : (
        <QuoteDraftArchivePanel id="archive-restore" quoteId={quote.id} />
      )}

      {/* Internal notes — read-only when not editable (draft shows notes in Scope via QuoteDraftDetailsForm) */}
      {!isCommercialEditable && (
        <WorkspacePanel padding="compact">
          <SectionHeading
            title="Internal notes"
            description="Staff-only notes on the quote record — omitted from proposal preview and commercial checkpoint payloads."
          />
          {quote.internalNotes ? (
            <p className="rounded-lg border border-border bg-foreground/[0.02] px-4 py-3 text-sm leading-relaxed text-foreground-muted">
              {quote.internalNotes}
            </p>
          ) : (
            <p className="text-sm text-foreground-muted">No internal notes on this quote.</p>
          )}
        </WorkspacePanel>
      )}

      {/* Activity placeholder */}
      <WorkspacePanel padding="compact">
        <SectionHeading
          title="Notes & activity"
          description="When edit and checkpoint events exist, they will surface here. No fabricated history is shown."
        />
        <EmptyState
          icon={MessageSquare}
          title="No activity yet"
          description="Nothing logged on this quote yet."
        />
      </WorkspacePanel>

      {/* Record details */}
      <WorkspacePanel padding="compact">
        <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle mb-3">
          Record details
        </p>
        <dl className="space-y-3 text-xs">
          <div>
            <dt className={sectionLabelClass}>Record ID</dt>
            <dd className="mt-0.5 break-all font-mono text-foreground-muted">{quote.id}</dd>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className={sectionLabelClass}>Created</dt>
              <dd className="mt-0.5 text-foreground-muted">{createdAtLabel}</dd>
            </div>
            <div>
              <dt className={sectionLabelClass}>Updated</dt>
              <dd className="mt-0.5 text-foreground-muted">{updatedAtLabel}</dd>
            </div>
          </div>
        </dl>
      </WorkspacePanel>
    </div>
  );
}

/* ─── Main export ────────────────────────────────────────────────────────── */

export type QuoteWorkspacePageClientProps = {
  quote: QuoteDetailPayload;
  lineItemTemplates: LineItemTemplatePickerRow[];
  sendCheckpoints: QuoteSendCheckpointSummary[];
  approvalCheckpoints: QuoteSendCheckpointSummary[];
  activatedJobId: string | null;
  draftTasksByLineId: Record<string, QuoteLineDraftExecutionTaskRow[]>;
  reusableTaskOptions: ReusableTaskPickerOption[];
  quoteReadiness: QuoteReadiness;
};

export function QuoteWorkspacePageClient({
  quote,
  lineItemTemplates,
  sendCheckpoints,
  approvalCheckpoints,
  activatedJobId,
  draftTasksByLineId,
  reusableTaskOptions,
  quoteReadiness,
}: QuoteWorkspacePageClientProps) {
  const [activeTab, setActiveTab] = useState<QuoteWorkspaceTab>("overview");

  return (
    <div>
      {/* ── Tab bar ─────────────────────────────────────────────────────── */}
      <div className="mb-4 inline-flex rounded-lg bg-surface border border-border p-1 gap-0.5">
        {WS_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={[
              "rounded-md px-4 py-1.5 text-xs font-medium transition-colors",
              activeTab === t.id
                ? "bg-background text-foreground shadow-sm"
                : "text-foreground-subtle hover:text-foreground",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ─────────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <OverviewTab
          quote={quote}
          quoteReadiness={quoteReadiness}
          activatedJobId={activatedJobId}
        />
      )}
      {activeTab === "scope" && (
        <ScopeTab
          quote={quote}
          lineItemTemplates={lineItemTemplates}
          draftTasksByLineId={draftTasksByLineId}
          reusableTaskOptions={reusableTaskOptions}
        />
      )}
      {activeTab === "context" && <ContextTab quote={quote} />}
      {activeTab === "sendaccept" && (
        <SendAcceptTab
          quote={quote}
          sendCheckpoints={sendCheckpoints}
          approvalCheckpoints={approvalCheckpoints}
          activatedJobId={activatedJobId}
        />
      )}
      {activeTab === "record" && <RecordTab quote={quote} />}
    </div>
  );
}
