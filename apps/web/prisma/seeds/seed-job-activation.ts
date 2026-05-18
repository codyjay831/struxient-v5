/**
 * Materialize a job from an approved quote — mirrors quote-job-activation-actions (no auth).
 */

import {
  JobActivityType,
  JobStatus,
  JobTaskStatus,
  LeadStatus,
  QuoteCheckpointKind,
  QuoteStatus,
  type PrismaClient,
} from "@prisma/client";
import { evaluateQuoteJobActivationReadiness } from "../../src/lib/quote-job-activation-readiness";
import { buildJobTaskSortOrderMap } from "../../src/lib/quote-job-activation-task-order";

export async function activateQuoteJobForSeed(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    quoteId: string;
    jobId: string;
    actorUserId?: string | null;
  },
): Promise<{ jobId: string; taskCount: number }> {
  const { organizationId, quoteId, jobId, actorUserId } = input;

  const existingJob = await prisma.job.findUnique({ where: { quoteId } });
  if (existingJob) {
    return {
      jobId: existingJob.id,
      taskCount: await prisma.jobTask.count({ where: { jobId: existingJob.id } }),
    };
  }

  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, organizationId },
    select: {
      id: true,
      title: true,
      status: true,
      totalCents: true,
      customerId: true,
      leadId: true,
      paymentSchedule: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          title: true,
          amountCents: true,
          percentage: true,
          anchorType: true,
        },
      },
      customer: { select: { organizationId: true } },
      lead: { select: { organizationId: true } },
      lineItems: {
        orderBy: [{ sortOrder: "asc" }],
        select: {
          id: true,
          sortOrder: true,
          description: true,
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
    throw new Error(`[seed activation] quote not found: ${quoteId}`);
  }
  if (quote.status !== QuoteStatus.APPROVED) {
    throw new Error(`[seed activation] quote ${quoteId} must be APPROVED`);
  }

  const approvalCheckpoint = await prisma.quoteCheckpoint.findFirst({
    where: { organizationId, quoteId, kind: QuoteCheckpointKind.APPROVAL },
    orderBy: { sequence: "desc" },
    select: { id: true },
  });
  if (!approvalCheckpoint) {
    throw new Error(`[seed activation] missing APPROVAL checkpoint on ${quoteId}`);
  }

  const readiness = evaluateQuoteJobActivationReadiness({
    status: quote.status,
    lines: quote.lineItems.map((l) => ({
      id: l.id,
      description: l.description,
      tasks: l.draftExecutionTasks.map((t) => ({
        id: t.id,
        title: t.title,
        stageId: t.stageId,
        providesSignals: t.providesSignals,
        requiresSignals: t.requiresSignals,
        hardSignal: t.hardSignal,
      })),
    })),
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
    throw new Error(
      `[seed activation] quote ${quoteId} not ready: ${readiness.blockReasons[0]?.message ?? "unknown"}`,
    );
  }

  const safeCustomerId =
    quote.customer && quote.customer.organizationId === organizationId ? quote.customerId : null;
  const safeLeadId = quote.lead && quote.lead.organizationId === organizationId ? quote.leadId : null;

  const usedStageIds = new Set<string>();
  for (const line of quote.lineItems) {
    for (const task of line.draftExecutionTasks) {
      if (task.stageId) usedStageIds.add(task.stageId);
    }
  }

  const stages = await prisma.stage.findMany({
    where: { id: { in: Array.from(usedStageIds) } },
    orderBy: { sortOrder: "asc" },
  });

  const stageIdToJobStageId: Record<string, string> = {};
  let jobStageSortOrder = 0;

  await prisma.job.create({
    data: {
      id: jobId,
      organizationId,
      quoteId: quote.id,
      customerId: safeCustomerId,
      leadId: safeLeadId,
      title: quote.title,
      status: JobStatus.ACTIVE,
    },
  });

  for (const stage of stages) {
    const jobStage = await prisma.jobStage.create({
      data: {
        jobId,
        stageId: stage.id,
        title: stage.name,
        sortOrder: jobStageSortOrder++,
      },
    });
    stageIdToJobStageId[stage.id] = jobStage.id;
  }

  const jobTaskSortOrderByExecutionTaskId = buildJobTaskSortOrderMap(quote.lineItems);

  const allTasks = quote.lineItems.flatMap((l) =>
    l.draftExecutionTasks.map((t) => ({ ...t, lineId: l.id })),
  );

  let taskCount = 0;
  for (const task of allTasks) {
    const jobStageId = task.stageId ? stageIdToJobStageId[task.stageId] : null;
    if (!jobStageId) {
      throw new Error(`[seed activation] task "${task.title}" missing stage`);
    }

    const jobTaskSortOrder = jobTaskSortOrderByExecutionTaskId.get(task.id);
    if (jobTaskSortOrder === undefined) {
      throw new Error(
        `[seed activation] task "${task.title}" could not be assigned a stable sort order`,
      );
    }

    await prisma.jobTask.create({
      data: {
        jobId,
        jobStageId,
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
    taskCount += 1;
  }

  const allProvided = new Set(allTasks.flatMap((t) => t.providesSignals));
  const allRequired = new Set(allTasks.flatMap((t) => t.requiresSignals));

  for (const req of allRequired) {
    if (!allProvided.has(req)) {
      const isHard = allTasks.some((t) => t.hardSignal && t.requiresSignals.includes(req));
      if (!isHard) {
        await prisma.jobSignal.upsert({
          where: { jobId_name: { jobId, name: req } },
          update: { publishedAt: new Date() },
          create: { jobId, name: req },
        });
      }
    }
  }

  await prisma.jobActivity.create({
    data: {
      organizationId,
      jobId,
      type: JobActivityType.JOB_ACTIVATED,
      title: "Job activated from approved quote",
      details: `[dev seed] Copied ${taskCount} tasks from quote execution planning.`,
      entityType: "Quote",
      entityId: quote.id,
      actorUserId: actorUserId ?? null,
      metadataJson: {
        quoteId: quote.id,
        activatedTaskCount: taskCount,
        approvalCheckpointId: approvalCheckpoint.id,
        seeded: true,
      },
    },
  });

  if (safeLeadId) {
    await prisma.lead.update({
      where: { id: safeLeadId },
      data: { status: LeadStatus.CONVERTED, convertedAt: new Date() },
    });
  }

  return { jobId, taskCount };
}
