"use server";

import {
  JobActivityType,
  JobStatus,
  JobTaskStatus,
  Prisma,
  QuoteCheckpointKind,
  QuoteStatus,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { jobDetailPath } from "@/lib/job-path";
import {
  evaluateQuoteJobActivationReadiness,
  type QuoteActivationLineInput,
} from "@/lib/quote-job-activation-readiness";
import { recordJobActivity } from "@/lib/job-activity-helper";
import { publishSignal } from "@/lib/signal-bus";
import { buildJobTaskSortOrderMap } from "@/lib/quote-job-activation-task-order";
import { materializePaymentScheduleForActivation } from "@/lib/payment-schedule-materialization";
import { normalizeSignalKey, toNormalizedSignalSet } from "@/lib/signal-key";

export type QuoteJobActivationFormState = {
  error?: string;
};

type PerformActivateQuoteJobResult =
  | { ok: true; jobId: string; leadId: string | null }
  | { ok: false; error: string };

async function performActivateQuoteJob(
  rawQuoteId: string,
): Promise<PerformActivateQuoteJobResult> {
  const id = rawQuoteId.trim();
  if (!id) return { ok: false, error: "Missing quote record id." };

  const ctx = await getRequestContextOrThrow();

  let createdJobId: string | null = null;
  let leadIdForRevalidation: string | null = null;

  try {
    createdJobId = await db.$transaction(async (tx) => {
      const quote = await tx.quote.findFirst({
        where: { id, organizationId: ctx.organizationId },
        select: {
          id: true,
          title: true,
          status: true,
          customerId: true,
          leadId: true,
          customer: { select: { organizationId: true } },
          lead: { select: { organizationId: true } },
          job: { select: { id: true } },
          totalCents: true,
          paymentSchedule: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              title: true,
              amountCents: true,
              percentage: true,
              anchorType: true,
              anchorStageId: true,
            },
          },
          lineItems: {
            orderBy: [{ sortOrder: "asc" }],
            select: {
              id: true,
              description: true,
              sortOrder: true,
              draftExecutionTasks: {
                orderBy: [{ sortOrder: "asc" }],
                select: {
                  id: true,
                  title: true,
                  stageId: true,
                  category: true,
                  instructions: true,
                  requirementsJson: true,
                  providesSignals: true,
                  requiresSignals: true,
                  hardSignal: true,
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
          "This quote could not be found in your organization.",
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
          "Only approved quotes can be activated.",
        );
      }

      const approvalCheckpoint = await tx.quoteCheckpoint.findFirst({
        where: {
          organizationId: ctx.organizationId,
          quoteId: quote.id,
          kind: QuoteCheckpointKind.APPROVAL,
        },
        orderBy: { sequence: "desc" },
        select: { id: true },
      });
      if (!approvalCheckpoint) {
        throw new ActivationError(
          "NOT_APPROVED",
          "Record customer acceptance with an approval checkpoint before activating.",
        );
      }

      const readinessLines: QuoteActivationLineInput[] = quote.lineItems.map((l) => ({
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
      }));

      const readiness = evaluateQuoteJobActivationReadiness({
        status: quote.status,
        hasApprovalCheckpoint: Boolean(approvalCheckpoint),
        lines: readinessLines,
        quoteTotalCents: quote.totalCents,
        paymentSchedule: quote.paymentSchedule.map((item) => ({
          id: item.id,
          title: item.title,
          anchorType: item.anchorType,
          amountCents: item.amountCents,
          percentage: item.percentage,
        })),
      });

      if (!readiness.ready) {
        const first = readiness.blockReasons[0];
        throw new ActivationError("NOT_READY", first.message);
      }

      const safeCustomerId =
        quote.customer && quote.customer.organizationId === ctx.organizationId ? quote.customerId : null;
      const safeLeadId =
        quote.lead && quote.lead.organizationId === ctx.organizationId ? quote.leadId : null;
      leadIdForRevalidation = safeLeadId;

      const job = await tx.job.create({
        data: {
          organizationId: ctx.organizationId,
          quoteId: quote.id,
          customerId: safeCustomerId,
          leadId: safeLeadId,
          title: quote.title,
          status: JobStatus.ACTIVE,
        },
        select: { id: true },
      });

      // 1. Collect all unique stage IDs used in the quote
      const usedStageIds = new Set<string>();
      for (const line of quote.lineItems) {
        for (const task of line.draftExecutionTasks) {
          if (task.stageId) usedStageIds.add(task.stageId);
        }
      }

      // 2. Materialize JobStages from the Stage table
      const stages = await tx.stage.findMany({
        where: { id: { in: Array.from(usedStageIds) } },
        orderBy: { sortOrder: "asc" },
      });

      const stageIdToJobStageId: Record<string, string> = {};
      let jobStageSortOrder = 0;

      for (const stage of stages) {
        const jobStage = await tx.jobStage.create({
          data: {
            jobId: job.id,
            stageId: stage.id,
            title: stage.name,
            sortOrder: jobStageSortOrder++,
          },
        });
        stageIdToJobStageId[stage.id] = jobStage.id;
      }

      // 3. Materialize JobTasks
      const jobTaskSortOrderByExecutionTaskId = buildJobTaskSortOrderMap(quote.lineItems);

      const allTasksToActivate = quote.lineItems.flatMap(l => 
        l.draftExecutionTasks.map(t => ({ ...t, lineId: l.id }))
      );

      let activatedTaskCount = 0;

      for (const task of allTasksToActivate) {
        const jobStageId = task.stageId ? stageIdToJobStageId[task.stageId] : null;
        if (!jobStageId) {
          throw new ActivationError(
            "NOT_READY",
            `Task "${task.title}" has no stage assigned—assign a stage before activation.`,
          );
        }

        const jobTaskSortOrder = jobTaskSortOrderByExecutionTaskId.get(task.id);
        if (jobTaskSortOrder === undefined) {
          throw new ActivationError(
            "NOT_READY",
            `Task "${task.title}" could not be assigned a stable sort order during activation.`,
          );
        }

        await tx.jobTask.create({
          data: {
            jobId: job.id,
            jobStageId: jobStageId,
            sourceQuoteLineItemId: task.lineId,
            sourceQuoteLineExecutionTaskId: task.id,
            sourceTaskTemplateId: task.sourceTaskTemplateId,
            sourceType: task.sourceType,
            title: task.title,
            category: task.category,
            stageId: task.stageId,
            instructions: task.instructions,
            completionRequirementsJson: task.requirementsJson || {},
            providesSignals: task.providesSignals,
            requiresSignals: task.requiresSignals,
            hardSignal: task.hardSignal,
            status: JobTaskStatus.TODO,
            sortOrder: jobTaskSortOrder,
          },
        });
        activatedTaskCount += 1;
      }

      // 4. Initialize Signal Bus & Auto-satisfy Soft Orphans
      const allProvidedSignals = toNormalizedSignalSet(
        allTasksToActivate.flatMap((t) => t.providesSignals),
      );
      const requiredSignalAliasByKey = new Map<string, string>();
      for (const task of allTasksToActivate) {
        for (const requiredSignal of task.requiresSignals) {
          const requiredKey = normalizeSignalKey(requiredSignal);
          if (!requiredSignalAliasByKey.has(requiredKey)) {
            requiredSignalAliasByKey.set(requiredKey, requiredSignal);
          }
        }
      }

      for (const requiredKey of requiredSignalAliasByKey.keys()) {
        if (!allProvidedSignals.has(requiredKey)) {
          // This is an orphan. If it's not a hard signal, auto-satisfy it.
          const isHard = allTasksToActivate.some(
            (t) =>
              t.hardSignal &&
              t.requiresSignals.some((signal) => normalizeSignalKey(signal) === requiredKey),
          );
          if (!isHard) {
            const publishName = requiredSignalAliasByKey.get(requiredKey) ?? requiredKey;
            await publishSignal({
              jobId: job.id,
              name: publishName,
              tx,
            });
          }
        }
      }

      // 5. Materialize JobPaymentRequirements from PaymentSchedule
      const materializedPayments = materializePaymentScheduleForActivation(
        quote.paymentSchedule.map((item) => ({
          id: item.id,
          title: item.title,
          anchorType: item.anchorType,
          amountCents: item.amountCents,
          percentage: item.percentage,
        })),
        quote.totalCents,
      );

      if (!materializedPayments.ok) {
        const first = materializedPayments.errors[0];
        throw new ActivationError("NOT_READY", first.message);
      }

      const scheduleById = new Map(
        quote.paymentSchedule.map((item) => [item.id, item] as const),
      );

      for (const item of materializedPayments.items) {
        const source = scheduleById.get(item.id);
        const jobStageId = source?.anchorStageId
          ? stageIdToJobStageId[source.anchorStageId]
          : null;

        await tx.jobPaymentRequirement.create({
          data: {
            organizationId: ctx.organizationId,
            jobId: job.id,
            title: item.title,
            amountCents: item.amountCents,
            requiredBeforeStageId:
              item.anchorType === "BEFORE_STAGE" ? jobStageId : null,
            sourcePaymentScheduleItemId: item.id,
            status: "PENDING",
          },
        });
      }

      await recordJobActivity(
        {
          organizationId: ctx.organizationId,
          jobId: job.id,
          type: JobActivityType.JOB_ACTIVATED,
          title: "Job activated from approved quote",
          details: `Copied ${activatedTaskCount} tasks from quote execution planning.`,
          entityType: "Quote",
          entityId: quote.id,
          actorUserId: ctx.userId,
          metadataJson: {
            quoteId: quote.id,
            activatedTaskCount,
            approvalCheckpointId: approvalCheckpoint.id,
          },
        },
        tx,
      );

      return job.id;
    });
  } catch (e) {
    if (e instanceof ActivationError) {
      return { ok: false, error: e.message };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return {
        ok: false,
        error: "A job for this quote was created at the same moment.",
      };
    }
    throw e;
  }

  if (!createdJobId) {
    return {
      ok: false,
      error: "Activation did not return a job id.",
    };
  }

  return { ok: true, jobId: createdJobId, leadId: leadIdForRevalidation };
}

function revalidateActivationSurfaces(quoteId: string, jobId: string, leadId: string | null) {
  revalidatePath("/jobs");
  revalidatePath(jobDetailPath(jobId));
  if (leadId) {
    revalidatePath(`/leads/${leadId}`);
  }
  revalidatePath("/leads");
  revalidatePath("/workstation");
}

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
  revalidateActivationSurfaces(quoteId.trim(), result.jobId, result.leadId);
  redirect(jobDetailPath(result.jobId));
}

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
  revalidateActivationSurfaces(quoteId.trim(), result.jobId, result.leadId);
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
