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
import { db, getDevOrganizationOrThrow } from "@/lib/db";
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
 * Activates an APPROVED quote into a runtime [Job] with [JobStage] / [JobTask] copies of the
 * quote's draft execution. One job per quote (enforced by [Job.quoteId @unique]).
 *
 * Transactional: validates inside the transaction so racing actions cannot create a second job.
 * Lineage is preserved on every row (sourceQuoteLineItemId, sourceQuoteLineExecutionTaskId,
 * sourceTaskTemplateId) so later quote/template edits do not mutate this runtime copy.
 */
export async function activateQuoteJobAction(
  quoteId: string,
  _prev: QuoteJobActivationFormState,
  formData: FormData,
): Promise<QuoteJobActivationFormState> {
  void formData;
  const id = quoteId.trim();
  if (!id) {
    return { error: "Missing quote record id." };
  }

  const org = await getDevOrganizationOrThrow();

  let createdJobId: string | null = null;

  try {
    createdJobId = await db.$transaction(async (tx) => {
      const quote = await tx.quote.findFirst({
        where: { id, organizationId: org.id },
        select: {
          id: true,
          title: true,
          status: true,
          customerId: true,
          leadId: true,
          customer: { select: { organizationId: true } },
          lead: { select: { organizationId: true } },
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
        quote.customer && quote.customer.organizationId === org.id ? quote.customerId : null;
      const safeLeadId =
        quote.lead && quote.lead.organizationId === org.id ? quote.leadId : null;

      const job = await tx.job.create({
        data: {
          organizationId: org.id,
          quoteId: quote.id,
          customerId: safeCustomerId,
          leadId: safeLeadId,
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
      return { error: e.message };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return {
        error:
          "A job for this quote was created at the same moment. Refresh the page to open it.",
      };
    }
    throw e;
  }

  if (!createdJobId) {
    return { error: "Activation did not return a job id. Refresh and try again." };
  }

  revalidatePath(`/quotes/${id}`);
  revalidatePath(`/quotes/${id}/execution-review`);
  revalidatePath("/quotes");
  revalidatePath("/jobs");
  revalidatePath(jobDetailPath(createdJobId));
  redirect(jobDetailPath(createdJobId));
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
