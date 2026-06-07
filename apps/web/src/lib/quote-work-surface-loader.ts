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
  type PaymentScheduleItemPayload,
} from "@/lib/quote-display";
import {
  quoteStatusAllowsCommercialEdits,
  quoteAllowsQuoteLineExecutionPlanning,
  quoteStatusIsArchived,
} from "@/lib/quote-status-workflow";
import { buildDefaultExecutionSummaryLine } from "@/lib/line-item-template-execution-summary";
import { getTaskTemplateCategoryLabel } from "@/lib/task-template-category";
import type { QuoteLineDraftExecutionTaskRow } from "@/components/quotes/quote-line-draft-execution-panel";
import type { LineItemTemplatePickerRow } from "@/lib/line-item-template-display";
import { computeLineTotalCents } from "@/lib/quote-money";
import type { ReusableTaskPickerOption } from "@/lib/line-item-template-default-execution-display";
import type { QuoteWorkSurfaceData } from "@/lib/quote-work-surface-data";
import type {
  QuoteWorkspaceCheckpointPayload,
  QuoteWorkspaceLead,
  QuoteWorkspaceTabData,
} from "@/lib/quote-workspace-payload";
import { resolveJobsiteLineForQuoteOrJob } from "@/lib/jobsite-address";
import { formatPhoneForDisplay } from "@/lib/format-phone-display";
import { projectLead } from "@/lib/lead/lead-projection";
import { LineClarificationAnswersSchema } from "@/lib/clarification/clarification-answer-schema";

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
      shareToken: { select: { token: true, expiresAt: true, revokedAt: true } },
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
          organizationId: true,
          contact: true,
          request: true,
          address: true,
          signals: true,
          channel: true,
        },
      },
      job: { select: { id: true, status: true, organizationId: true } },
      paymentSchedule: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          title: true,
          amountCents: true,
          percentage: true,
          anchorType: true,
          anchorStageId: true,
          sortOrder: true,
        },
      },
      lineItems: {
        orderBy: { sortOrder: "asc" },
        include: {
          clarifications: {
            orderBy: { updatedAt: "desc" },
            select: {
              questionSetKey: true,
              questionSetVersion: true,
              answersJson: true,
            },
          },
          draftExecutionTasks: {
            orderBy: [{ sortOrder: "asc" }],
            select: {
              id: true,
              title: true,
              stageId: true,
              stage: { select: { name: true, sortOrder: true } },
              category: true,
              instructions: true,
              sortOrder: true,
              sourceType: true,
              sourceTaskTemplateId: true,
              sourceLineItemTemplateTaskId: true,
              providesSignals: true,
              requiresSignals: true,
              hardSignal: true,
              requirementsJson: true,
              partsRequiredJson: true,
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
  const leadProjection = rawLead
    ? projectLead({
        id: rawLead.id,
        status: "NEW" as never,
        channel: rawLead.channel,
        customerId: null,
        convertedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        contact: rawLead.contact,
        request: rawLead.request,
        address: rawLead.address,
        signals: rawLead.signals,
      })
    : null;
  const lead = leadProjection
    ? {
        id: leadProjection.id,
        title: leadProjection.title,
        notes: leadProjection.notes,
        scopeSummary: leadProjection.scopeSummary,
        source: leadProjection.channel,
        contactName: leadProjection.contactName,
        email: leadProjection.email,
        phone: leadProjection.phone,
      }
    : null;

  const jobsiteAddressLine = resolveJobsiteLineForQuoteOrJob({
    customerLocations: rawCustomer?.serviceLocations ?? [],
    leadRow: rawLead
      ? {
          address: rawLead.address,
          signals: rawLead.signals,
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

  const [sendCheckpointRows, approvalCheckpointRows, latestCommercialProof, stages, organization] =
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
      db.stage.findMany({
        where: { organizationId: orgId, archivedAt: null },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true },
      }),
      db.organization.findUnique({
        where: { id: orgId },
        select: { name: true },
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

  const activationReadiness = evaluateQuoteJobActivationReadiness({
    status: row.status,
    hasApprovalCheckpoint: approvalCheckpointRows.length > 0,
    lines: row.lineItems.map((l) => ({
      id: l.id,
      description: l.description,
      tasks: l.draftExecutionTasks.map(t => ({
        id: t.id,
        title: t.title,
        stageId: t.stageId,
        providesSignals: t.providesSignals,
        requiresSignals: t.requiresSignals,
        hardSignal: t.hardSignal,
      })),
    })),
    quoteTotalCents: row.totalCents,
    paymentSchedule: row.paymentSchedule.map((item) => ({
      id: item.id,
      title: item.title,
      anchorType: item.anchorType,
      amountCents: item.amountCents,
      percentage: item.percentage,
    })),
  });

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
      needsAttentionLineCount: 0, // Deprecated
      anomalyLineCount: 0, // Deprecated
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
    jobsiteAddressLine,
    jobsiteMissing,
    canAddServiceAddress,
    customerEmail: customer?.email ?? null,
    customerPhone: customer?.phone ?? null,
    customerFormattedPhone,
    shareToken: row.shareToken?.token ?? null,
    shareTokenExpiresAt: row.shareToken?.expiresAt ?? null,
    shareTokenRevokedAt: row.shareToken?.revokedAt ?? null,
    lastSentEmailAtLabel: row.lastSentEmailAt
      ? row.lastSentEmailAt.toLocaleDateString("en-US", dateOpts)
      : null,
    organizationDisplayName: organization?.name ?? "Struxient",
  };

  const draftTasksByLineId: Record<string, QuoteLineDraftExecutionTaskRow[]> = {};
  for (const line of row.lineItems) {
    draftTasksByLineId[line.id] = line.draftExecutionTasks.map((t) => ({
      id: t.id,
      title: t.title,
      stageId: t.stageId,
      category: t.category,
      instructions: t.instructions,
      sortOrder: t.sortOrder,
      sourceType: t.sourceType,
      sourceTaskTemplateId: t.sourceTaskTemplateId,
      sourceLineItemTemplateTaskId: t.sourceLineItemTemplateTaskId,
      providesSignals: t.providesSignals,
      requiresSignals: t.requiresSignals,
      hardSignal: t.hardSignal,
      requirementsJson: t.requirementsJson,
      partsRequiredJson: t.partsRequiredJson,
    }));
  }

  const lineItems: QuoteLineItemPayload[] = row.lineItems.map((line) => {
    const exec = buildDefaultExecutionSummaryLine(line.draftExecutionTasks);
    const clarifications = line.clarifications
      .map((clarification) => {
        const parsed = LineClarificationAnswersSchema.safeParse(clarification.answersJson);
        if (!parsed.success) return null;
        return parsed.data;
      })
      .filter((clarification): clarification is NonNullable<typeof clarification> =>
        clarification != null,
      );
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
      clarifications,
      executionSummary: { taskCount: exec.taskCount, summaryLine: exec.summaryLine },
    };
  });

  const isCommercialEditable = quoteStatusAllowsCommercialEdits(row.status);
  const isExecutionEditable = quoteAllowsQuoteLineExecutionPlanning(
    row.status,
    Boolean(job),
  );
  const isArchived = quoteStatusIsArchived(row.status);

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
            priceBufferPercentage: true,
            tags: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
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
          priceBufferPercentage: t.priceBufferPercentage,
          tags: t.tags,
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

  const reusableTaskOptions: ReusableTaskPickerOption[] = isExecutionEditable
    ? (
        await db.taskTemplate.findMany({
          where: { organizationId: orgId, archivedAt: null },
          orderBy: { title: "asc" },
          select: {
            id: true,
            title: true,
            stageId: true,
            category: true,
            stage: { select: { name: true } },
          },
        })
      ).map((r) => ({
        id: r.id,
        title: r.title,
        stageLabel: r.stage?.name ?? "No stage",
        categoryLabel: getTaskTemplateCategoryLabel(r.category),
      }))
    : [];

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

  const leadPayload: QuoteWorkspaceLead | null = lead
    ? {
        id: lead.id,
        title: lead.title,
        href: `/leads/${lead.id}`,
        notes: lead.notes,
        scopeSummary: lead.scopeSummary,
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
    stages,
    paymentSchedule: row.paymentSchedule.map(item => ({
      ...item,
      percentage: item.percentage?.toString() ?? null,
    })),
    customerName: customer?.displayName ?? null,
    customerHref: customer ? `/customers/${customer.id}` : null,
    lead: leadPayload,
    sendCheckpoints,
    approvalCheckpoints,
    createdAtIso: row.createdAt.toISOString(),
    createdAtLabel: row.createdAt.toLocaleDateString("en-US", dateOpts),
    updatedAtIso: row.updatedAt.toISOString(),
    updatedAtLabel: row.updatedAt.toLocaleDateString("en-US", dateOpts),
  };

  return { quote, readiness, workspaceTabs };
}
