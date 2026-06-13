"use server";

import {
  ExecutionPlanRevisionKind,
  ExecutionPlanRevisionStatus,
  JobActivityType,
  JobScopeItemStatus,
  JobTaskStatus,
  Prisma,
  QuoteScopeRevisionLineOperation,
  QuoteScopeRevisionStatus,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireCurrentSession } from "@/lib/session";
import { recordJobActivity } from "@/lib/job-activity-helper";
import { validateScopeRevisionApplyGuards } from "@/lib/quote-scope-revision-apply-guards";
import { assertExecutionPlanPermission } from "@/lib/execution-plan-permissions";

type QuoteScopeRevisionLineInput = {
  operation: QuoteScopeRevisionLineOperation;
  sourceJobScopeItemId?: string | null;
  description: string;
  quantity: string;
  unitPriceCents?: number | null;
  priceDeltaCents?: number | null;
  executionRelevant?: boolean;
  scopeDataJson?: unknown;
};

type CreateQuoteScopeRevisionInput = {
  quoteId: string;
  jobId: string;
  reasoning: string;
  priceDeltaCents?: number;
  lines: QuoteScopeRevisionLineInput[];
};

type QuoteScopeRevisionActionResult =
  | { ok: true; revisionId: string }
  | { ok: false; error: string };

type QuoteScopeRevisionApplyResult =
  | {
      ok: true;
      revisionId: string;
      executionPlanRevisionId: string;
      resultingJobPlanVersion: number;
    }
  | { ok: false; error: string };

function revalidateScopeRevisionSurfaces(quoteId: string, jobId: string) {
  revalidatePath(`/quotes/${quoteId}`);
  revalidatePath(`/quotes/${quoteId}/execution-review`);
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/workstation");
  revalidatePath("/workstation/tasks");
}

export async function createQuoteScopeRevisionDraftAction(
  input: CreateQuoteScopeRevisionInput,
): Promise<QuoteScopeRevisionActionResult> {
  const session = await requireCurrentSession();
  const permission = assertExecutionPlanPermission(session.role, "approve_scope_revision");
  if (!permission.ok) return { ok: false, error: permission.error };

  if (!input.reasoning.trim()) {
    return { ok: false, error: "Reasoning is required." };
  }
  if (input.lines.length === 0) {
    return { ok: false, error: "At least one scope revision line is required." };
  }

  const created = await db.$transaction(async (tx) => {
    const inTxPermission = assertExecutionPlanPermission(session.role, "approve_scope_revision");
    if (!inTxPermission.ok) {
      return { ok: false as const, error: inTxPermission.error };
    }
    const quote = await tx.quote.findFirst({
      where: {
        id: input.quoteId,
        organizationId: session.organizationId,
        job: { is: { id: input.jobId } },
      },
      select: { id: true, job: { select: { id: true } } },
    });
    if (!quote?.job?.id) {
      return { ok: false as const, error: "Quote/job pair not found for scope revision." };
    }
    const revision = await tx.quoteScopeRevision.create({
      data: {
        organizationId: session.organizationId,
        quoteId: quote.id,
        jobId: quote.job.id,
        status: QuoteScopeRevisionStatus.DRAFT,
        reasoning: input.reasoning.trim(),
        priceDeltaCents: input.priceDeltaCents ?? 0,
        lines: {
          createMany: {
            data: input.lines.map((line) => ({
              organizationId: session.organizationId,
              operation: line.operation,
              sourceJobScopeItemId: line.sourceJobScopeItemId ?? null,
              description: line.description,
              quantity: line.quantity,
              unitPriceCents: line.unitPriceCents ?? null,
              priceDeltaCents: line.priceDeltaCents ?? null,
              executionRelevant: line.executionRelevant ?? true,
              scopeDataJson:
                line.scopeDataJson == null
                  ? Prisma.JsonNull
                  : (line.scopeDataJson as Prisma.InputJsonValue),
            })),
          },
        },
      },
      select: { id: true },
    });
    return { ok: true as const, revisionId: revision.id };
  });

  if (!created.ok) return created;
  revalidateScopeRevisionSurfaces(input.quoteId, input.jobId);
  return created;
}

