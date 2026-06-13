import { JobScopeItemStatus, JobStatus, QuoteScopeRevisionStatus } from "@prisma/client";
import { db } from "@/lib/db";
import {
  changeOrderPageBlockMessage,
  deriveChangeOrderPageBlockReason,
  deriveChangeOrderPermissions,
  resolveFocusedRevisionId,
  type ChangeOrderLineDraft,
  type ChangeOrderPermissions,
  type ChangeOrderScopeItemSnapshot,
} from "@/lib/change-order-flow";
import type { StaffRole } from "@prisma/client";

export type LoadedChangeOrderRevision = {
  id: string;
  status: QuoteScopeRevisionStatus;
  reasoning: string;
  priceDeltaCents: number;
  createdAt: string;
  approvedAt: string | null;
  appliedAt: string | null;
  lines: ChangeOrderLineDraft[];
};

export type LoadedChangeOrderWorkspace = {
  jobId: string;
  jobTitle: string;
  jobStatus: JobStatus;
  jobPlanVersion: number;
  quoteId: string;
  quoteTitle: string;
  permissions: ChangeOrderPermissions;
  pageBlocked: boolean;
  pageBlockedMessage: string | null;
  activeScopeItems: ChangeOrderScopeItemSnapshot[];
  revisions: LoadedChangeOrderRevision[];
  focusRevisionId: string | null;
};

export async function loadChangeOrderWorkspace(input: {
  organizationId: string;
  jobId: string;
  role: StaffRole;
  focusRevisionId?: string | null;
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
        },
      },
      scopeRevisions: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          status: true,
          reasoning: true,
          priceDeltaCents: true,
          createdAt: true,
          approvedAt: true,
          appliedAt: true,
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

  const revisions: LoadedChangeOrderRevision[] = job.scopeRevisions.map((revision) => ({
    id: revision.id,
    status: revision.status,
    reasoning: revision.reasoning,
    priceDeltaCents: revision.priceDeltaCents,
    createdAt: revision.createdAt.toISOString(),
    approvedAt: revision.approvedAt?.toISOString() ?? null,
    appliedAt: revision.appliedAt?.toISOString() ?? null,
    lines: revision.lines.map(
      (line): ChangeOrderLineDraft => ({
        operation: line.operation,
        sourceJobScopeItemId: line.sourceJobScopeItemId,
        description: line.description,
        quantity: line.quantity.toString(),
        unitPriceCents: line.unitPriceCents,
        priceDeltaCents: line.priceDeltaCents,
        executionRelevant: line.executionRelevant,
      }),
    ),
  }));

  const focusRevisionId = resolveFocusedRevisionId({
    revisions,
    requestedRevisionId: input.focusRevisionId?.trim() || null,
  });

  return {
    jobId: job.id,
    jobTitle: job.title,
    jobStatus: job.status,
    jobPlanVersion: job.jobPlanVersion,
    quoteId: job.quote?.id ?? job.quoteId ?? "",
    quoteTitle: job.quote?.title ?? "Quote",
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
    })),
    revisions,
    focusRevisionId,
  };
}
