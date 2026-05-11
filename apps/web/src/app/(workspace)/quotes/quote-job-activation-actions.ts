"use server";

import {
  JobStageBlockType,
  JobStatus,
  JobTaskStatus,
  Prisma,
  QuoteLineExecutionMergeMode,
  QuoteLineExecutionReviewStatus,
  QuoteStatus,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import {
  EXECUTION_STAGE_KEYS_ORDERED,
  getExecutionStageLabel,
} from "@/lib/execution-stage-catalog";

import { jobDetailPath } from "@/lib/job-path";
import {
  evaluateQuoteJobActivationReadiness,
  type QuoteActivationLineInput,
} from "@/lib/quote-job-activation-readiness";

export type QuoteJobActivationFormState = {
  error?: string;
};

/**
 * Result type for the shared activation core. Both the redirecting form action
 * and the workspace-safe action call the same helper to avoid drift in
 * readiness rules, lineage, and idempotency.
 */
type PerformActivateQuoteJobResult =
  | { ok: true; jobId: string; salesIntakeId: string | null }
  | { ok: false; error: string };

/**
 * Shared activation transaction body — same readiness rules, same lineage,
 * same idempotency guard (`Job.quoteId @unique`) regardless of caller.
 *
 * Returns a result object rather than throwing across the action boundary.
 * Does not redirect, does not revalidate — those are caller concerns so the
 * redirecting and workspace-safe variants can choose what to invalidate.
 */
async function performActivateQuoteJob(
  rawQuoteId: string,
): Promise<PerformActivateQuoteJobResult> {
  const id = rawQuoteId.trim();
  if (!id) return { ok: false, error: "Missing quote record id." };

  const ctx = await getRequestContextOrThrow();

  let createdJobId: string | null = null;
  let salesIntakeIdForRevalidation: string | null = null;

  try {
    createdJobId = await db.$transaction(async (tx) => {
      const quote = await tx.quote.findFirst({
        where: { id, organizationId: ctx.organizationId },

        select: {
          id: true,
          title: true,
          status: true,
          customerId: true,
          salesIntakeId: true,
          customer: { select: { organizationId: true } },
          salesIntake: { select: { organizationId: true } },
          job: { select: { id: true } },
          lineItems: {
            orderBy: [{ sortOrder: "asc" }],
            select: {
              id: true,
              description: true,
              sortOrder: true,
              executionOrder: true,
              executionReviewStatus: true,
              executionMergeMode: true,
              draftExecutionTasks: {
                orderBy: [{ sortOrder: "asc" }],
                select: {
                  id: true,
                  title: true,
                  stageKey: true,
                  category: true,
                  instructions: true,
                  requirementsJson: true,
                  sortOrder: true,
                  sourceTaskTemplateId: true,
                  sourceType: true,
                },
              },
            },
          },
        },
      });

      if (!quote) {
        throw new ActivationError(
          "QUOTE_NOT_FOUND",
          "This quote could not be found in your organization. Refresh the page and try again.",
        );
      }
      if (quote.job) {
        throw new ActivationError(
          "ALREADY_ACTIVATED",
          "A job already exists for this quote.",
        );
      }
      if (quote.status !== QuoteStatus.APPROVED) {
        throw new ActivationError(
          "NOT_APPROVED",
          "Only approved quotes can be activated. Record customer acceptance first, then refresh.",
        );
      }

      const readinessLines: QuoteActivationLineInput[] = quote.lineItems.map((l) => ({
        id: l.id,
        description: l.description,
        executionReviewStatus: l.executionReviewStatus,
        executionMergeMode: l.executionMergeMode,
        taskCount: l.draftExecutionTasks.length,
      }));

      const readiness = evaluateQuoteJobActivationReadiness({
        status: quote.status,
        lines: readinessLines,
      });

      if (!readiness.ready) {
        const first = readiness.blockReasons[0];
        throw new ActivationError("NOT_READY", first.message);
      }

      const sortedLines = [...quote.lineItems].sort((a, b) => {
        if (a.executionOrder !== b.executionOrder) {
          return a.executionOrder - b.executionOrder;
        }
        if (a.sortOrder !== b.sortOrder) {
          return a.sortOrder - b.sortOrder;
        }
        return a.id.localeCompare(b.id);
      });

      const sharedContributors = sortedLines.filter(
        (l) =>
          l.executionReviewStatus !== QuoteLineExecutionReviewStatus.NO_EXECUTION_NEEDED &&
          l.executionMergeMode === QuoteLineExecutionMergeMode.MERGE_INTO_JOB_STAGES &&
          l.draftExecutionTasks.length > 0,
      );
      const separateContributors = sortedLines.filter(
        (l) =>
          l.executionReviewStatus !== QuoteLineExecutionReviewStatus.NO_EXECUTION_NEEDED &&
          l.executionMergeMode === QuoteLineExecutionMergeMode.KEEP_SEPARATE_BLOCK &&
          l.draftExecutionTasks.length > 0,
      );

      const safeCustomerId =
        quote.customer && quote.customer.organizationId === ctx.organizationId ? quote.customerId : null;
      const safeSalesIntakeId =
        quote.salesIntake && quote.salesIntake.organizationId === ctx.organizationId ? quote.salesIntakeId : null;
      salesIntakeIdForRevalidation = safeSalesIntakeId;

      const job = await tx.job.create({
        data: {
          organizationId: ctx.organizationId,
          quoteId: quote.id,
          customerId: safeCustomerId,
          salesIntakeId: safeSalesIntakeId,
          title: quote.title,
          status: JobStatus.ACTIVE,
        },
        select: { id: true },
      });


      let stageSortOrder = 0;

      for (const stageKey of EXECUTION_STAGE_KEYS_ORDERED) {
        const tasksInStage: {
          line: (typeof sharedContributors)[number];
          task: (typeof sharedContributors)[number]["draftExecutionTasks"][number];
        }[] = [];
        for (const line of sharedContributors) {
          for (const task of line.draftExecutionTasks) {
            if (task.stageKey === stageKey) {
              tasksInStage.push({ line, task });
            }
          }
        }
        if (tasksInStage.length === 0) {
          continue;
        }
        tasksInStage.sort((a, b) => {
          if (a.line.executionOrder !== b.line.executionOrder) {
            return a.line.executionOrder - b.line.executionOrder;
          }
          if (a.line.sortOrder !== b.line.sortOrder) {
            return a.line.sortOrder - b.line.sortOrder;
          }
          if (a.line.id !== b.line.id) {
            return a.line.id.localeCompare(b.line.id);
          }
          if (a.task.sortOrder !== b.task.sortOrder) {
            return a.task.sortOrder - b.task.sortOrder;
          }
          return a.task.id.localeCompare(b.task.id);
        });

        const stage = await tx.jobStage.create({
          data: {
            jobId: job.id,
            blockType: JobStageBlockType.SHARED,
            stageKey,
            title: getExecutionStageLabel(stageKey),
            sortOrder: stageSortOrder++,
            sourceQuoteLineItemId: null,
            blockTitle: null,
            blockSortOrder: 0,
          },
          select: { id: true },
        });

        let taskSortOrder = 0;
        for (const { line, task } of tasksInStage) {
          await tx.jobTask.create({
            data: {
              jobId: job.id,
              jobStageId: stage.id,
              sourceQuoteLineItemId: line.id,
              sourceQuoteLineExecutionTaskId: task.id,
              sourceTaskTemplateId: task.sourceTaskTemplateId,
              sourceType: task.sourceType,
              title: task.title,
              category: task.category,
              stageKey: task.stageKey,
              instructions: task.instructions,
              completionRequirementsJson: task.requirementsJson || {},
              status: JobTaskStatus.TODO,
              sortOrder: taskSortOrder++,
            },
          });
        }
      }

      let blockSortOrder = 1;
      for (const line of separateContributors) {
        const blockTitle = line.description;
        const currentBlockOrder = blockSortOrder++;
        for (const stageKey of EXECUTION_STAGE_KEYS_ORDERED) {
          const stageTasks = line.draftExecutionTasks
            .filter((t) => t.stageKey === stageKey)
            .sort((a, b) => {
              if (a.sortOrder !== b.sortOrder) {
                return a.sortOrder - b.sortOrder;
              }
              return a.id.localeCompare(b.id);
            });
          if (stageTasks.length === 0) {
            continue;
          }

          const stage = await tx.jobStage.create({
            data: {
              jobId: job.id,
              blockType: JobStageBlockType.SEPARATE_LINE_ITEM,
              stageKey,
              title: getExecutionStageLabel(stageKey),
              sortOrder: stageSortOrder++,
              sourceQuoteLineItemId: line.id,
              blockTitle,
              blockSortOrder: currentBlockOrder,
            },
            select: { id: true },
          });

          let taskSortOrder = 0;
          for (const task of stageTasks) {
            await tx.jobTask.create({
              data: {
                jobId: job.id,
                jobStageId: stage.id,
                sourceQuoteLineItemId: line.id,
                sourceQuoteLineExecutionTaskId: task.id,
                sourceTaskTemplateId: task.sourceTaskTemplateId,
                sourceType: task.sourceType,
                title: task.title,
                category: task.category,
                stageKey: task.stageKey,
                instructions: task.instructions,
                completionRequirementsJson: task.requirementsJson || {},
                status: JobTaskStatus.TODO,
                sortOrder: taskSortOrder++,
              },
            });
          }
        }
      }

      return job.id;
    });
  } catch (e) {
    if (e instanceof ActivationError) {
      return { ok: false, error: e.message };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return {
        ok: false,
        error:
          "A job for this quote was created at the same moment. Refresh the page to open it.",
      };
    }
    throw e;
  }

  if (!createdJobId) {
    return {
      ok: false,
      error: "Activation did not return a job id. Refresh and try again.",
    };
  }

  return { ok: true, jobId: createdJobId, salesIntakeId: salesIntakeIdForRevalidation };
}

function revalidateActivationSurfaces(quoteId: string, jobId: string, salesIntakeId: string | null) {
  revalidatePath(`/quotes/${quoteId}`);
  revalidatePath(`/quotes/${quoteId}/execution-review`);
  revalidatePath("/quotes");
  revalidatePath("/jobs");
  revalidatePath(jobDetailPath(jobId));
  if (salesIntakeId) {
    revalidatePath(`/sales/${salesIntakeId}`);
  }
  revalidatePath("/sales");
  revalidatePath("/workstation");
}

/**
 * Activates an APPROVED quote into a runtime [Job] with [JobStage] / [JobTask] copies of the
 * quote's draft execution. One job per quote (enforced by [Job.quoteId @unique]).
 *
 * Transactional: validates inside the transaction so racing actions cannot create a second job.
 * Lineage is preserved on every row (sourceQuoteLineItemId, sourceQuoteLineExecutionTaskId,
 * sourceTaskTemplateId) so later quote/template edits do not mutate this runtime copy.
 *
 * Redirects to the new job page on success — preserves the existing full-page activation UX.
 */
export async function activateQuoteJobAction(
  quoteId: string,
  _prev: QuoteJobActivationFormState,
  formData: FormData,
): Promise<QuoteJobActivationFormState> {
  void formData;
  const result = await performActivateQuoteJob(quoteId);
  if (!result.ok) {
    return { error: result.error };
  }
  revalidateActivationSurfaces(quoteId.trim(), result.jobId, result.salesIntakeId);
  redirect(jobDetailPath(result.jobId));
}

/**
 * Workspace-safe variant of {@link activateQuoteJobAction} — same readiness
 * rules, same transaction, same lineage, same `Job.quoteId @unique` idempotency
 * — but returns a result object instead of redirecting so the embedded Sales Intake
 * Quote tab can show inline success ("Job activated. Open job") without
 * navigating the user out of the Sales Intake workspace.
 *
 * `quoteId` must be supplied from a server-trusted surface (`.bind(null, ...)`).
 */
export type ActivateQuoteJobWorkspaceResult =
  | { success: true; jobId: string }
  | { success: false; error: string };

export async function activateQuoteJobWorkspaceAction(
  quoteId: string,
): Promise<ActivateQuoteJobWorkspaceResult> {
  const result = await performActivateQuoteJob(quoteId);
  if (!result.ok) {
    return { success: false, error: result.error };
  }
  revalidateActivationSurfaces(quoteId.trim(), result.jobId, result.salesIntakeId);
  return { success: true, jobId: result.jobId };
}

class ActivationError extends Error {
  constructor(
    public readonly code:
      | "QUOTE_NOT_FOUND"
      | "ALREADY_ACTIVATED"
      | "NOT_APPROVED"
      | "NOT_READY",
    message: string,
  ) {
    super(message);
    this.name = "ActivationError";
  }
}