export async function approveQuoteScopeRevisionAction(
  revisionId: string,
): Promise<QuoteScopeRevisionActionResult> {
  const session = await requireCurrentSession();
  const permission = assertExecutionPlanPermission(session.role, "approve_scope_revision");
  if (!permission.ok) return { ok: false, error: permission.error };

  const id = revisionId.trim();
  if (!id) return { ok: false, error: "Missing scope revision id." };
  const revision = await db.$transaction(async (tx) => {
    const inTxPermission = assertExecutionPlanPermission(session.role, "approve_scope_revision");
    if (!inTxPermission.ok) {
      return { ok: false as const, error: inTxPermission.error };
    }
    const updated = await tx.quoteScopeRevision.updateMany({
      where: {
        id,
        organizationId: session.organizationId,
        status: QuoteScopeRevisionStatus.DRAFT,
      },
      data: {
        status: QuoteScopeRevisionStatus.APPROVED,
        approvedAt: new Date(),
        approvedByUserId: session.userId,
      },
    });
    if (updated.count === 0) {
      return { ok: false as const, error: "Scope revision is not in draft state or was not found." };
    }
    const row = await tx.quoteScopeRevision.findUnique({
      where: { id },
      select: { quoteId: true, jobId: true },
    });
    if (!row) {
      return { ok: false as const, error: "Scope revision was updated but could not be reloaded." };
    }
    return { ok: true as const, quoteId: row.quoteId, jobId: row.jobId };
  });
  if (!revision.ok) {
    return revision;
  }
  revalidateScopeRevisionSurfaces(revision.quoteId, revision.jobId);
  return { ok: true, revisionId: id };
}

