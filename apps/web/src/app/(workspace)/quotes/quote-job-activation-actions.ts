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
import {
  assignJobTaskSortOrdersAtActivation,
} from "@/lib/quote-job-activation-task-order";
import { materializePaymentScheduleForActivation } from "@/lib/payment-schedule-materialization";
import { normalizeSignalKey, toNormalizedSignalSet } from "@/lib/signal-key";
import { QUOTE_PLAN_INPUT_SCHEMA_VERSION, buildQuotePlanPlanningInput, loadQuotePlanContext } from "@/lib/quote-plan/quote-plan-context";
import { computeQuotePlanningInputHash } from "@/lib/quote-plan/planning-input-hash";

export type QuoteJobActivationFormState = {
  error?: string;
};

type PerformActivateQuoteJobResult =
  | { ok: true; jobId: string; leadId: string | null }
  | { ok: false; error: string };

async function performActivateQuoteJob(
  rawQuoteId: string,
  formData?: FormData,
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
          serviceLocationId: true,
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
              quantity: true,
              unitAmountCents: true,
              executionRelevant: true,
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
          executionPlan: {
            select: {
              id: true,
              status: true,
              planVersion: true,
              planningInputHash: true,
              planningInputSchemaVersion: true,
              tasks: {
                orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
                select: {
                  id: true,
                  title: true,
                  category: true,
                  instructions: true,
                  stageId: true,
                  sourceTaskTemplateId: true,
                  sourceType: true,
                  sourceQuoteLineExecutionTaskId: true,
                  sourceLineItemTemplateTaskId: true,
                  origin: true,
                  planningTags: true,
                  requirementsJson: true,
                  partsRequiredJson: true,
                  providesSignals: true,
                  requiresSignals: true,
                  hardSignal: true,
                  sortOrder: true,
                  scopes: {
                    select: { quoteLineItemId: true },
                  },
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

      if (!quote.executionPlan) {
        throw new ActivationError(
          "NOT_READY",
          "Execution plan is missing. Build and accept a whole-quote plan before activation.",
        );
      }
      const planContext = await loadQuotePlanContext(quote.id, ctx.organizationId, tx);
      if (!planContext) {
        throw new ActivationError("NOT_READY", "Could not load plan context for activation checks.");
      }
      const currentPlanningInputHash = computeQuotePlanningInputHash(
        buildQuotePlanPlanningInput(planContext),
        quote.executionPlan.planningInputSchemaVersion ?? QUOTE_PLAN_INPUT_SCHEMA_VERSION,
      );
      const expectedPlanVersionRaw = formData?.get("expectedPlanVersion");
      const expectedPlanVersion =
        typeof expectedPlanVersionRaw === "string" && expectedPlanVersionRaw.trim()
          ? Number.parseInt(expectedPlanVersionRaw.trim(), 10)
          : null;

      const tasksByLineId = new Map<string, QuoteActivationLineInput["tasks"]>();
      for (const line of quote.lineItems) {
        tasksByLineId.set(line.id, []);
      }
      for (const task of quote.executionPlan.tasks) {
        for (const scope of task.scopes) {
          const lineTasks = tasksByLineId.get(scope.quoteLineItemId);
          if (!lineTasks) continue;
          lineTasks.push({
            id: task.id,
            title: task.title,
            stageId: task.stageId,
            providesSignals: task.providesSignals,
            requiresSignals: task.requiresSignals,
            hardSignal: task.hardSignal,
          });
        }
      }
      const readinessLines: QuoteActivationLineInput[] = quote.lineItems.map((line) => ({
        id: line.id,
        description: line.description,
        executionRelevant: line.executionRelevant,
        tasks: tasksByLineId.get(line.id) ?? [],
      }));

      const readiness = evaluateQuoteJobActivationReadiness({
        status: quote.status,
        hasApprovalCheckpoint: Boolean(approvalCheckpoint),
        executionPlan: {
          status: quote.executionPlan.status,
          planVersion: quote.executionPlan.planVersion,
          expectedPlanVersion: Number.isFinite(expectedPlanVersion) ? expectedPlanVersion : null,
          acceptedPlanningInputHash: quote.executionPlan.planningInputHash,
          currentPlanningInputHash,
        },
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
          serviceLocationId: quote.serviceLocationId,
          leadId: safeLeadId,
          title: quote.title,
          status: JobStatus.ACTIVE,
        },
        select: { id: true },
      });

      // 1. Collect all unique stage IDs used in accepted quote plan tasks
      const usedStageIds = new Set<string>();
      for (const task of quote.executionPlan.tasks) {
        if (task.stageId) usedStageIds.add(task.stageId);
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

      // 2b. Materialize active job scope rows from execution-relevant quote lines.
      const jobScopeItemByLineId = new Map<string, string>();
      for (const line of quote.lineItems) {
        if (!line.executionRelevant) continue;
        const scopeItem = await tx.jobScopeItem.create({
          data: {
            organizationId: ctx.organizationId,
            jobId: job.id,
            sourceQuoteLineItemId: line.id,
            description: line.description,
            quantity: line.quantity,
            unitPriceCents: line.unitAmountCents,
            executionRelevant: line.executionRelevant,
            status: "ACTIVE",
          },
          select: { id: true },
        });
        jobScopeItemByLineId.set(line.id, scopeItem.id);
      }

      // 3. Materialize JobTasks from quote plan tasks, preserving deterministic ordering.
      const orderedPlanTasks = assignJobTaskSortOrdersAtActivation(
        quote.executionPlan.tasks.map((task) => ({
          id: task.id,
          stageId: task.stageId,
          sortOrder: task.sortOrder,
        })),
      );
      const jobTaskSortOrderByPlanTaskId = new Map<string, number>(
        orderedPlanTasks.map((task) => [task.id, task.jobTaskSortOrder]),
      );
      const allTasksToActivate = quote.executionPlan.tasks;

      let activatedTaskCount = 0;

      for (const task of allTasksToActivate) {
        const jobStageId = task.stageId ? stageIdToJobStageId[task.stageId] : null;
        if (!jobStageId) {
          throw new ActivationError(
            "NOT_READY",
            `Task "${task.title}" has no stage assigned—assign a stage before activation.`,
          );
        }

        const jobTaskSortOrder = jobTaskSortOrderByPlanTaskId.get(task.id);
        if (jobTaskSortOrder === undefined) {
          throw new ActivationError(
            "NOT_READY",
            `Task "${task.title}" could not be assigned a stable sort order during activation.`,
          );
        }

        const createdJobTask = await tx.jobTask.create({
          data: {
            jobId: job.id,
            jobStageId: jobStageId,
            sourceQuoteLineItemId: task.scopes[0]?.quoteLineItemId ?? null,
            sourceQuoteLineExecutionTaskId: task.sourceQuoteLineExecutionTaskId,
            sourceQuoteExecutionTaskId: task.id,
            sourceTaskTemplateId: task.sourceTaskTemplateId,
            sourceType: task.sourceType,
            origin: task.origin,
            planningTags: task.planningTags,
            title: task.title,
            category: task.category,
            stageId: task.stageId,
            instructions: task.instructions,
            completionRequirementsJson: (task.requirementsJson ?? {}) as Prisma.InputJsonValue,
            partsRequiredJson:
              task.partsRequiredJson == null
                ? Prisma.JsonNull
                : (task.partsRequiredJson as Prisma.InputJsonValue),
            providesSignals: task.providesSignals,
            requiresSignals: task.requiresSignals,
            hardSignal: task.hardSignal,
            status: JobTaskStatus.TODO,
            sortOrder: jobTaskSortOrder,
          },
          select: { id: true },
        });
        for (const scope of task.scopes) {
          const jobScopeItemId = jobScopeItemByLineId.get(scope.quoteLineItemId);
          if (!jobScopeItemId) continue;
          await tx.jobTaskScope.create({
            data: {
              organizationId: ctx.organizationId,
              jobTaskId: createdJobTask.id,
              jobScopeItemId,
            },
          });
        }
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
  const result = await performActivateQuoteJob(quoteId, formData);
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
