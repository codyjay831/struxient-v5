import Link from "next/link";
import { QuoteCheckpointKind, QuoteStatus } from "@prisma/client";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { QuoteWorkspaceShell } from "@/components/shells/quote-workspace-shell";
import { db, getDevOrganizationOrThrow } from "@/lib/db";
import { workstationReturnHref } from "@/lib/workstation-return-href";
import type { LineItemTemplatePickerRow } from "@/lib/line-item-template-display";
import {
  formatQuoteStatus,
  quoteStatusBadgeTone,
  type QuoteDetailPayload,
  type QuoteLineItemPayload,
  type QuoteSendCheckpointSummary,
} from "@/lib/quote-display";
import type { QuoteWorkSurfaceData } from "@/lib/quote-work-surface-data";
import { buildDefaultExecutionSummaryLine } from "@/lib/line-item-template-execution-summary";
import { quoteStatusAllowsExecutionEdits } from "@/lib/quote-status-workflow";
import { getExecutionStageLabel } from "@/lib/execution-stage-catalog";
import { getTaskTemplateCategoryLabel } from "@/lib/task-template-category";
import {
  evaluateQuoteJobActivationReadiness,
} from "@/lib/quote-job-activation-readiness";
import { getQuoteReadiness } from "@/lib/quote-readiness";
import type { QuoteLineDraftExecutionTaskRow } from "@/components/quotes/quote-line-draft-execution-panel";
import type { ReusableTaskPickerOption } from "@/lib/line-item-template-default-execution-display";
import { FileText } from "lucide-react";