export async function applyQuoteScopeRevisionAction(
  revisionId: string,
  options?: {
    expectedJobPlanVersion?: number | null;
    hasApprovedPaymentImpactOperationInTx?: boolean;
  },
): Promise<QuoteScopeRevisionApplyResult> {
  const session = await requireCurrentSession();
  const permission = assertExecutionPlanPermission(session.role, "apply_scope_revision");
  if (!permission.ok) return { ok: false, error: permission.error };

  const id = revisionId.trim();
  if (!id) return { ok: false, error: "Missing scope revision id." };

  const applied = await db.$transaction(async (tx) => {
    const inTxPermission = assertExecutionPlanPermission(session.role, "apply_scope_revision");
    if (!inTxPermission.ok) {
      return { ok: false as const, error: inTxPermission.error };
    }
    const revision = await tx.quoteScopeRevision.findFirst({
      where: {
        id,
        organizationId: session.organizationId,
      },
      select: {
        id: true,
        organizationId: true,
        quoteId: true,
        jobId: true,
        status: true,
        priceDeltaCents: true,
        reasoning: true,
        lines: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            operation: true,
            sourceJobScopeItemId: true,
            description: true,
            quantity: true,
            unitPriceCents: true,
            priceDeltaCents: true,
            executionRelevant: true,
            scopeDataJson: true,
          },
        },
      },
    });
    if (!revision) {
      return { ok: false as const, error: "Scope revision was not found." };
    }
    if (revision.status !== QuoteScopeRevisionStatus.APPROVED) {
      return { ok: false as const, error: "Only approved scope revisions can be applied." };
    }

    const job = await tx.job.findFirst({
      where: {
        id: revision.jobId,
        organizationId: session.organizationId,
      },
      select: { id: true, jobPlanVersion: true },
    });
    if (!job) {
      return { ok: false as const, error: "Scope revision job was not found." };
    }
    if (
      options?.expectedJobPlanVersion != null &&
      options.expectedJobPlanVersion !== job.jobPlanVersion
    ) {
      return {
        ok: false as const,
        error: "Job plan changed. Refresh and retry with the latest scope revision state.",
      };
    }

    for (const line of revision.lines) {
      if (line.operation !== QuoteScopeRevisionLineOperation.ADD && !line.sourceJobScopeItemId) {
        return {
          ok: false as const,
          error: "MODIFY/REMOVE lines require a source job scope item.",
        };
      }
    }

    for (const line of revision.lines) {
      if (line.operation === QuoteScopeRevisionLineOperation.ADD) {
        await tx.jobScopeItem.create({
          data: {
            organizationId: revision.organizationId,
            jobId: revision.jobId,
            sourceQuoteScopeRevisionLineId: line.id,
            description: line.description,
            quantity: line.quantity,
            unitPriceCents: line.unitPriceCents,
            executionRelevant: line.executionRelevant,
            status: JobScopeItemStatus.ACTIVE,
          },
        });
        continue;
      }

      const sourceItem = await tx.jobScopeItem.findFirst({
        where: {
          id: line.sourceJobScopeItemId!,
          organizationId: revision.organizationId,
          jobId: revision.jobId,
        },
        select: { id: true, status: true },
      });
      if (!sourceItem || sourceItem.status !== JobScopeItemStatus.ACTIVE) {
        return {
          ok: false as const,
          error: "Source scope item must exist and be active for MODIFY/REMOVE operations.",
        };
      }

      if (line.operation === QuoteScopeRevisionLineOperation.MODIFY) {
        const replacement = await tx.jobScopeItem.create({
          data: {
            organizationId: revision.organizationId,
            jobId: revision.jobId,
            sourceQuoteScopeRevisionLineId: line.id,
            description: line.description,
            quantity: line.quantity,
            unitPriceCents: line.unitPriceCents,
            executionRelevant: line.executionRelevant,
            status: JobScopeItemStatus.ACTIVE,
          },
          select: { id: true },
        });

        await tx.jobScopeItem.update({
          where: { id: sourceItem.id },
          data: {
            status: JobScopeItemStatus.SUPERSEDED,
            supersededByJobScopeItemId: replacement.id,
          },
        });

        const scopedTasks = await tx.jobTaskScope.findMany({
          where: { jobScopeItemId: sourceItem.id },
          select: {
            jobTaskId: true,
            jobTask: { select: { id: true, status: true } },
          },
        });
        for (const taskScope of scopedTasks) {
          const status = taskScope.jobTask.status;
          if (status === JobTaskStatus.DONE || status === JobTaskStatus.CANCELED) {
            continue;
          }
          await tx.jobTaskScope.upsert({
            where: {
              jobTaskId_jobScopeItemId: {
                jobTaskId: taskScope.jobTaskId,
                jobScopeItemId: replacement.id,
              },
            },
            create: {
              organizationId: revision.organizationId,
              jobTaskId: taskScope.jobTaskId,
              jobScopeItemId: replacement.id,
            },
            update: {},
          });
          await tx.jobTaskScope.deleteMany({
            where: {
              jobTaskId: taskScope.jobTaskId,
              jobScopeItemId: sourceItem.id,
            },
          });
        }
        continue;
      }

      await tx.jobScopeItem.update({
        where: { id: sourceItem.id },
        data: { status: JobScopeItemStatus.REMOVED },
      });

      const scopedTasks = await tx.jobTaskScope.findMany({
        where: { jobScopeItemId: sourceItem.id },
        select: {
          jobTaskId: true,
          jobTask: {
            select: {
              id: true,
              title: true,
              status: true,
              canceledAt: true,
            },
          },
        },
      });
      for (const taskScope of scopedTasks) {
        const task = taskScope.jobTask;
        if (task.status === JobTaskStatus.DONE || task.status === JobTaskStatus.CANCELED) {
          continue;
        }
        const remainingScopesCount = await tx.jobTaskScope.count({
          where: {
            jobTaskId: task.id,
            jobScopeItemId: { not: sourceItem.id },
          },
        });
        if (remainingScopesCount > 0) {
          await tx.jobTaskScope.deleteMany({
            where: {
              jobTaskId: task.id,
              jobScopeItemId: sourceItem.id,
            },
          });
          continue;
        }

        await tx.jobTask.update({
          where: { id: task.id },
          data: {
            status: JobTaskStatus.CANCELED,
            canceledAt: task.canceledAt ?? new Date(),
            canceledByUserId: session.userId,
            canceledReason: "Scope removed by approved scope revision",
          },
        });
        await recordJobActivity(
          {
            organizationId: revision.organizationId,
            jobId: revision.jobId,
            type: JobActivityType.TASK_CANCELED,
            title: `Task canceled due to scope removal: ${task.title}`,
            entityType: "JobTask",
            entityId: task.id,
            actorUserId: session.userId,
            metadataJson: {
              sourceQuoteScopeRevisionId: revision.id,
              scopeItemId: sourceItem.id,
            },
          },
          tx,
        );
      }
    }

    const postScopeItems = await tx.jobScopeItem.findMany({
      where: { jobId: revision.jobId },
      select: {
        id: true,
        executionRelevant: true,
        status: true,
      },
    });
    const postTasks = await tx.jobTask.findMany({
      where: { jobId: revision.jobId },
      select: {
        id: true,
        status: true,
        hardSignal: true,
        requiresSignals: true,
        providesSignals: true,
        scopes: { select: { jobScopeItemId: true } },
      },
    });
    const guards = validateScopeRevisionApplyGuards({
      priceDeltaCents: revision.priceDeltaCents,
      hasApprovedPaymentImpactOperationInTx:
        options?.hasApprovedPaymentImpactOperationInTx ?? false,
      scopeItems: postScopeItems.map((item) => ({
        id: item.id,
        executionRelevant: item.executionRelevant,
        status: item.status,
      })),
      tasks: postTasks.map((task) => ({
        id: task.id,
        status: task.status,
        hardSignal: task.hardSignal,
        requiresSignals: task.requiresSignals,
        providesSignals: task.providesSignals,
        jobScopeItemIds: task.scopes.map((scope) => scope.jobScopeItemId),
      })),
    });
    if (!guards.ok) {
      return { ok: false as const, error: guards.errors.join(" ") };
    }

    const resultingJobPlanVersion = job.jobPlanVersion + 1;
    await tx.job.update({
      where: { id: revision.jobId },
      data: {
        jobPlanVersion: resultingJobPlanVersion,
      },
    });
    await tx.quoteScopeRevision.update({
      where: { id: revision.id },
      data: {
        status: QuoteScopeRevisionStatus.APPLIED,
        appliedAt: new Date(),
      },
    });
    const executionPlanRevision = await tx.executionPlanRevision.create({
      data: {
        organizationId: revision.organizationId,
        quoteId: revision.quoteId,
        jobId: revision.jobId,
        quoteScopeRevisionId: revision.id,
        kind: ExecutionPlanRevisionKind.SCOPE_RECONCILIATION,
        status: ExecutionPlanRevisionStatus.APPLIED,
        basePlanVersion: job.jobPlanVersion,
        resultingPlanVersion: resultingJobPlanVersion,
        proposalJson: {
          scopeRevisionId: revision.id,
          lines: revision.lines.map((line) => ({
            id: line.id,
            operation: line.operation,
            sourceJobScopeItemId: line.sourceJobScopeItemId,
            description: line.description,
          })),
        },
        proposalSchemaVersion: 1,
        plannerVersion: "scope-revision-v1",
        modelProviderMeta: {
          source: "applyQuoteScopeRevisionAction",
          zeroDollarOnlyPolicy:
            options?.hasApprovedPaymentImpactOperationInTx === true
              ? "approved-payment-op-present"
              : "blocked-unless-zero-delta",
        },
        planningInputHash: null,
        reasoningSummary: revision.reasoning,
        approvedByUserId: session.userId,
        appliedAt: new Date(),
      },
      select: { id: true },
    });
    await recordJobActivity(
      {
        organizationId: revision.organizationId,
        jobId: revision.jobId,
        type: JobActivityType.SCOPE_REVISION_APPLIED,
        title: "Scope revision applied",
        details: revision.reasoning,
        entityType: "QuoteScopeRevision",
        entityId: revision.id,
        actorUserId: session.userId,
        metadataJson: {
          revisionId: revision.id,
          resultingJobPlanVersion,
          executionPlanRevisionId: executionPlanRevision.id,
          lineCount: revision.lines.length,
        },
      },
      tx,
    );
    return {
      ok: true as const,
      revisionId: revision.id,
      executionPlanRevisionId: executionPlanRevision.id,
      resultingJobPlanVersion,
      quoteId: revision.quoteId,
      jobId: revision.jobId,
    };
  });

  if (!applied.ok) return applied;
  revalidateScopeRevisionSurfaces(applied.quoteId, applied.jobId);
  return {
    ok: true,
    revisionId: applied.revisionId,
    executionPlanRevisionId: applied.executionPlanRevisionId,
    resultingJobPlanVersion: applied.resultingJobPlanVersion,
  };
}

