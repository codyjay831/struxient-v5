import Link from "next/link";
import { QuoteCheckpointKind, QuoteStatus } from "@prisma/client";
import { QuoteCustomerPreviewLineBlock } from "@/components/quotes/quote-line-item-display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { SignalCard } from "@/components/ui/signal-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { db, getDevOrganizationOrThrow } from "@/lib/db";
import { buildCustomerQuotePreviewDocument } from "@/lib/quote-customer-projection";
import {
  quoteRowToCustomerPreviewInput,
  quoteSelectForLiveCustomerPreviewPage,
} from "@/lib/quote-checkpoint-snapshot";
import {
  formatMoneyCents,
  formatQuoteStatus,
  quoteStatusBadgeTone,
} from "@/lib/quote-display";
import { FileText } from "lucide-react";

export const dynamic = "force-dynamic";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

const fieldLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";

export default async function QuoteCustomerPreviewPage({
  params,
}: {
  params: Promise<{ quoteId: string }>;
}) {
  const { quoteId } = await params;
  const org = await getDevOrganizationOrThrow();

  const row = await db.quote.findFirst({
    where: {
      id: quoteId,
      organizationId: org.id,
    },
    select: quoteSelectForLiveCustomerPreviewPage,
  });

  if (!row) {
    return (
      <div className="mx-auto max-w-5xl">
        <WorkspaceBreadcrumb
          items={[
            { label: "Sales" },
            { label: "Quotes", href: "/quotes" },
            { label: "Not found" },
          ]}
        />
        <PageHeader
          eyebrow="Sales"
          title="Customer preview"
          description="No quote exists for this id in the current development organization."
          actions={
            <Link href="/quotes" className={listLinkClass}>
              ← Quotes list
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
          <Link href="/quotes" className={listLinkClass}>
            Back to quotes
          </Link>
        </EmptyState>
      </div>
    );
  }

  const latestSendCheckpoint = await db.quoteCheckpoint.findFirst({
    where: {
      quoteId: row.id,
      organizationId: org.id,
      kind: QuoteCheckpointKind.SEND,
    },
    orderBy: { sequence: "desc" },
    select: { id: true },
  });

  const input = quoteRowToCustomerPreviewInput(row, org.id);

  const { document: preview, staffOnly } = buildCustomerQuotePreviewDocument(input, {
    organizationDisplayName: org.name,
  });

  const isArchived = row.status === QuoteStatus.ARCHIVED;
  const asOfLabel = new Date(preview.updatedAt).toLocaleString();
  const createdLabel = new Date(preview.createdAt).toLocaleString();
  const showTitleFallbackWarning = staffOnly.anyLineUsesInternalDescriptionForTitle;

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Sales" },
          { label: "Quotes", href: "/quotes" },
          { label: row.title, href: `/quotes/${preview.quoteId}` },
          { label: "Customer preview" },
        ]}
      />

      <PageHeader
        eyebrow="Sales · internal only"
        title="Proposal preview"
        description="Internal preview — not sent to the customer. This page simulates how the proposal could read; it is not delivery, approval, or a public link."
        actions={
          <>
            <Link href={`/quotes/${preview.quoteId}`} className={listLinkClass}>
              ← Back to quote
            </Link>
            <Link href="/quotes" className={listLinkClass}>
              Quotes list
            </Link>
          </>
        }
      />

      <WorkspacePanel
        padding="compact"
        className="mb-6 border border-border border-l-[3px] border-l-accent bg-foreground/[0.02]"
      >
        <p className="text-sm font-medium text-foreground">
          Internal preview — not sent to the customer.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-foreground-muted">
          This route always reflects the live workspace quote — it does not switch to checkpoint mode. It does not
          email, text, or create a shareable customer link. Totals and lines reflect the stored quote as of the
          timestamps below.
        </p>
        {latestSendCheckpoint ? (
          <p className="mt-3 text-xs leading-relaxed text-foreground-muted">
            Recorded send checkpoints may differ from what you see here.{" "}
            <Link
              href={`/quotes/${preview.quoteId}/checkpoints/${latestSendCheckpoint.id}`}
              className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
            >
              Open latest recorded send checkpoint
            </Link>
            .
          </p>
        ) : null}
        {isArchived ? (
          <p className="mt-3 text-xs leading-relaxed text-foreground-muted">
            This quote is archived in your workspace. The layout below is still a simulation only—it
            does not mean the customer was sent this document.
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StatusBadge label={formatQuoteStatus(row.status)} tone={quoteStatusBadgeTone(row.status)} />
          <span className="text-xs text-foreground-muted">
            Staff-only workspace status—not part of a customer-facing proposal.
          </span>
        </div>
      </WorkspacePanel>

      {showTitleFallbackWarning ? (
        <WorkspacePanel
          padding="compact"
          className="mb-6 border border-border border-l-[3px] border-l-danger/60 bg-danger/[0.03]"
        >
          <p className="text-sm font-medium text-foreground">Staff-only: proposal title fallback</p>
          <p className="mt-2 text-xs leading-relaxed text-foreground-muted">
            At least one line is using your internal line description as the customer-facing line
            title because no customer scope title is set. Set optional customer scope titles on those
            lines if the internal wording is not appropriate for a proposal.
          </p>
        </WorkspacePanel>
      ) : null}

      <WorkspacePanel className="border-border-strong bg-surface shadow-sm ring-1 ring-border/60">
        <div className="border-b border-border pb-6">
          <p className={`${fieldLabelClass} text-foreground-subtle`}>
            {preview.organizationDisplayName}
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
            {preview.documentTitle}
          </h2>
          <p className="mt-2 break-all font-mono text-xs text-foreground-muted">
            Reference: {preview.quoteId}
          </p>
        </div>

        {preview.customer || preview.lead ? (
          <div className="border-b border-border py-6">
            <SectionHeading
              title="Prepared for"
              description="Display names only—no links on this simulated proposal."
            />
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className={fieldLabelClass}>Customer</dt>
                <dd className="mt-1 text-sm text-foreground">
                  {preview.customer?.displayName ?? "—"}
                </dd>
              </div>
              <div>
                <dt className={fieldLabelClass}>Inquiry title</dt>
                <dd className="mt-1 text-sm text-foreground">{preview.lead?.title ?? "—"}</dd>
              </div>
            </dl>
          </div>
        ) : null}

        <div className="py-6">
          <SectionHeading
            title="Scope"
            description="Sellable rows with optional grouping labels for display only—not workflow stages."
          />
          {preview.lineItems.length === 0 ? (
            <p className="mt-4 text-sm text-foreground-muted">
              No line items on this quote yet—there is nothing to price here.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border rounded-lg border border-border bg-surface">
              {preview.lineItems.map((line, index) => {
                const prev = preview.lineItems[index - 1];
                const showGroupHeader =
                  line.presentationGroup != null &&
                  line.presentationGroup !== "" &&
                  (!prev || prev.presentationGroup !== line.presentationGroup);
                return (
                  <li key={line.id} className="px-4 py-4">
                    {showGroupHeader ? (
                      <p
                        className={`${fieldLabelClass} mb-3 border-b border-border pb-2 text-foreground`}
                      >
                        {line.presentationGroup}
                      </p>
                    ) : null}
                    <QuoteCustomerPreviewLineBlock line={line} />
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-border pt-6">
          <div className="mb-6 grid gap-3 sm:grid-cols-2">
            <SignalCard
              label="Subtotal"
              value={formatMoneyCents(preview.subtotalCents)}
              hint="Stored on the quote row (server)."
            />
            <SignalCard
              label="Total"
              value={formatMoneyCents(preview.totalCents)}
              hint="Same as subtotal for now—no tax or fees in this foundation."
            />
          </div>
          <dl className="grid gap-3 text-xs text-foreground-muted sm:grid-cols-2">
            <div>
              <dt className={fieldLabelClass}>From workspace record</dt>
              <dd className="mt-0.5 text-foreground">{createdLabel}</dd>
            </div>
            <div>
              <dt className={fieldLabelClass}>Last updated (preview as-of)</dt>
              <dd className="mt-0.5 text-foreground">{asOfLabel}</dd>
            </div>
          </dl>
        </div>
      </WorkspacePanel>
    </div>
  );
}