export const dynamic = "force-dynamic";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default async function QuoteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ quoteId: string }>;
  searchParams?: Promise<{ from?: string; section?: string }>;
}) {
  const emptySearchParams: { from?: string; section?: string } = {};
  const [{ quoteId }, sq] = await Promise.all([
    params,
    searchParams ?? Promise.resolve(emptySearchParams),
  ]);
  const fromWorkstation = sq.from === "workstation";
  const returnSection = typeof sq.section === "string" ? sq.section : "investigate";
  const returnHref = fromWorkstation ? workstationReturnHref(returnSection) : undefined;
  const org = await getDevOrganizationOrThrow();
  const row = await db.quote.findFirst({
    where: {
      id: quoteId,
      organizationId: org.id,
    },
    include: {
      customer: {
        select: { id: true, displayName: true, organizationId: true },
      },
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
        },
      },
      job: {
        select: { id: true, status: true, organizationId: true },
      },
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
          title="Quote"
          description="No quote exists for this id in the current development organization. Links only resolve within your tenant scope—not across organizations."
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
          description="This id is not a quote record in the development organization, or it belongs to another tenant. When auth exists, routing will follow your real org context."
        >
          <Link href="/quotes" className={listLinkClass}>
            Back to quotes
          </Link>
        </EmptyState>
      </div>
    );
  }

  const customer =
    row.customer && row.customer.organizationId === org.id
      ? { id: row.customer.id, displayName: row.customer.displayName }
      : null;
  const lead =
    row.lead && row.lead.organizationId === org.id
      ? {
          id: row.lead.id,
          title: row.lead.title,
          notes: row.lead.notes,
          source: row.lead.source,
          contactName: row.lead.contactName,
          email: row.lead.email,
          phone: row.lead.phone,
        }
      : null;

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

  const quote: QuoteDetailPayload = {
    id: row.id,
    title: row.title,
    customerDocumentTitle: row.customerDocumentTitle,
    status: row.status,
    internalNotes: row.internalNotes,
    subtotalCents: row.subtotalCents,
    totalCents: row.totalCents,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    customerId: row.customerId,
    leadId: row.leadId,
    customer,
    lead,
    lineItems,
  };

  const lineItemTemplates: LineItemTemplatePickerRow[] =
    row.status === QuoteStatus.DRAFT
      ? (
          await db.lineItemTemplate.findMany({
            where: { organizationId: org.id, archivedAt: null },
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
        ).map((t) => ({
          id: t.id,
          description: t.description,
          defaultQuantityDisplay: t.defaultQuantity.toString(),
          defaultUnitAmountCents: t.defaultUnitAmountCents,
          hasCustomerProposalDefaults: Boolean(
            t.defaultCustomerScopeTitle ||
              t.defaultCustomerScopeDescription ||
              t.defaultCustomerIncludedNotes ||
              t.defaultCustomerExcludedNotes ||
              t.defaultCustomerPresentationGroup,
          ),
        }))
      : [];

  const sendCheckpointRows = await db.quoteCheckpoint.findMany({
    where: {
      organizationId: org.id,
      quoteId: row.id,
      kind: QuoteCheckpointKind.SEND,
    },
    orderBy: { sequence: "asc" },
    select: {
      id: true,
      sequence: true,
      createdAt: true,
      quoteUpdatedAtAtCapture: true,
    },
  });

  const sendCheckpoints: QuoteSendCheckpointSummary[] = sendCheckpointRows.map((c) => ({
    id: c.id,
    sequence: c.sequence,
    createdAt: c.createdAt,
    quoteUpdatedAtAtCapture: c.quoteUpdatedAtAtCapture,
  }));

  const approvalCheckpointRows = await db.quoteCheckpoint.findMany({
    where: {
      organizationId: org.id,
      quoteId: row.id,
      kind: QuoteCheckpointKind.APPROVAL,
    },
    orderBy: { sequence: "asc" },
    select: {
      id: true,
      sequence: true,
      createdAt: true,
      quoteUpdatedAtAtCapture: true,
    },
  });

  const approvalCheckpoints: QuoteSendCheckpointSummary[] = approvalCheckpointRows.map((c) => ({
    id: c.id,
    sequence: c.sequence,
    createdAt: c.createdAt,
    quoteUpdatedAtAtCapture: c.quoteUpdatedAtAtCapture,
  }));

  const latestCommercialProof = await db.quoteCheckpoint.findFirst({
    where: {
      organizationId: org.id,
      quoteId: row.id,
      kind: { in: [QuoteCheckpointKind.SEND, QuoteCheckpointKind.APPROVAL] },
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  const workspaceDiffersFromLastCommercialProof = Boolean(
    latestCommercialProof &&
      row.status !== QuoteStatus.ARCHIVED &&
      row.updatedAt.getTime() > latestCommercialProof.createdAt.getTime(),
  );

  const activatedJobId =
    row.job && row.job.organizationId === org.id ? row.job.id : null;

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

  const quoteReadiness = getQuoteReadiness({
    quote: {
      status: row.status,
      lineItemCount: row.lineItems.length,
      subtotalCents: row.subtotalCents,
      totalCents: row.totalCents,
    },
    job:
      row.job && row.job.organizationId === org.id
        ? { id: row.job.id, status: row.job.status }
        : null,
    activationReadiness: {
      ready: activationReadiness.ready,
      totalTasksToActivate: activationReadiness.totalTasksToActivate,
      needsAttentionLineCount: activationReadiness.blockReasons.find(
        (r) => r.code === "LINE_NEEDS_EXECUTION_REVIEW",
      )?.lines.length ?? 0,
      anomalyLineCount: activationReadiness.blockReasons.find(
        (r) => r.code === "LINE_COMMERCIAL_ONLY_HAS_TASKS",
      )?.lines.length ?? 0,
    },
    latestSendAt: sendCheckpoints[sendCheckpoints.length - 1]?.createdAt,
    latestApprovalAt: approvalCheckpoints[approvalCheckpoints.length - 1]?.createdAt,
    revisionDriftSinceLastProof: workspaceDiffersFromLastCommercialProof,
  });

  /* QuoteWorkSurfaceData — same shape Workstation drawer + Lead embed use,
   * built from the data already loaded above (no extra Prisma calls). */
  const dateOpts: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  };
  const surfacePrimaryTitle =
    lead?.title || customer?.displayName || row.title;
  const surfaceSubtitle =
    row.title !== surfacePrimaryTitle ? row.title : null;
  const quoteWorkSurface: QuoteWorkSurfaceData = {
    id: row.id,
    title: row.title,
    primaryTitle: surfacePrimaryTitle,
    subtitle: surfaceSubtitle,
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
    activatedJobId:
      row.job && row.job.organizationId === org.id ? row.job.id : null,
    activatedJobStatus:
      row.job && row.job.organizationId === org.id ? row.job.status : null,
    quoteHref: `/quotes/${row.id}`,
    proposalPreviewHref: `/quotes/${row.id}/preview`,
    executionReviewHref: `/quotes/${row.id}/execution-review`,
  };

  const isExecutionEditable = quoteStatusAllowsExecutionEdits(row.status);
  const reusableTaskOptions: ReusableTaskPickerOption[] = isExecutionEditable
    ? (
        await db.taskTemplate.findMany({
          where: { organizationId: org.id, archivedAt: null },
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

  return (
    <QuoteWorkspaceShell
      quote={quote}
      lineItemTemplates={lineItemTemplates}
      sendCheckpoints={sendCheckpoints}
      approvalCheckpoints={approvalCheckpoints}
      activatedJobId={activatedJobId}
      draftTasksByLineId={draftTasksByLineId}
      reusableTaskOptions={reusableTaskOptions}
      quoteReadiness={quoteReadiness}
      quoteWorkSurface={quoteWorkSurface}
      returnHref={returnHref}
    />
  );
}
