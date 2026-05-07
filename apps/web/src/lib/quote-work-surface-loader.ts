import "server-only";

import { QuoteCheckpointKind, QuoteStatus } from "@prisma/client";
import { db } from "@/lib/db";
import {
  evaluateQuoteJobActivationReadiness,
} from "@/lib/quote-job-activation-readiness";
import { getQuoteReadiness, type QuoteReadiness } from "@/lib/quote-readiness";
import { formatQuoteStatus, quoteStatusBadgeTone } from "@/lib/quote-display";
import type { QuoteWorkSurfaceData } from "@/lib/quote-work-surface-data";

const dateOpts: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
};

export type QuoteWorkSurfaceLoaderResult = {
  quote: QuoteWorkSurfaceData;
  readiness: QuoteReadiness;
};

/**
 * Org-scoped fetch + derive everything `QuoteWorkSurface` needs.
 *
 * Used by:
 *   - Workstation quote drawer (compact mode)
 *   - Lead full page / Workstation lead drawer (active-quote standard embed)
 *
 * The full Quote page (`/quotes/[quoteId]`) keeps its own bespoke loader because
 * it also fetches scope-tab fields (templates, draft tasks, etc). It can call
 * {@link buildQuoteWorkSurfaceFromInputs} below if it wants to share the derive
 * step.
 *
 * Includes the readiness signals that the Workstation drawer was previously
 * missing (latestSendAt / latestApprovalAt / revisionDriftSinceLastProof) so
 * its badges match the full Quote page.
 */
export async function loadQuoteWorkSurface(
  quoteId: string,
  orgId: string,
): Promise<QuoteWorkSurfaceLoaderResult | null> {
  const row = await db.quote.findFirst({
    where: { id: quoteId, organizationId: orgId },
    select: {
      id: true,
      title: true,
      status: true,
      subtotalCents: true,
      totalCents: true,
      createdAt: true,
      updatedAt: true,
      customerId: true,
      customer: { select: { id: true, displayName: true, organizationId: true } },
      leadId: true,
      lead: { select: { id: true, title: true, organizationId: true } },
      job: { select: { id: true, status: true, organizationId: true } },
      lineItems: {
        select: {
          id: true,
          description: true,
          executionReviewStatus: true,
          executionMergeMode: true,
          _count: { select: { draftExecutionTasks: true } },
        },
      },
    },
  });

  if (!row) return null;

  const customer =
    row.customer && row.customer.organizationId === orgId
      ? { id: row.customer.id, displayName: row.customer.displayName }
      : null;
  const lead =
    row.lead && row.lead.organizationId === orgId
      ? { id: row.lead.id, title: row.lead.title }
      : null;
  const job =
    row.job && row.job.organizationId === orgId
      ? { id: row.job.id, status: row.job.status }
      : null;

  const activationReadiness = evaluateQuoteJobActivationReadiness({
    status: row.status,
    lines: row.lineItems.map((l) => ({
      id: l.id,
      description: l.description,
      executionReviewStatus: l.executionReviewStatus,
      executionMergeMode: l.executionMergeMode,
      taskCount: l._count.draftExecutionTasks,
    })),
  });

  const [latestSend, latestApproval, latestProof] = await Promise.all([
    db.quoteCheckpoint.findFirst({
      where: {
        organizationId: orgId,
        quoteId: row.id,
        kind: QuoteCheckpointKind.SEND,
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    db.quoteCheckpoint.findFirst({
      where: {
        organizationId: orgId,
        quoteId: row.id,
        kind: QuoteCheckpointKind.APPROVAL,
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    db.quoteCheckpoint.findFirst({
      where: {
        organizationId: orgId,
        quoteId: row.id,
        kind: { in: [QuoteCheckpointKind.SEND, QuoteCheckpointKind.APPROVAL] },
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  const revisionDriftSinceLastProof = Boolean(
    latestProof &&
      row.status !== QuoteStatus.ARCHIVED &&
      row.updatedAt.getTime() > latestProof.createdAt.getTime(),
  );

  const readiness = getQuoteReadiness({
    quote: {
      status: row.status,
      lineItemCount: row.lineItems.length,
      subtotalCents: row.subtotalCents,
      totalCents: row.totalCents,
    },
    job,
    activationReadiness: {
      ready: activationReadiness.ready,
      totalTasksToActivate: activationReadiness.totalTasksToActivate,
      needsAttentionLineCount:
        activationReadiness.blockReasons.find(
          (r) => r.code === "LINE_NEEDS_EXECUTION_REVIEW",
        )?.lines.length ?? 0,
      anomalyLineCount:
        activationReadiness.blockReasons.find(
          (r) => r.code === "LINE_COMMERCIAL_ONLY_HAS_TASKS",
        )?.lines.length ?? 0,
    },
    latestSendAt: latestSend?.createdAt ?? undefined,
    latestApprovalAt: latestApproval?.createdAt ?? undefined,
    revisionDriftSinceLastProof,
  });

  const primaryTitle = lead?.title || customer?.displayName || row.title;
  const subtitle = row.title !== primaryTitle ? row.title : null;

  const quote: QuoteWorkSurfaceData = {
    id: row.id,
    title: row.title,
    primaryTitle,
    subtitle,
    status: row.status,
    statusLabel: formatQuoteStatus(row.status),
    statusTone: quoteStatusBadgeTone(row.status),
    customerId: customer?.id ?? null,
    customerDisplayName: customer?.displayName ?? null,
    customerHref: customer ? `/customers/${customer.id}` : null,
    leadId: lead?.id ?? null,
    leadTitle: lead?.title ?? null,
    leadHref: lead ? `/leads/${lead.id}` : null,
    totalCents: row.totalCents,
    subtotalCents: row.subtotalCents,
    lineItemCount: row.lineItems.length,
    createdAtLabel: row.createdAt.toLocaleDateString("en-US", dateOpts),
    updatedAtLabel: row.updatedAt.toLocaleDateString("en-US", dateOpts),
    activatedJobId: job?.id ?? null,
    activatedJobStatus: job?.status ?? null,
    quoteHref: `/quotes/${row.id}`,
    proposalPreviewHref: `/quotes/${row.id}/preview`,
    executionReviewHref: `/quotes/${row.id}/execution-review`,
  };

  return { quote, readiness };
}
