import "server-only";

import { QuoteCheckpointKind, QuoteStatus } from "@prisma/client";
import { db } from "@/lib/db";
import {
  evaluateQuoteJobActivationReadiness,
} from "@/lib/quote-job-activation-readiness";
import { getQuoteReadiness, type QuoteReadiness } from "@/lib/quote-readiness";
import {
  formatQuoteStatus,
  quoteStatusBadgeTone,
  type QuoteLineItemPayload,
} from "@/lib/quote-display";
import {
  quoteStatusAllowsCommercialEdits,
  quoteStatusAllowsExecutionEdits,
  quoteStatusIsArchived,
} from "@/lib/quote-status-workflow";
import { buildDefaultExecutionSummaryLine } from "@/lib/line-item-template-execution-summary";
import { getExecutionStageLabel } from "@/lib/execution-stage-catalog";
import { getTaskTemplateCategoryLabel } from "@/lib/task-template-category";
import type { QuoteLineDraftExecutionTaskRow } from "@/components/quotes/quote-line-draft-execution-panel";
import type { LineItemTemplatePickerRow } from "@/lib/line-item-template-display";
import { computeLineTotalCents } from "@/lib/quote-money";
import type { ReusableTaskPickerOption } from "@/lib/line-item-template-default-execution-display";
import type { QuoteWorkSurfaceData } from "@/lib/quote-work-surface-data";
import type {
  QuoteWorkspaceCheckpointPayload,
  QuoteWorkspaceLeadIntake,
  QuoteWorkspaceTabData,
} from "@/lib/quote-workspace-payload";
import { resolveJobsiteLineForQuoteOrJob } from "@/lib/jobsite-address";
import { formatPhoneForDisplay } from "@/lib/format-phone-display";

const dateOpts: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
};

export type QuoteWorkSurfaceLoaderResult = {
  quote: QuoteWorkSurfaceData;
  readiness: QuoteReadiness;
  workspaceTabs: QuoteWorkspaceTabData;
};

