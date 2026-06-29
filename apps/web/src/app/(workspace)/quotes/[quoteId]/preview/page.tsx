import Link from "next/link";
import { QuoteCheckpointKind, QuoteStatus } from "@prisma/client";
import { QuoteRecordSendCheckpointForm } from "@/components/quotes/quote-record-send-checkpoint-form";
import { QuoteLiveProposalPreviewLineBlock } from "@/components/quotes/quote-line-item-display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { db } from "@/lib/db";
import { getCommercialRequestContextOrNull } from "@/lib/auth-context";
import {
  buildCustomerQuotePreviewDocument,
  type QuoteCustomerPreviewDocument,
} from "@/lib/quote-customer-projection";
import {
  quoteRowToCustomerPreviewInput,
  quoteSelectForLiveCustomerPreviewPage,
} from "@/lib/quote-checkpoint-snapshot";
import {
  formatMoneyCents,
  formatPaymentAnchorLabel,
} from "@/lib/quote-display";
import { FileText } from "lucide-react";
import { AccessDeniedPanel } from "@/components/ui/access-denied-panel";
import { quoteAuthoringHref } from "@/lib/opportunity-tab-routing";
import {
  QUOTE_STAFF_PREVIEW_PAGE_DESCRIPTION,
  QUOTE_STAFF_PREVIEW_PAGE_TITLE,
} from "@/lib/quote-customer-proposal-ux";

export const dynamic = "force-dynamic";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

const fieldLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";

