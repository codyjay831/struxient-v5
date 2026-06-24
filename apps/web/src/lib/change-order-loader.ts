import { JobScopeItemStatus, JobStatus } from "@prisma/client";
import { db } from "@/lib/db";
import {
  changeOrderPageBlockMessage,
  deriveChangeOrderPageBlockReason,
  deriveChangeOrderPermissions,
  resolveFocusedRevisionId,
  type ChangeOrderLineDraft,
  type ChangeOrderPermissions,
  type ChangeOrderRevisionSnapshot,
  type ChangeOrderScopeItemSnapshot,
} from "@/lib/change-order-flow";
import {
  projectChangeOrderExecutionImpact,
  type ChangeOrderJobTaskSnapshot,
} from "@/lib/change-order/change-order-execution-projection";
import type { StaffRole } from "@prisma/client";

export type LoadedChangeOrder = ChangeOrderRevisionSnapshot & {
  number: number;
  title: string;
  customerDocumentTitle: string | null;
  createdAt: string;
  approvedAt: string | null;
  appliedAt: string | null;
  executionDeltaJson: unknown;
};

export type LoadedChangeOrderWorkspace = {
  jobId: string;
  jobTitle: string;
  jobStatus: JobStatus;
  jobPlanVersion: number;
  quoteId: string;
  quoteTitle: string;
  quoteLeadId: string | null;
  permissions: ChangeOrderPermissions;
  pageBlocked: boolean;
  pageBlockedMessage: string | null;
  activeScopeItems: ChangeOrderScopeItemSnapshot[];
  jobTasks: ChangeOrderJobTaskSnapshot[];
  changeOrders: LoadedChangeOrder[];
  focusChangeOrderId: string | null;
  // compatibility with existing components while migrating names
  revisions: LoadedChangeOrder[];
  focusRevisionId: string | null;
};

export type LoadedChangeOrderRevision = LoadedChangeOrder;