/**
 * Org-scoped fetch + derive of everything `QuoteWorkSurface` needs across all
 * containers (Workstation drawer, Lead Quote tab embed, Quotes list popup,
 * full Quote page).
 *
 * The result intentionally bundles three layers:
 *   - identity / summary  → `QuoteWorkSurfaceData`
 *   - readiness signals   → `QuoteReadiness`
 *   - workspace tab data  → `QuoteWorkspaceTabData`
 *
 * Same loader, same payload — the surface owns the workspace body and stays
 * identical regardless of container.
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
      customerDocumentTitle: true,
      status: true,
      subtotalCents: true,
      totalCents: true,
      internalNotes: true,
      lastSentEmailAt: true,
      shareToken: { select: { token: true } },
      createdAt: true,
      updatedAt: true,
      customerId: true,
      customer: {
        select: {
          id: true,
          displayName: true,
          email: true,
          phone: true,
          organizationId: true,
          serviceLocations: {
            orderBy: { isPrimary: "desc" },
            select: { formattedAddress: true, addressLine1: true, isPrimary: true },
          },
        },
      },
      leadId: true,
      lead: {
        select: {
          id: true,
          title: true,
          organizationId: true,
          notes: true,
          source: true,
          contactName: true,
          email: true,
          phone: true,
          publicIntakeServiceLocation: true,
        },
      },
      job: { select: { id: true, status: true, organizationId: true } },
      lineItems: {
        orderBy: { sortOrder: "asc" },
        include: {
          draftExecutionTasks: {
            orderBy: [{ sortOrder: "asc" }],
            select: {
              id: true,
              title: true,
              stageKey: true,
              category: true,
              instructions: true,
              sortOrder: true,
              sourceType: true,
              sourceTaskTemplateId: true,
              sourceLineItemTemplateTaskId: true,
            },
          },
        },
      },
    },
  });

  if (!row) return null;

  const rawCustomer =
    row.customer && row.customer.organizationId === orgId ? row.customer : null;
  const customer = rawCustomer
    ? {
        id: rawCustomer.id,
        displayName: rawCustomer.displayName,
        email: rawCustomer.email,
        phone: rawCustomer.phone,
      }
    : null;
  const rawLead =
    row.lead && row.lead.organizationId === orgId ? row.lead : null;
  const lead = rawLead
    ? {
        id: rawLead.id,
        title: rawLead.title,
        notes: rawLead.notes,
        source: rawLead.source,
        contactName: rawLead.contactName,
        email: rawLead.email,
        phone: rawLead.phone,
      }
    : null;

  const jobsiteAddressLine = resolveJobsiteLineForQuoteOrJob({
    customerLocations: rawCustomer?.serviceLocations ?? [],
    leadRow: rawLead
      ? {
          publicIntakeServiceLocation: rawLead.publicIntakeServiceLocation,
          notes: rawLead.notes,
        }
      : null,
  });
  const jobsiteMissing = jobsiteAddressLine == null || jobsiteAddressLine.trim() === "";
  const canAddServiceAddress = Boolean(customer?.id);
  const customerFormattedPhone = customer?.phone
    ? formatPhoneForDisplay(customer.phone) || null
    : null;
  const job =
    row.job && row.job.organizationId === orgId
      ? { id: row.job.id, status: row.job.status }
      : null;

  /* Activation readiness — same source full Quote page used. */
  const activationReadiness = evaluateQuoteJobActivationReadiness({
    status: row.status,
    lines: row.lineItems.map((l) => ({
      id: l.id,
      description: l.description,
      executionReviewStatus: l.executionReviewStatus,
      executionMergeMode: l.executionMergeMode,
      taskCount: l.draftExecutionTasks.length,
    })),
  });

  /* Send + approval checkpoints, with full sequence data for the Send & Accept
   * tab. We intentionally fetch full lists (not just the latest) because the
   * surface now renders the same list the full Quote page used to render. */
  const [sendCheckpointRows, approvalCheckpointRows, latestCommercialProof] =
    await Promise.all([
      db.quoteCheckpoint.findMany({
        where: {
          organizationId: orgId,
          quoteId: row.id,
          kind: QuoteCheckpointKind.SEND,
        },
        orderBy: { sequence: "asc" },
        select: {
          id: true,
          sequence: true,
          source: true,
          createdAt: true,
          quoteUpdatedAtAtCapture: true,
        },
      }),
      db.quoteCheckpoint.findMany({
        where: {
          organizationId: orgId,
          quoteId: row.id,
          kind: QuoteCheckpointKind.APPROVAL,
        },
        orderBy: { sequence: "asc" },
        select: {
          id: true,
          sequence: true,
          source: true,
          createdAt: true,
          quoteUpdatedAtAtCapture: true,
        },
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
    latestCommercialProof &&
      row.status !== QuoteStatus.ARCHIVED &&
      row.updatedAt.getTime() > latestCommercialProof.createdAt.getTime(),
  );

  const latestSend = sendCheckpointRows[sendCheckpointRows.length - 1] ?? null;
  const latestApproval =
    approvalCheckpointRows[approvalCheckpointRows.length - 1] ?? null;

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

  /* ── QuoteWorkSurfaceData (identity + summary) ────────────────────────── */
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
    leadHref: lead ? `/sales/${lead.id}` : null,
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
    jobsiteAddressLine,
    jobsiteMissing,
    canAddServiceAddress,
    customerEmail: customer?.email ?? null,
    customerPhone: customer?.phone ?? null,
    customerFormattedPhone,
    shareToken: row.shareToken?.token ?? null,
    lastSentEmailAtLabel: row.lastSentEmailAt
      ? row.lastSentEmailAt.toLocaleDateString("en-US", dateOpts)
      : null,
  };

  /* ── Workspace tab data ───────────────────────────────────────────────── */

  /* Work-order ranks — same algorithm the full Quote page used. */
  const workOrderOrderedIds = [...row.lineItems]
    .sort((a, b) => {
      if (a.executionOrder !== b.executionOrder) {
        return a.executionOrder - b.executionOrder;
      }
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return a.id.localeCompare(b.id);
    })
    .map((l) => l.id);
  const workOrderRank = new Map(workOrderOrderedIds.map((id, i) => [id, i + 1]));
  const workOrderTotal = workOrderOrderedIds.length;

  const draftTasksByLineId: Record<string, QuoteLineDraftExecutionTaskRow[]> = {};
  for (const line of row.lineItems) {
    draftTasksByLineId[line.id] = line.draftExecutionTasks.map((t) => ({
      id: t.id,
      title: t.title,
      stageKey: t.stageKey,
      category: t.category,
      instructions: t.instructions,
      sortOrder: t.sortOrder,
      sourceType: t.sourceType,
      sourceTaskTemplateId: t.sourceTaskTemplateId,
      sourceLineItemTemplateTaskId: t.sourceLineItemTemplateTaskId,
    }));
  }

  const lineItems: QuoteLineItemPayload[] = row.lineItems.map((line) => {
    const exec = buildDefaultExecutionSummaryLine(line.draftExecutionTasks);
    return {
      id: line.id,
      sortOrder: line.sortOrder,
      description: line.description,
      customerScopeTitle: line.customerScopeTitle,
      customerScopeDescription: line.customerScopeDescription,
      customerIncludedNotes: line.customerIncludedNotes,
      customerExcludedNotes: line.customerExcludedNotes,
      customerPresentationGroup: line.customerPresentationGroup,
      quantityDisplay: line.quantity.toString(),
      unitAmountCents: line.unitAmountCents,
      lineTotalCents: line.lineTotalCents,
      internalNotes: line.internalNotes,
      executionSummary: { taskCount: exec.taskCount, summaryLine: exec.summaryLine },
      executionReviewStatus: line.executionReviewStatus,
      executionMergeMode: line.executionMergeMode,
      executionOrder: line.executionOrder,
      workOrderPosition: workOrderRank.get(line.id) ?? 1,
      workOrderTotal,
    };
  });

  const isCommercialEditable = quoteStatusAllowsCommercialEdits(row.status);
  const isExecutionEditable = quoteStatusAllowsExecutionEdits(row.status);
  const isArchived = quoteStatusIsArchived(row.status);

  /* Line-item templates — only meaningful while DRAFT (saved-line picker). */
  const lineItemTemplates: LineItemTemplatePickerRow[] = isCommercialEditable
    ? (
        await db.lineItemTemplate.findMany({
          where: { organizationId: orgId, archivedAt: null },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            description: true,
            defaultQuantity: true,
            defaultUnitAmountCents: true,
            defaultCustomerScopeTitle: true,
            defaultCustomerScopeDescription: true,
            defaultCustomerIncludedNotes: true,
            defaultCustomerExcludedNotes: true,
            defaultCustomerPresentationGroup: true,
          },
        })
      ).map((t) => {
        const lineTotal = computeLineTotalCents(t.defaultQuantity, t.defaultUnitAmountCents);
        return {
        id: t.id,
        description: t.description,
        defaultQuantityDisplay: t.defaultQuantity.toString(),
        defaultUnitAmountCents: t.defaultUnitAmountCents,
        defaultLineTotalCents: lineTotal.ok ? lineTotal.lineTotalCents : 0,
        hasCustomerProposalDefaults: Boolean(
          t.defaultCustomerScopeTitle ||
            t.defaultCustomerScopeDescription ||
            t.defaultCustomerIncludedNotes ||
            t.defaultCustomerExcludedNotes ||
            t.defaultCustomerPresentationGroup,
        ),
      };
      })
    : [];

  /* Reusable task picker — only when execution editing is allowed. */
  const reusableTaskOptions: ReusableTaskPickerOption[] = isExecutionEditable
    ? (
        await db.taskTemplate.findMany({
          where: { organizationId: orgId, archivedAt: null },
          orderBy: { title: "asc" },
          select: { id: true, title: true, stageKey: true, category: true },
        })
      ).map((r) => ({
        id: r.id,
        title: r.title,
        stageLabel: getExecutionStageLabel(r.stageKey),
        categoryLabel: getTaskTemplateCategoryLabel(r.category),
      }))
    : [];

  /* Serialize checkpoints — drop `Date` for server-action safety. */
  function toCheckpointPayload(c: {
    id: string;
    sequence: number;
    source: "STAFF" | "CUSTOMER_PORTAL";
    createdAt: Date;
    quoteUpdatedAtAtCapture: Date | null;
  }): QuoteWorkspaceCheckpointPayload {
    return {
      id: c.id,
      sequence: c.sequence,
      source: c.source,
      href: `/quotes/${row!.id}/checkpoints/${c.id}`,
      createdAtIso: c.createdAt.toISOString(),
      createdAtLabel: c.createdAt.toLocaleString(),
      quoteUpdatedAtAtCaptureIso:
        c.quoteUpdatedAtAtCapture?.toISOString() ?? null,
      quoteUpdatedAtAtCaptureLabel: c.quoteUpdatedAtAtCapture
        ? c.quoteUpdatedAtAtCapture.toLocaleString()
        : null,
    };
  }

  const sendCheckpoints = sendCheckpointRows.map(toCheckpointPayload);
  const approvalCheckpoints = approvalCheckpointRows.map(toCheckpointPayload);

  const leadIntake: QuoteWorkspaceLeadIntake | null = lead
    ? {
        id: lead.id,
        title: lead.title,
        href: `/sales/${lead.id}`,
        notes: lead.notes,
        source: lead.source,
        contactName: lead.contactName,
        email: lead.email,
        phone: lead.phone,
      }
    : null;

  const workspaceTabs: QuoteWorkspaceTabData = {
    isCommercialEditable,
    isExecutionEditable,
    isArchived,
    customerDocumentTitle: row.customerDocumentTitle,
    internalNotes: row.internalNotes,
    hasLeadNotes: Boolean(lead?.notes),
    subtotalCents: row.subtotalCents,
    totalCents: row.totalCents,
    lineItems,
    lineItemTemplates,
    draftTasksByLineId,
    reusableTaskOptions,
    customerName: customer?.displayName ?? null,
    customerHref: customer ? `/customers/${customer.id}` : null,
    leadIntake,
    sendCheckpoints,
    approvalCheckpoints,
    createdAtIso: row.createdAt.toISOString(),
    createdAtLabel: row.createdAt.toLocaleDateString("en-US", dateOpts),
    updatedAtIso: row.updatedAt.toISOString(),
    updatedAtLabel: row.updatedAt.toLocaleDateString("en-US", dateOpts),
  };

  return { quote, readiness, workspaceTabs };
}