function CustomerProposalDocument({ document }: { document: QuoteCustomerPreviewDocument }) {
  const totalScheduledCents = document.paymentSchedule.reduce(
    (sum, milestone) => sum + milestone.amountCents,
    0,
  );

  return (
    <section
      aria-label="Customer proposal document"
      className="rounded-3xl border border-border bg-surface px-5 py-7 shadow-lg ring-1 ring-border/50 sm:px-8 sm:py-10"
    >
      <header className="flex flex-col gap-6 border-b border-border pb-8 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-foreground-subtle">
            Proposal from
          </p>
          <p className="mt-2 text-lg font-semibold tracking-tight text-foreground">
            {document.organizationDisplayName}
          </p>
          <h2 className="mt-6 text-3xl font-semibold tracking-tight text-foreground">
            {document.documentTitle}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground-muted">
            Review the scope, pricing, and payment terms below. To approve, use the secure acceptance link sent by the contractor.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-foreground/[0.02] px-5 py-4 text-left sm:min-w-44 sm:text-right">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-foreground-subtle">
            Proposal total
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
            {formatMoneyCents(document.totalCents)}
          </p>
        </div>
      </header>

      {document.customer || document.lead ? (
        <section className="border-b border-border py-8">
          <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground-subtle">
            Prepared for
          </h3>
          <dl className="mt-4 grid gap-5 sm:grid-cols-2">
            {document.customer ? (
              <div>
                <dt className={fieldLabelClass}>Customer</dt>
                <dd className="mt-1 text-sm font-medium text-foreground">
                  {document.customer.displayName}
                </dd>
              </div>
            ) : null}
            {document.lead ? (
              <div>
                <dt className={fieldLabelClass}>Project</dt>
                <dd className="mt-1 text-sm font-medium text-foreground">{document.lead.title}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      <section className="border-b border-border py-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground-subtle">
              Scope of work
            </h3>
            <p className="mt-2 text-sm text-foreground-muted">
              Work included in this proposal.
            </p>
          </div>
        </div>
        {document.lineItems.length === 0 ? (
          <p className="mt-5 rounded-2xl border border-border bg-foreground/[0.02] px-4 py-4 text-sm text-foreground-muted">
            No scope items have been added yet.
          </p>
        ) : (
          <ul className="mt-5 divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {document.lineItems.map((line, index) => {
              const prev = document.lineItems[index - 1];
              const showGroupHeader =
                line.presentationGroup != null &&
                line.presentationGroup !== "" &&
                (!prev || prev.presentationGroup !== line.presentationGroup);
              return (
                <li key={line.id} className="bg-surface px-5 py-5">
                  {showGroupHeader ? (
                    <p
                      className={`${fieldLabelClass} mb-4 border-b border-border pb-2 text-foreground`}
                    >
                      {line.presentationGroup}
                    </p>
                  ) : null}
                  <QuoteLiveProposalPreviewLineBlock line={line} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {document.paymentSchedule.length > 0 ? (
        <section className="border-b border-border py-8">
          <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground-subtle">
            Payment terms
          </h3>
          <ul className="mt-5 divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {document.paymentSchedule.map((milestone) => (
              <li
                key={milestone.id}
                className="flex flex-col gap-2 bg-surface px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{milestone.title}</p>
                  <p className="mt-1 text-xs text-foreground-muted">
                    {formatPaymentAnchorLabel(milestone.anchorType, milestone.anchorStageName)}
                  </p>
                </div>
                <p className="text-sm font-semibold tabular-nums text-foreground">
                  {formatMoneyCents(milestone.amountCents)}
                </p>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between rounded-2xl border border-border bg-foreground/[0.02] px-5 py-4">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground-subtle">
              Scheduled payments
            </span>
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {formatMoneyCents(totalScheduledCents)}
            </span>
          </div>
        </section>
      ) : null}

      <section className="pt-8">
        <div className="ml-auto max-w-sm space-y-3">
          <div className="flex items-center justify-between text-sm text-foreground-muted">
            <span>Subtotal</span>
            <span className="tabular-nums text-foreground">
              {formatMoneyCents(document.subtotalCents)}
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-border pt-3">
            <span className="text-base font-semibold text-foreground">Total</span>
            <span className="text-2xl font-semibold tabular-nums text-foreground">
              {formatMoneyCents(document.totalCents)}
            </span>
          </div>
        </div>
      </section>
    </section>
  );
}

export default async function QuoteLiveProposalPreviewPage({
  params,
}: {
  params: Promise<{ quoteId: string }>;
}) {
  const { quoteId } = await params;
  const ctx = await getCommercialRequestContextOrNull();
  if (!ctx) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title={QUOTE_STAFF_PREVIEW_PAGE_TITLE}
          description={QUOTE_STAFF_PREVIEW_PAGE_DESCRIPTION}
        />
        <AccessDeniedPanel description="This role cannot preview quote records." />
      </div>
    );
  }

  const row = await db.quote.findFirst({
    where: {
      id: quoteId,
      organizationId: ctx.organizationId,
    },
    select: quoteSelectForLiveCustomerPreviewPage,
  });

  if (!row) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader
          eyebrow="Sales · internal only"
          title={QUOTE_STAFF_PREVIEW_PAGE_TITLE}
          description="No quote exists for this id in the current development organization."
          actions={
            <Link href="/leads" className={listLinkClass}>
              ← Sales pipeline
            </Link>
          }
        />
        <WorkspacePanel padding="compact" className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
            Requested id
          </p>
          <p className="mt-1 break-all font-mono text-sm text-foreground">{quoteId}</p>
        </WorkspacePanel>
        <EmptyState
          icon={FileText}
          title="Quote not found"
          description="This id is not a quote record in the development organization, or it belongs to another tenant."
        >
          <Link href="/leads" className={listLinkClass}>
            Back to Sales pipeline
          </Link>
        </EmptyState>
      </div>
    );
  }

  const latestSendCheckpoint = await db.quoteCheckpoint.findFirst({
    where: {
      quoteId: row.id,
      organizationId: ctx.organizationId,
      kind: QuoteCheckpointKind.SEND,
    },
    orderBy: { sequence: "desc" },
    select: { id: true },
  });

  const input = quoteRowToCustomerPreviewInput(row, ctx.organizationId);

  const { document: preview, staffOnly } = buildCustomerQuotePreviewDocument(input, {
    organizationDisplayName: ctx.organizationName,
  });

  const isArchived = row.status === QuoteStatus.ARCHIVED;
  const asOfLabel = new Date(preview.updatedAt).toLocaleString();
  const showTitleFallbackWarning = staffOnly.anyLineUsesInternalDescriptionForTitle;
  const quoteHref = quoteAuthoringHref({ quoteId: preview.quoteId, leadId: row.leadId });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Sales · internal only"
        title={QUOTE_STAFF_PREVIEW_PAGE_TITLE}
        description={QUOTE_STAFF_PREVIEW_PAGE_DESCRIPTION}
        actions={
          <>
            <Link href={quoteHref} className={listLinkClass}>
              ← Back to quote
            </Link>
            <Link href="/leads" className={listLinkClass}>
              Sales pipeline
            </Link>
          </>
        }
      />

      <WorkspacePanel
        padding="compact"
        className="mb-6 border border-border border-l-[3px] border-l-accent bg-foreground/[0.02]"
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge label="Live draft" tone="draft" />
            </div>
            <p className="mt-2 max-w-3xl text-xs leading-relaxed text-foreground-muted">
              This preview reflects the current workspace quote. It is not the sent customer record.
            </p>
            <p className="mt-2 text-xs text-foreground-muted">
              Generated from latest draft update: {asOfLabel}
            </p>
            {latestSendCheckpoint ? (
              <p className="mt-3 text-xs leading-relaxed text-foreground-muted">
                A sent proposal record exists for this quote. Compare it before sending again if the draft changed.
              </p>
            ) : null}
            {isArchived ? (
              <p className="mt-3 text-xs leading-relaxed text-foreground-muted">
                This quote is archived in your workspace. This page remains a staff-only draft preview.
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row lg:items-start">
            <Link href={quoteHref} className={listLinkClass}>
              ← Back to quote
            </Link>
            {latestSendCheckpoint ? (
              <Link
                href={`/quotes/${preview.quoteId}/checkpoints/${latestSendCheckpoint.id}`}
                className={listLinkClass}
              >
                View sent proposal
              </Link>
            ) : null}
            {!isArchived ? (
              <QuoteRecordSendCheckpointForm quoteId={preview.quoteId} layout="compact" />
            ) : null}
          </div>
        </div>
      </WorkspacePanel>

      {showTitleFallbackWarning ? (
        <WorkspacePanel
          padding="compact"
          className="mb-6 border border-border border-l-[3px] border-l-danger/60 bg-danger/[0.03]"
        >
          <p className="text-sm font-medium text-foreground">Staff-only: proposal title fallback</p>
          <p className="mt-2 text-xs leading-relaxed text-foreground-muted">
            At least one line is using your internal line description as the proposal line title because no proposal
            scope title is set. Set optional proposal scope titles on those lines if internal wording should not read as
            the line title in preview.
          </p>
        </WorkspacePanel>
      ) : null}

      <div className="rounded-[2rem] border border-border bg-foreground/[0.03] px-3 py-8 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-4xl">
          <CustomerProposalDocument document={preview} />
        </div>
      </div>
    </div>
  );
}