export async function loadChangeOrderWorkspace(input: {
  organizationId: string;
  jobId: string;
  role: StaffRole;
  focusChangeOrderId?: string | null;
}): Promise<LoadedChangeOrderWorkspace | null> {
  const job = await db.job.findFirst({
    where: {
      id: input.jobId,
      organizationId: input.organizationId,
    },
    select: {
      id: true,
      title: true,
      status: true,
      jobPlanVersion: true,
      quoteId: true,
      quote: {
        select: {
          id: true,
          title: true,
          leadId: true,
        },
      },
      scopeItems: {
        where: { status: JobScopeItemStatus.ACTIVE },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          description: true,
          quantity: true,
          unitPriceCents: true,
          executionRelevant: true,
          status: true,
          sourceQuoteLineItem: {
            select: {
              description: true,
              quantity: true,
              unitAmountCents: true,
              lineTotalCents: true,
              customerScopeTitle: true,
              customerScopeDescription: true,
              customerIncludedNotes: true,
              customerExcludedNotes: true,
            },
          },
          sourceChangeOrderLine: {
            select: {
              operation: true,
              description: true,
              quantity: true,
              unitPriceCents: true,
              priceDeltaCents: true,
            },
          },
        },
      },
      tasks: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          title: true,
          instructions: true,
          status: true,
          scopes: { select: { jobScopeItemId: true } },
        },
      },
      changeOrders: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          number: true,
          title: true,
          customerDocumentTitle: true,
          status: true,
          reasoning: true,
          priceDeltaCents: true,
          createdAt: true,
          approvedAt: true,
          appliedAt: true,
          baseJobPlanVersion: true,
          applicationStatus: true,
          lastApplyErrorJson: true,
          executionDeltaJson: true,
          lines: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: {
              operation: true,
              sourceJobScopeItemId: true,
              description: true,
              quantity: true,
              unitPriceCents: true,
              priceDeltaCents: true,
              executionRelevant: true,
            },
          },
        },
      },
    },
  });

  if (!job) return null;

  const permissions = deriveChangeOrderPermissions(input.role);
  const blockReason = deriveChangeOrderPageBlockReason({
    quoteId: job.quoteId,
    jobStatus: job.status,
    permissions,
  });

  const jobTasks: ChangeOrderJobTaskSnapshot[] = job.tasks.map((task) => ({
    id: task.id,
    title: task.title,
    instructions: task.instructions,
    status: task.status,
    scopeItemIds: task.scopes.map((scope) => scope.jobScopeItemId),
  }));

  const scopeItemsForProjection = job.scopeItems.map((item) => ({
    id: item.id,
    description: item.description,
    executionRelevant: item.executionRelevant,
    status: item.status,
  }));

  const changeOrders: LoadedChangeOrder[] = job.changeOrders.map((changeOrder) => {
    const lines = changeOrder.lines.map(
      (line): ChangeOrderLineDraft => ({
        operation: line.operation,
        sourceJobScopeItemId: line.sourceJobScopeItemId,
        description: line.description,
        quantity: line.quantity.toString(),
        unitPriceCents: line.unitPriceCents,
        priceDeltaCents: line.priceDeltaCents,
        executionRelevant: line.executionRelevant,
      }),
    );

    const executionImpact = projectChangeOrderExecutionImpact({
      executionDeltaJson: changeOrder.executionDeltaJson,
      baseJobPlanVersion: changeOrder.baseJobPlanVersion,
      currentJobPlanVersion: job.jobPlanVersion,
      priceDeltaCents: changeOrder.priceDeltaCents,
      scopeItems: scopeItemsForProjection,
      tasks: jobTasks,
    });

    return {
      id: changeOrder.id,
      number: changeOrder.number,
      title: changeOrder.title,
      customerDocumentTitle: changeOrder.customerDocumentTitle,
      status: changeOrder.status,
      reasoning: changeOrder.reasoning,
      priceDeltaCents: changeOrder.priceDeltaCents,
      createdAt: changeOrder.createdAt.toISOString(),
      approvedAt: changeOrder.approvedAt?.toISOString() ?? null,
      appliedAt: changeOrder.appliedAt?.toISOString() ?? null,
      baseJobPlanVersion: changeOrder.baseJobPlanVersion,
      applicationStatus: changeOrder.applicationStatus,
      lastApplyErrorJson: changeOrder.lastApplyErrorJson,
      executionDeltaJson: changeOrder.executionDeltaJson,
      executionImpact,
      lines,
    };
  });

  const focusChangeOrderId = resolveFocusedRevisionId({
    revisions: changeOrders,
    requestedRevisionId: input.focusChangeOrderId?.trim() || null,
  });

  return {
    jobId: job.id,
    jobTitle: job.title,
    jobStatus: job.status,
    jobPlanVersion: job.jobPlanVersion,
    quoteId: job.quote?.id ?? job.quoteId ?? "",
    quoteTitle: job.quote?.title ?? "Quote",
    quoteLeadId: job.quote?.leadId ?? null,
    permissions,
    pageBlocked: blockReason != null,
    pageBlockedMessage: blockReason ? changeOrderPageBlockMessage(blockReason) : null,
    activeScopeItems: job.scopeItems.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity.toString(),
      unitPriceCents: item.unitPriceCents,
      executionRelevant: item.executionRelevant,
      status: item.status,
      signedQuote: item.sourceQuoteLineItem
        ? {
            description: item.sourceQuoteLineItem.description,
            quantity: item.sourceQuoteLineItem.quantity.toString(),
            unitAmountCents: item.sourceQuoteLineItem.unitAmountCents,
            lineTotalCents: item.sourceQuoteLineItem.lineTotalCents,
            customerScopeTitle: item.sourceQuoteLineItem.customerScopeTitle,
            customerScopeDescription: item.sourceQuoteLineItem.customerScopeDescription,
            customerIncludedNotes: item.sourceQuoteLineItem.customerIncludedNotes,
            customerExcludedNotes: item.sourceQuoteLineItem.customerExcludedNotes,
          }
        : null,
      priorRevision: item.sourceChangeOrderLine
        ? {
            operation: item.sourceChangeOrderLine.operation,
            description: item.sourceChangeOrderLine.description,
            quantity: item.sourceChangeOrderLine.quantity.toString(),
            unitPriceCents: item.sourceChangeOrderLine.unitPriceCents,
            priceDeltaCents: item.sourceChangeOrderLine.priceDeltaCents,
          }
        : null,
    })),
    jobTasks,
    changeOrders,
    focusChangeOrderId,
    revisions: changeOrders,
    focusRevisionId: focusChangeOrderId,
  };
}
