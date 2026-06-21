"use server";

import { Prisma, TaskTemplateCategory } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { AIService, type AIQuoteExecutionPlanProposal } from "@/lib/ai/ai-service";
import { getAiActionErrorMessage } from "@/lib/ai/ai-provider-errors";
import { getMutableRequestContextOrThrow } from "@/lib/auth-context";
import {
  buildAiMeteringContext,
  runMeteredAiFeature,
} from "@/lib/billing/run-metered-ai-feature";
import { db, type ExtendedTransactionClient } from "@/lib/db";
import {
  QUOTE_PLAN_INPUT_SCHEMA_VERSION,
  buildQuotePlanPlanningInput,
  loadQuotePlanContext,
} from "@/lib/quote-plan/quote-plan-context";
import { computeQuotePlanningInputHash } from "@/lib/quote-plan/planning-input-hash";
import { type QuotePlanProposal, QuotePlanProposalSchema } from "@/lib/quote-plan/quote-plan-proposal-schema";
import { validateQuotePlanProposalForApply } from "@/lib/quote-plan/quote-plan-validation";
import { buildUncoordinatedDraftProposal } from "@/lib/quote-plan/uncoordinated-draft";
import {
  createQuoteExecutionTaskInTx,
  patchQuoteExecutionPlanTaskSignalsInTx,
} from "@/lib/quote-plan-mutations";
import { parseTaskTemplateCategory } from "@/lib/task-template-category";
import { TASK_TEMPLATE_FIELD_LIMITS } from "@/app/(workspace)/settings/scope-library/task-template-field-limits";
import { ensureQuoteExecutionPlanInTx } from "@/lib/quote-line-item-template-apply-tx";
import { QUOTE_STATUSES_EXECUTION_EDITABLE } from "@/lib/quote-status-workflow";
import { assertExecutionPlanPermission } from "@/lib/execution-plan-permissions";
import { evaluateQuoteJobActivationReadiness } from "@/lib/quote-job-activation-readiness";
import { normalizeSignalKey } from "@/lib/signal-key";
import {
  buildProviderTaskTitle,
  signalLooksSchedulingOrAccessRelated,
} from "@/lib/signal-display-copy";

type QuotePlanGenerateResult =
  | {
      ok: true;
      proposal: QuotePlanProposal;
      generatedAgainstInputHash: string;
      planningInputSchemaVersion: number;
      usedFallback: boolean;
      fallbackReason?: string;
    }
  | { ok: false; error: string };

type QuotePlanApplyResult =
  | { ok: true; appliedOperationIds: string[]; resultingPlanVersion: number }
  | { ok: false; error: string };

type QuotePlanSeedResult =
  | { ok: true; proposal: QuotePlanProposal; appliedOperationIds: string[]; resultingPlanVersion: number }
  | { ok: false; error: string };

type QuotePlanPreviewResult =
  | { ok: true; proposal: QuotePlanProposal; generatedAgainstInputHash: string }
  | { ok: false; error: string };

type QuotePlanManualTaskResult = { ok: true } | { ok: false; error: string };

type AcceptQuotePlanResult =
  | { ok: true; acceptedPlanVersion: number; planningInputHash: string }
  | { ok: false; error: string };
type ToggleQuoteExecutionTaskProtectionResult =
  | { ok: true; protected: boolean }
  | { ok: false; error: string };

type QuotePlanGapActionResult = { ok: true } | { ok: false; error: string };

const QUOTE_PLAN_LOCKED_ERROR = "Quote execution plan is not editable.";

function addSignalByEquivalence(existing: string[], signal: string): string[] {
  const trimmed = signal.trim();
  if (!trimmed) return existing;
  const normalized = normalizeSignalKey(trimmed);
  if (existing.some((entry) => normalizeSignalKey(entry) === normalized)) {
    return existing;
  }
  return [...existing, trimmed];
}

function removeSignalByEquivalence(existing: string[], signal: string): string[] {
  const normalized = normalizeSignalKey(signal);
  return existing.filter((entry) => normalizeSignalKey(entry) !== normalized);
}

async function loadEditableQuotePlanTask(
  tx: ExtendedTransactionClient,
  taskId: string,
  quoteId: string,
  organizationId: string,
) {
  const task = await tx.quoteExecutionTask.findFirst({
    where: {
      id: taskId,
      quoteExecutionPlan: {
        quoteId,
        organizationId,
        quote: {
          status: { in: [...QUOTE_STATUSES_EXECUTION_EDITABLE] },
          job: { is: null },
        },
      },
    },
    select: {
      id: true,
      title: true,
      stageId: true,
      category: true,
      instructions: true,
      providesSignals: true,
      requiresSignals: true,
      hardSignal: true,
      scopes: { select: { quoteLineItemId: true } },
    },
  });
  return task;
}

function revalidateQuotePlanSurfaces(quoteId: string) {
  revalidatePath(`/quotes/${quoteId}`);
  revalidatePath(`/quotes/${quoteId}/execution-review`);
}

type EditableQuoteWithDraftTasks = {
  id: string;
  title: string;
  executionPlan: { id: string; planVersion: number } | null;
  lineItems: Array<{
    id: string;
    description: string;
    executionRelevant: boolean;
    draftExecutionTasks: Array<{
      id: string;
      title: string;
      category: TaskTemplateCategory;
      stageId: string | null;
      instructions: string | null;
      providesSignals: string[];
      requiresSignals: string[];
      hardSignal: boolean;
      requirementsJson: unknown;
      partsRequiredJson: unknown;
      sourceTaskTemplateId: string | null;
    }>;
  }>;
};

async function loadEditableQuoteWithDraftTasks(
  tx: ExtendedTransactionClient | typeof db,
  quoteId: string,
  organizationId: string,
): Promise<EditableQuoteWithDraftTasks | null> {
  return tx.quote.findFirst({
    where: {
      id: quoteId,
      organizationId,
      status: { in: [...QUOTE_STATUSES_EXECUTION_EDITABLE] },
      job: { is: null },
    },
    select: {
      id: true,
      title: true,
      executionPlan: {
        select: { id: true, planVersion: true },
      },
      lineItems: {
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: {
          id: true,
          description: true,
          executionRelevant: true,
          draftExecutionTasks: {
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
            select: {
              id: true,
              title: true,
              category: true,
              stageId: true,
              instructions: true,
              providesSignals: true,
              requiresSignals: true,
              hardSignal: true,
              requirementsJson: true,
              partsRequiredJson: true,
              sourceTaskTemplateId: true,
            },
          },
        },
      },
    },
  });
}

function toQuotePlanProposalFromAi(params: {
  quoteId: string;
  generatedAgainstInputHash: string;
  basePlanVersion: number;
  aiProposal: AIQuoteExecutionPlanProposal;
}): QuotePlanProposal {
  const normalizedTasks = sanitizeAiPlanTasks(params.aiProposal.tasks);
  return QuotePlanProposalSchema.parse({
    quoteId: params.quoteId,
    schemaVersion: 1,
    plannerVersion: "whole-quote-ai-v1",
    generatedAgainstInputHash: params.generatedAgainstInputHash,
    basePlanVersion: params.basePlanVersion,
    summary: params.aiProposal.summary,
    assumptions: params.aiProposal.assumptions,
    warnings: params.aiProposal.warnings,
    operations: normalizedTasks.map((task, index) => ({
      opId: `ai-add-${index + 1}`,
      type: "ADD_TASK",
      reason: "Whole-quote AI proposal",
      task: {
        title: task.title,
        category: task.category,
        stageId: task.stageId,
        instructions: task.instructions ?? null,
        requiresSignals: task.requiresSignals,
        providesSignals: task.providesSignals,
        hardSignal: task.hardSignal,
        sourceTaskTemplateId: task.sourceTaskTemplateId ?? null,
        sourceType: task.sourceTaskTemplateId ? "TASK_TEMPLATE" : "CUSTOM",
        origin: "AI_PLAN",
        lineItemIds: task.lineItemIds,
      },
    })),
  });
}

function normalizeSignalList(signals: string[]): string[] {
  const byNormalized = new Map<string, string>();
  for (const signal of signals) {
    const trimmed = signal.trim();
    if (!trimmed) continue;
    const normalized = normalizeSignalKey(trimmed);
    if (!normalized) continue;
    if (!byNormalized.has(normalized)) {
      byNormalized.set(normalized, trimmed);
    }
  }
  return [...byNormalized.values()];
}

function sanitizeAiPlanTasks(tasks: AIQuoteExecutionPlanProposal["tasks"]) {
  const normalizedTasks = tasks.map((task) => ({
    ...task,
    providesSignals: normalizeSignalList(task.providesSignals),
    requiresSignals: normalizeSignalList(task.requiresSignals),
  }));
  const provided = new Set(
    normalizedTasks.flatMap((task) => task.providesSignals.map((signal) => normalizeSignalKey(signal))),
  );
  return normalizedTasks.map((task) => {
    const missingRequirements = task.requiresSignals.filter(
      (signal) => !provided.has(normalizeSignalKey(signal)),
    );
    if (missingRequirements.length === 0) {
      return task;
    }
    if (task.hardSignal) {
      return {
        ...task,
        hardSignal: false,
      };
    }
    return {
      ...task,
      requiresSignals: task.requiresSignals.filter(
        (signal) => provided.has(normalizeSignalKey(signal)),
      ),
    };
  });
}

async function applyQuotePlanProposalInTx(
  tx: ExtendedTransactionClient,
  params: {
    quoteId: string;
    organizationId: string;
    userId: string;
    proposal: QuotePlanProposal;
    modelProviderMeta?: unknown;
    applyMode?: "append" | "replace_unprotected";
  },
): Promise<QuotePlanApplyResult> {
  const quote = await tx.quote.findFirst({
    where: {
      id: params.quoteId,
      organizationId: params.organizationId,
      status: { in: [...QUOTE_STATUSES_EXECUTION_EDITABLE] },
      job: { is: null },
    },
    select: {
      id: true,
      lineItems: {
        select: { id: true, executionRelevant: true },
      },
      executionPlan: {
        select: {
          id: true,
          status: true,
          planVersion: true,
          planningInputHash: true,
          tasks: {
            select: {
              id: true,
              protectedAt: true,
              humanEditedAt: true,
              requiresSignals: true,
              providesSignals: true,
              hardSignal: true,
              scopes: { select: { quoteLineItemId: true } },
            },
          },
        },
      },
    },
  });
  if (!quote) {
    return { ok: false, error: "Quote is not editable for execution planning." };
  }
  const ensuredPlanId = quote.executionPlan
    ? quote.executionPlan.id
    : (
        await ensureQuoteExecutionPlanInTx(tx, {
          quoteId: params.quoteId,
          organizationId: params.organizationId,
        })
      ).id;
  const plan = await tx.quoteExecutionPlan.findUnique({
    where: { id: ensuredPlanId },
    select: {
      id: true,
      status: true,
      planVersion: true,
      planningInputHash: true,
      tasks: {
        select: {
          id: true,
          protectedAt: true,
          humanEditedAt: true,
          requiresSignals: true,
          providesSignals: true,
          hardSignal: true,
          scopes: { select: { quoteLineItemId: true } },
        },
      },
    },
  });
  if (!plan) {
    return { ok: false, error: "Execution plan was not available for apply." };
  }
  const context = await loadQuotePlanContext(params.quoteId, params.organizationId, tx);
  if (!context) {
    return { ok: false, error: "Unable to build planning context for this quote." };
  }
  const currentPlanningInputHash = computeQuotePlanningInputHash(
    buildQuotePlanPlanningInput(context),
    QUOTE_PLAN_INPUT_SCHEMA_VERSION,
  );
  const validation = validateQuotePlanProposalForApply(params.proposal, {
    quoteId: params.quoteId,
    allowedLineItemIds: new Set(quote.lineItems.map((line) => line.id)),
    executionRelevantLineItemIds: new Set(
      quote.lineItems.filter((line) => line.executionRelevant).map((line) => line.id),
    ),
    plan: {
      status: plan.status,
      planVersion: plan.planVersion,
      planningInputHash: plan.planningInputHash,
    },
    currentPlanningInputHash,
    existingTasks: plan.tasks.map((task) => ({
      id: task.id,
      protectedAt: task.protectedAt,
      humanEditedAt: task.humanEditedAt,
      lineItemIds: task.scopes.map((scope) => scope.quoteLineItemId),
      requiresSignals: task.requiresSignals,
      providesSignals: task.providesSignals,
      hardSignal: task.hardSignal,
    })),
  });
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }
  const hasNonAddOperations = validation.proposal.operations.some(
    (operation) => operation.type !== "ADD_TASK",
  );
  const shouldReplaceExisting =
    (params.applyMode ?? "replace_unprotected") === "replace_unprotected" && !hasNonAddOperations;
  if (shouldReplaceExisting && plan.tasks.length > 0) {
    const hasProtectedOrHumanEditedTasks = plan.tasks.some(
      (task) => task.protectedAt || task.humanEditedAt,
    );
    if (hasProtectedOrHumanEditedTasks) {
      return {
        ok: false,
        error:
          "This plan contains protected or human-edited tasks. Review and reconcile task operations explicitly before replacing the plan.",
      };
    }
    await tx.quoteExecutionTask.deleteMany({
      where: {
        quoteExecutionPlanId: plan.id,
      },
    });
    plan.tasks = [];
  }
  let usedDirectTaskMutation = false;
  for (const operation of validation.proposal.operations) {
    if (operation.type === "ADD_TASK") {
      const created = await createQuoteExecutionTaskInTx(tx, {
        quoteId: params.quoteId,
        organizationId: params.organizationId,
        input: {
          title: operation.task.title,
          category: operation.task.category,
          stageId: operation.task.stageId ?? null,
          instructions: operation.task.instructions ?? null,
          providesSignals: operation.task.providesSignals,
          requiresSignals: operation.task.requiresSignals,
          hardSignal: operation.task.hardSignal,
          requirementsJson: (operation.task.requirementsJson ?? {}) as Prisma.InputJsonValue,
          partsRequiredJson: (operation.task.partsRequiredJson ?? {}) as Prisma.InputJsonValue,
          sourceType: operation.task.sourceType,
          sourceTaskTemplateId: operation.task.sourceTaskTemplateId ?? null,
          sourceLineItemTemplateTaskId: operation.task.sourceLineItemTemplateTaskId ?? null,
          sourceQuoteLineExecutionTaskId: null,
          origin: operation.task.origin ?? "AI_PLAN",
          planningTags: operation.task.planningTags,
          relatedLineItemIds: operation.task.lineItemIds,
          protectedAt: operation.task.protected ? new Date() : null,
        },
      });
      if (!created.ok) {
        return { ok: false, error: `Failed to apply operation ${operation.opId}: ${created.error}` };
      }
      continue;
    }
    if (operation.type === "UPDATE_TASK") {
      const target = await tx.quoteExecutionTask.findFirst({
        where: {
          id: operation.taskId,
          quoteExecutionPlanId: plan.id,
        },
        select: { id: true },
      });
      if (!target) {
        return { ok: false, error: `Failed to apply operation ${operation.opId}: task not found.` };
      }
      const updateData: Prisma.QuoteExecutionTaskUncheckedUpdateInput = {};
      if (operation.task.title !== undefined) updateData.title = operation.task.title;
      if (operation.task.category !== undefined) updateData.category = operation.task.category;
      if (operation.task.stageId !== undefined) updateData.stageId = operation.task.stageId;
      if (operation.task.instructions !== undefined) updateData.instructions = operation.task.instructions;
      if (operation.task.requiresSignals !== undefined) {
        updateData.requiresSignals = operation.task.requiresSignals;
      }
      if (operation.task.providesSignals !== undefined) {
        updateData.providesSignals = operation.task.providesSignals;
      }
      if (operation.task.hardSignal !== undefined) updateData.hardSignal = operation.task.hardSignal;
      if (operation.task.requirementsJson !== undefined) {
        updateData.requirementsJson = operation.task.requirementsJson as Prisma.InputJsonValue;
      }
      if (operation.task.partsRequiredJson !== undefined) {
        updateData.partsRequiredJson = operation.task.partsRequiredJson as Prisma.InputJsonValue;
      }
      if (operation.task.assigneeRole !== undefined) updateData.assigneeRole = operation.task.assigneeRole;
      if (operation.task.sourceTaskTemplateId !== undefined) {
        updateData.sourceTaskTemplateId = operation.task.sourceTaskTemplateId;
      }
      if (operation.task.sourceLineItemTemplateTaskId !== undefined) {
        updateData.sourceLineItemTemplateTaskId = operation.task.sourceLineItemTemplateTaskId;
      }
      if (operation.task.sourceType !== undefined) updateData.sourceType = operation.task.sourceType;
      if (operation.task.origin !== undefined) updateData.origin = operation.task.origin;
      if (operation.task.planningTags !== undefined) updateData.planningTags = operation.task.planningTags;
      if (operation.task.protected !== undefined) {
        updateData.protectedAt = operation.task.protected ? new Date() : null;
      }
      if (Object.keys(updateData).length > 0) {
        await tx.quoteExecutionTask.update({
          where: { id: target.id },
          data: updateData,
        });
        usedDirectTaskMutation = true;
      }
      if (operation.task.lineItemIds) {
        const lineItemIds = [...new Set(operation.task.lineItemIds)];
        await tx.quoteExecutionTaskScope.deleteMany({
          where: {
            quoteExecutionTaskId: target.id,
            quoteLineItemId: { notIn: lineItemIds },
          },
        });
        for (const lineItemId of lineItemIds) {
          await tx.quoteExecutionTaskScope.upsert({
            where: {
              quoteExecutionTaskId_quoteLineItemId: {
                quoteExecutionTaskId: target.id,
                quoteLineItemId: lineItemId,
              },
            },
            create: {
              organizationId: params.organizationId,
              quoteExecutionTaskId: target.id,
              quoteLineItemId: lineItemId,
            },
            update: {},
          });
        }
        usedDirectTaskMutation = true;
      }
      continue;
    }
    if (operation.type === "RELINK_TASK_SCOPE") {
      const target = await tx.quoteExecutionTask.findFirst({
        where: {
          id: operation.taskId,
          quoteExecutionPlanId: plan.id,
        },
        select: { id: true },
      });
      if (!target) {
        return { ok: false, error: `Failed to apply operation ${operation.opId}: task not found.` };
      }
      const lineItemIds = [...new Set(operation.lineItemIds)];
      await tx.quoteExecutionTaskScope.deleteMany({
        where: {
          quoteExecutionTaskId: target.id,
          quoteLineItemId: { notIn: lineItemIds },
        },
      });
      for (const lineItemId of lineItemIds) {
        await tx.quoteExecutionTaskScope.upsert({
          where: {
            quoteExecutionTaskId_quoteLineItemId: {
              quoteExecutionTaskId: target.id,
              quoteLineItemId: lineItemId,
            },
          },
          create: {
            organizationId: params.organizationId,
            quoteExecutionTaskId: target.id,
            quoteLineItemId: lineItemId,
          },
          update: {},
        });
      }
      usedDirectTaskMutation = true;
      continue;
    }
    if (operation.type === "CANCEL_TASK") {
      const removed = await tx.quoteExecutionTask.deleteMany({
        where: {
          id: operation.taskId,
          quoteExecutionPlanId: plan.id,
        },
      });
      if (removed.count === 0) {
        return {
          ok: false,
          error: `Failed to apply operation ${operation.opId}: task no longer exists.`,
        };
      }
      usedDirectTaskMutation = true;
      continue;
    }
  }
  if (usedDirectTaskMutation) {
    await tx.quoteExecutionPlan.update({
      where: { id: plan.id },
      data: {
        planVersion: { increment: 1 },
        status: plan.status === "ACCEPTED" ? "READY_FOR_REVIEW" : plan.status,
      },
    });
  }
  const refreshedPlan = await tx.quoteExecutionPlan.findUnique({
    where: { id: plan.id },
    select: { planVersion: true },
  });
  await tx.executionPlanRevision.create({
    data: {
      organizationId: params.organizationId,
      quoteId: params.quoteId,
      kind: "INITIAL_PLAN",
      status: "APPLIED",
      basePlanVersion: validation.proposal.basePlanVersion,
      resultingPlanVersion: refreshedPlan?.planVersion ?? validation.proposal.basePlanVersion,
      proposalJson: validation.proposal as unknown as Prisma.InputJsonValue,
      proposalSchemaVersion: validation.proposal.schemaVersion,
      plannerVersion: validation.proposal.plannerVersion,
      planningInputHash: currentPlanningInputHash,
      modelProviderMeta: (params.modelProviderMeta ?? null) as Prisma.InputJsonValue,
      approvedByUserId: params.userId,
      appliedAt: new Date(),
      reasoningSummary: validation.proposal.summary || null,
    },
  });
  return {
    ok: true,
    appliedOperationIds: validation.proposal.operations.map((operation) => operation.opId),
    resultingPlanVersion: refreshedPlan?.planVersion ?? validation.proposal.basePlanVersion,
  };
}

export async function generateQuoteExecutionPlanProposalAction(
  quoteId: string,
  options?: { userInstructions?: string | null },
): Promise<QuotePlanGenerateResult> {
  const qid = quoteId.trim();
  if (!qid) return { ok: false, error: "Missing quote id." };
  const ctx = await getMutableRequestContextOrThrow();
  const [quote, planContext, stages] = await Promise.all([
    loadEditableQuoteWithDraftTasks(db, qid, ctx.organizationId),
    loadQuotePlanContext(qid, ctx.organizationId),
    db.stage.findMany({
      where: { organizationId: ctx.organizationId, archivedAt: null },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  if (!quote || !planContext) {
    return { ok: false, error: "Quote is not editable for execution planning." };
  }
  const generatedAgainstInputHash = computeQuotePlanningInputHash(
    buildQuotePlanPlanningInput(planContext),
    QUOTE_PLAN_INPUT_SCHEMA_VERSION,
  );
  const basePlanVersion = quote.executionPlan?.planVersion ?? 1;
  try {
    const metered = await runMeteredAiFeature({
      ctx: buildAiMeteringContext({
        organizationId: ctx.organizationId,
        feature: "execution_plan_quote",
        requestKind: "generate",
      }),
      run: async () => {
        const generated = await AIService.generateQuoteExecutionPlan({
          quoteId: qid,
          quoteTitle: quote.title,
          organizationId: ctx.organizationId,
          organizationName: ctx.organizationName,
          lines: planContext.critical.lines.map((line) => ({
            id: line.id,
            description: line.description,
            executionRelevant: line.executionRelevant,
            clarifications: line.clarifications,
          })),
          existingStages: stages,
          userInstructions: options?.userInstructions ?? undefined,
        });
        if (!generated.metering) {
          throw new Error("AI metering metadata missing from quote execution plan.");
        }
        return {
          result: generated,
          metering: generated.metering,
          responseChars: JSON.stringify(generated.proposal).length,
        };
      },
    });
    if (!metered.ok) {
      return { ok: false, error: metered.error };
    }
    const generated = metered.data;
    return {
      ok: true,
      proposal: toQuotePlanProposalFromAi({
        quoteId: qid,
        generatedAgainstInputHash,
        basePlanVersion,
        aiProposal: generated.proposal,
      }),
      generatedAgainstInputHash,
      planningInputSchemaVersion: QUOTE_PLAN_INPUT_SCHEMA_VERSION,
      usedFallback: false,
    };
  } catch (error) {
    // Fallback path: preserve existing per-line draft tasks verbatim as uncoordinated draft.
    const fallbackProposal = buildUncoordinatedDraftProposal({
      quoteId: qid,
      generatedAgainstInputHash,
      basePlanVersion,
      lines: quote.lineItems.map((line) => ({
        id: line.id,
        description: line.description,
        tasks: line.draftExecutionTasks,
      })),
    });
    return {
      ok: true,
      proposal: fallbackProposal,
      generatedAgainstInputHash,
      planningInputSchemaVersion: QUOTE_PLAN_INPUT_SCHEMA_VERSION,
      usedFallback: true,
      fallbackReason: getAiActionErrorMessage(error),
    };
  }
}

export async function applyQuoteExecutionPlanProposalAction(
  quoteId: string,
  proposal: QuotePlanProposal,
  options?: { modelProviderMeta?: unknown; applyMode?: "append" | "replace_unprotected" },
): Promise<QuotePlanApplyResult> {
  const qid = quoteId.trim();
  if (!qid) return { ok: false, error: "Missing quote id." };
  const ctx = await getMutableRequestContextOrThrow();
  const parsed = QuotePlanProposalSchema.safeParse(proposal);
  if (!parsed.success) {
    return { ok: false, error: "Proposal shape is invalid." };
  }
  const result = await db.$transaction((tx) =>
    applyQuotePlanProposalInTx(tx, {
      quoteId: qid,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      proposal: parsed.data,
      modelProviderMeta: options?.modelProviderMeta,
      applyMode: options?.applyMode,
    }),
  );
  if (result.ok) {
    revalidatePath(`/quotes/${qid}`);
    revalidatePath(`/quotes/${qid}/execution-review`);
  }
  return result;
}

async function buildUncoordinatedDraftProposalForQuote(
  quoteId: string,
  organizationId: string,
): Promise<QuotePlanPreviewResult> {
  const [quote, planContext] = await Promise.all([
    loadEditableQuoteWithDraftTasks(db, quoteId, organizationId),
    loadQuotePlanContext(quoteId, organizationId),
  ]);
  if (!quote || !planContext) {
    return { ok: false, error: "Quote is not editable for execution planning." };
  }
  const generatedAgainstInputHash = computeQuotePlanningInputHash(
    buildQuotePlanPlanningInput(planContext),
    QUOTE_PLAN_INPUT_SCHEMA_VERSION,
  );
  const proposal = buildUncoordinatedDraftProposal({
    quoteId,
    generatedAgainstInputHash,
    basePlanVersion: quote.executionPlan?.planVersion ?? 1,
    lines: quote.lineItems.map((line) => ({
      id: line.id,
      description: line.description,
      tasks: line.draftExecutionTasks,
    })),
  });
  if (proposal.operations.length === 0) {
    return {
      ok: false,
      error:
        "No per-line draft tasks found. Add tasks on the quote page first, or add tasks manually below.",
    };
  }
  return { ok: true, proposal, generatedAgainstInputHash };
}

export async function previewUncoordinatedDraftProposalAction(
  quoteId: string,
): Promise<QuotePlanPreviewResult> {
  const qid = quoteId.trim();
  if (!qid) return { ok: false, error: "Missing quote id." };
  const ctx = await getMutableRequestContextOrThrow();
  return buildUncoordinatedDraftProposalForQuote(qid, ctx.organizationId);
}

export async function seedUncoordinatedDraftAction(quoteId: string): Promise<QuotePlanSeedResult> {
  const qid = quoteId.trim();
  if (!qid) return { ok: false, error: "Missing quote id." };
  const ctx = await getMutableRequestContextOrThrow();
  const built = await buildUncoordinatedDraftProposalForQuote(qid, ctx.organizationId);
  if (!built.ok) return built;
  const applied = await applyQuoteExecutionPlanProposalAction(qid, built.proposal, {
    modelProviderMeta: {
      isFallback: true,
      reason: "Manual uncoordinated draft seed request",
      source: "seedUncoordinatedDraftAction",
    },
  });
  if (!applied.ok) return applied;
  return {
    ok: true,
    proposal: built.proposal,
    appliedOperationIds: applied.appliedOperationIds,
    resultingPlanVersion: applied.resultingPlanVersion,
  };
}

export async function addQuotePlanTaskManualAction(params: {
  quoteId: string;
  title: string;
  category: string;
  stageId: string | null;
  lineItemIds: string[];
  instructions?: string | null;
}): Promise<QuotePlanManualTaskResult> {
  const qid = params.quoteId.trim();
  const title = params.title.trim();
  if (!qid) return { ok: false, error: "Missing quote id." };
  if (!title) return { ok: false, error: "Task title is required." };
  if (title.length > TASK_TEMPLATE_FIELD_LIMITS.title) {
    return { ok: false, error: `Title is too long (max ${TASK_TEMPLATE_FIELD_LIMITS.title} characters).` };
  }
  const category = parseTaskTemplateCategory(params.category);
  if (!category) return { ok: false, error: "Select a valid task category." };
  const instructions = params.instructions?.trim() || null;
  if (instructions && instructions.length > TASK_TEMPLATE_FIELD_LIMITS.instructions) {
    return {
      ok: false,
      error: `Instructions are too long (max ${TASK_TEMPLATE_FIELD_LIMITS.instructions} characters).`,
    };
  }
  const lineItemIds = [...new Set(params.lineItemIds.map((id) => id.trim()).filter(Boolean))];
  if (lineItemIds.length === 0) {
    return { ok: false, error: "Select at least one scope line for this task." };
  }

  const ctx = await getMutableRequestContextOrThrow();
  const result = await db.$transaction(async (tx) => {
    const created = await createQuoteExecutionTaskInTx(tx, {
      quoteId: qid,
      organizationId: ctx.organizationId,
      input: {
        title,
        category,
        stageId: params.stageId?.trim() || null,
        instructions,
        providesSignals: [],
        requiresSignals: [],
        hardSignal: false,
        requirementsJson: {} as Prisma.InputJsonValue,
        partsRequiredJson: {} as Prisma.InputJsonValue,
        sourceType: "CUSTOM",
        sourceTaskTemplateId: null,
        sourceLineItemTemplateTaskId: null,
        sourceQuoteLineExecutionTaskId: null,
        origin: "MANUAL",
        relatedLineItemIds: lineItemIds,
        humanEditedAt: new Date(),
      },
    });
    if (!created.ok) {
      if (created.error === "QUOTE_NOT_EDITABLE") {
        return { ok: false as const, error: "Quote is not editable for execution planning." };
      }
      if (created.error === "TASK_SCOPE_REQUIRED" || created.error === "INVALID_TASK_SCOPE") {
        return { ok: false as const, error: "Invalid scope lines for this task." };
      }
      return { ok: false as const, error: "Could not add task to the execution plan." };
    }
    return { ok: true as const };
  });

  if (result.ok) {
    revalidateQuotePlanSurfaces(qid);
  }
  return result;
}

export async function acceptQuoteExecutionPlanAction(
  quoteId: string,
  options?: { expectedPlanVersion?: number | null },
): Promise<AcceptQuotePlanResult> {
  const qid = quoteId.trim();
  if (!qid) return { ok: false, error: "Missing quote id." };
  const ctx = await getMutableRequestContextOrThrow();
  const permission = assertExecutionPlanPermission(ctx.role, "accept_plan");
  if (!permission.ok) return { ok: false, error: permission.error };
  const result = await db.$transaction(async (tx) => {
    const inTxPermission = assertExecutionPlanPermission(ctx.role, "accept_plan");
    if (!inTxPermission.ok) {
      return { ok: false as const, error: inTxPermission.error };
    }
    const quote = await tx.quote.findFirst({
      where: {
        id: qid,
        organizationId: ctx.organizationId,
        status: { in: [...QUOTE_STATUSES_EXECUTION_EDITABLE] },
        job: { is: null },
      },
      select: {
        id: true,
        status: true,
        totalCents: true,
        paymentSchedule: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            title: true,
            anchorType: true,
            amountCents: true,
            percentage: true,
          },
        },
        lineItems: {
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          select: {
            id: true,
            description: true,
            executionRelevant: true,
          },
        },
      },
    });
    if (!quote) {
      return { ok: false as const, error: "Quote is not editable for plan acceptance." };
    }
    const plan = await ensureQuoteExecutionPlanInTx(tx, {
      quoteId: qid,
      organizationId: ctx.organizationId,
    });
    if (options?.expectedPlanVersion != null && options.expectedPlanVersion !== plan.planVersion) {
      return {
        ok: false as const,
        error: "Plan version changed. Refresh and review the latest plan before accepting.",
      };
    }
    const context = await loadQuotePlanContext(qid, ctx.organizationId, tx);
    if (!context) {
      return { ok: false as const, error: "Could not compute planning inputs for acceptance." };
    }
    const planningInputHash = computeQuotePlanningInputHash(
      buildQuotePlanPlanningInput(context),
      QUOTE_PLAN_INPUT_SCHEMA_VERSION,
    );
    const approvalCheckpoint = await tx.quoteCheckpoint.findFirst({
      where: {
        organizationId: ctx.organizationId,
        quoteId: qid,
        kind: "APPROVAL",
      },
      orderBy: { sequence: "desc" },
      select: { id: true },
    });
    const planTasks = await tx.quoteExecutionTask.findMany({
      where: { quoteExecutionPlanId: plan.id },
      select: {
        id: true,
        title: true,
        stageId: true,
        providesSignals: true,
        requiresSignals: true,
        hardSignal: true,
        scopes: { select: { quoteLineItemId: true } },
      },
    });
    const coveredLineIds = new Set<string>();
    for (const task of planTasks) {
      for (const scope of task.scopes) {
        coveredLineIds.add(scope.quoteLineItemId);
      }
    }
    const uncovered = await tx.quoteLineItem.findMany({
      where: {
        quoteId: qid,
        executionRelevant: true,
        id: { notIn: [...coveredLineIds] },
      },
      select: { description: true },
    });
    if (uncovered.length > 0) {
      return {
        ok: false as const,
        error:
          "Cannot accept plan: one or more execution-relevant lines have no task coverage.",
      };
    }
    const tasksByLineId = new Map<string, Array<{
      id: string;
      title: string;
      stageId: string | null;
      providesSignals: string[];
      requiresSignals: string[];
      hardSignal: boolean;
    }>>();
    for (const line of quote.lineItems) {
      tasksByLineId.set(line.id, []);
    }
    for (const task of planTasks) {
      for (const scope of task.scopes) {
        const scopedTasks = tasksByLineId.get(scope.quoteLineItemId);
        if (!scopedTasks) continue;
        scopedTasks.push({
          id: task.id,
          title: task.title,
          stageId: task.stageId,
          providesSignals: task.providesSignals,
          requiresSignals: task.requiresSignals,
          hardSignal: task.hardSignal,
        });
      }
    }
    const readiness = evaluateQuoteJobActivationReadiness({
      status: quote.status,
      hasApprovalCheckpoint: Boolean(approvalCheckpoint),
      executionPlan: {
        status: "ACCEPTED",
        planVersion: plan.planVersion,
        expectedPlanVersion: options?.expectedPlanVersion ?? null,
        acceptedPlanningInputHash: planningInputHash,
        currentPlanningInputHash: planningInputHash,
      },
      lines: quote.lineItems.map((line) => ({
        id: line.id,
        description: line.description,
        executionRelevant: line.executionRelevant,
        tasks: tasksByLineId.get(line.id) ?? [],
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
      const first = readiness.blockReasons[0];
      return {
        ok: false as const,
        error: `Cannot accept plan: ${first?.message ?? "Activation-readiness checks failed."}`,
      };
    }
    const accepted = await tx.quoteExecutionPlan.update({
      where: { id: plan.id },
      data: {
        status: "ACCEPTED",
        planningInputHash,
        planningInputSchemaVersion: QUOTE_PLAN_INPUT_SCHEMA_VERSION,
        acceptedAt: new Date(),
        acceptedByUserId: ctx.userId,
      },
      select: { planVersion: true },
    });
    return {
      ok: true as const,
      acceptedPlanVersion: accepted.planVersion,
      planningInputHash,
    };
  });
  if (result.ok) {
    revalidatePath(`/quotes/${qid}`);
    revalidatePath(`/quotes/${qid}/execution-review`);
  }
  return result;
}

export async function toggleQuoteExecutionTaskProtectionAction(
  quoteId: string,
  taskId: string,
  protectedMode: boolean,
): Promise<ToggleQuoteExecutionTaskProtectionResult> {
  const qid = quoteId.trim();
  const tid = taskId.trim();
  if (!qid || !tid) {
    return { ok: false, error: "Missing quote id or task id." };
  }
  const ctx = await getMutableRequestContextOrThrow();
  const permission = assertExecutionPlanPermission(ctx.role, "protect_unprotect_task");
  if (!permission.ok) return { ok: false, error: permission.error };

  const result = await db.$transaction(async (tx) => {
    const inTxPermission = assertExecutionPlanPermission(ctx.role, "protect_unprotect_task");
    if (!inTxPermission.ok) {
      return { ok: false as const, error: inTxPermission.error };
    }
    const task = await tx.quoteExecutionTask.findFirst({
      where: {
        id: tid,
        quoteExecutionPlan: {
          quoteId: qid,
          organizationId: ctx.organizationId,
          quote: {
            status: { in: [...QUOTE_STATUSES_EXECUTION_EDITABLE] },
            job: { is: null },
          },
        },
      },
      select: {
        id: true,
        quoteExecutionPlanId: true,
      },
    });
    if (!task) {
      return {
        ok: false as const,
        error: "Task not found on an editable pre-activation quote plan.",
      };
    }
    const plan = await tx.quoteExecutionPlan.findUnique({
      where: { id: task.quoteExecutionPlanId },
      select: { status: true },
    });
    if (!plan) {
      return { ok: false as const, error: "Quote execution plan was not found." };
    }

    await tx.quoteExecutionTask.update({
      where: { id: task.id },
      data: {
        protectedAt: protectedMode ? new Date() : null,
        humanEditedAt: new Date(),
      },
    });
    await tx.quoteExecutionPlan.update({
      where: { id: task.quoteExecutionPlanId },
      data: {
        planVersion: { increment: 1 },
        status: plan.status === "ACCEPTED" ? "READY_FOR_REVIEW" : plan.status,
      },
    });
    return { ok: true as const, protected: protectedMode };
  });

  if (result.ok) {
    revalidateQuotePlanSurfaces(qid);
  }
  return result;
}

export async function addQuotePlanDependencyProviderTaskAction(params: {
  quoteId: string;
  consumerTaskId: string;
  signal: string;
}): Promise<QuotePlanGapActionResult> {
  const qid = params.quoteId.trim();
  const consumerTaskId = params.consumerTaskId.trim();
  const signal = params.signal.trim();
  if (!qid || !consumerTaskId || !signal) {
    return { ok: false, error: "Missing quote, task, or signal." };
  }

  const ctx = await getMutableRequestContextOrThrow();

  const outcome = await db.$transaction(async (tx) => {
    const consumerTask = await loadEditableQuotePlanTask(
      tx,
      consumerTaskId,
      qid,
      ctx.organizationId,
    );
    if (!consumerTask) {
      return { ok: false as const, error: QUOTE_PLAN_LOCKED_ERROR };
    }

    const normalizedSignal = normalizeSignalKey(signal);
    const existingProviders = await tx.quoteExecutionTask.findMany({
      where: {
        quoteExecutionPlan: { quoteId: qid, organizationId: ctx.organizationId },
      },
      select: { providesSignals: true },
    });
    if (
      existingProviders.some((task) =>
        task.providesSignals.some((entry) => normalizeSignalKey(entry) === normalizedSignal),
      )
    ) {
      return { ok: true as const };
    }

    const fallbackStage = await tx.stage.findFirst({
      where: { organizationId: ctx.organizationId, archivedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true },
    });
    const stageId = consumerTask.stageId ?? fallbackStage?.id ?? null;
    if (!stageId) {
      return {
        ok: false as const,
        error:
          "No active stages are available. Add a stage in Scope Library before adding provider tasks.",
      };
    }

    const category = signalLooksSchedulingOrAccessRelated(signal)
      ? TaskTemplateCategory.SCHEDULING
      : TaskTemplateCategory.GENERAL;
    const title = buildProviderTaskTitle(signal, consumerTask.title);
    const scopeLineIds = consumerTask.scopes.map((scope) => scope.quoteLineItemId);

    const created = await createQuoteExecutionTaskInTx(tx, {
      quoteId: qid,
      organizationId: ctx.organizationId,
      input: {
        title,
        stageId,
        category,
        instructions: null,
        providesSignals: [signal],
        requiresSignals: [],
        hardSignal: false,
        requirementsJson: {} as Prisma.InputJsonValue,
        partsRequiredJson: {} as Prisma.InputJsonValue,
        sourceType: "CUSTOM",
        sourceTaskTemplateId: null,
        sourceLineItemTemplateTaskId: null,
        sourceQuoteLineExecutionTaskId: null,
        origin: "MANUAL",
        relatedLineItemIds: scopeLineIds.length > 0 ? scopeLineIds : [],
      },
    });
    if (!created.ok) {
      return { ok: false as const, error: "Could not add provider task to the execution plan." };
    }

    await tx.$executeRaw`
      UPDATE "Quote"
      SET "updatedAt" = NOW()
      WHERE "id" = ${qid} AND "organizationId" = ${ctx.organizationId}
    `;
    return { ok: true as const };
  });

  if (!outcome.ok) {
    return { ok: false, error: outcome.error ?? QUOTE_PLAN_LOCKED_ERROR };
  }
  revalidateQuotePlanSurfaces(qid);
  return { ok: true };
}

export async function connectQuotePlanDependencyGapToTaskAction(params: {
  quoteId: string;
  consumerTaskId: string;
  providerTaskId: string;
  signal: string;
}): Promise<QuotePlanGapActionResult> {
  const qid = params.quoteId.trim();
  const consumerTaskId = params.consumerTaskId.trim();
  const providerTaskId = params.providerTaskId.trim();
  const signal = params.signal.trim();
  if (!qid || !consumerTaskId || !providerTaskId || !signal) {
    return { ok: false, error: "Missing quote, task, or signal." };
  }
  if (consumerTaskId === providerTaskId) {
    return { ok: false, error: "Selected task cannot provide its own missing dependency." };
  }

  const ctx = await getMutableRequestContextOrThrow();

  const ok = await db.$transaction(async (tx) => {
    const [, providerTask] = await Promise.all([
      loadEditableQuotePlanTask(tx, consumerTaskId, qid, ctx.organizationId),
      loadEditableQuotePlanTask(tx, providerTaskId, qid, ctx.organizationId),
    ]);
    if (!providerTask) {
      return false;
    }

    const patched = await patchQuoteExecutionPlanTaskSignalsInTx(tx, {
      quoteId: qid,
      organizationId: ctx.organizationId,
      planTaskId: providerTask.id,
      providesSignals: addSignalByEquivalence(providerTask.providesSignals, signal),
    });
    if (!patched.ok) return false;

    await tx.$executeRaw`
      UPDATE "Quote"
      SET "updatedAt" = NOW()
      WHERE "id" = ${qid} AND "organizationId" = ${ctx.organizationId}
    `;
    return true;
  });

  if (!ok) {
    return { ok: false, error: QUOTE_PLAN_LOCKED_ERROR };
  }
  revalidateQuotePlanSurfaces(qid);
  return { ok: true };
}

export async function removeQuotePlanDependencyRequirementAction(params: {
  quoteId: string;
  consumerTaskId: string;
  signal: string;
}): Promise<QuotePlanGapActionResult> {
  const qid = params.quoteId.trim();
  const consumerTaskId = params.consumerTaskId.trim();
  const signal = params.signal.trim();
  if (!qid || !consumerTaskId || !signal) {
    return { ok: false, error: "Missing quote, task, or signal." };
  }

  const ctx = await getMutableRequestContextOrThrow();

  const ok = await db.$transaction(async (tx) => {
    const consumerTask = await loadEditableQuotePlanTask(
      tx,
      consumerTaskId,
      qid,
      ctx.organizationId,
    );
    if (!consumerTask) {
      return false;
    }

    const patched = await patchQuoteExecutionPlanTaskSignalsInTx(tx, {
      quoteId: qid,
      organizationId: ctx.organizationId,
      planTaskId: consumerTask.id,
      requiresSignals: removeSignalByEquivalence(consumerTask.requiresSignals, signal),
    });
    if (!patched.ok) return false;

    await tx.$executeRaw`
      UPDATE "Quote"
      SET "updatedAt" = NOW()
      WHERE "id" = ${qid} AND "organizationId" = ${ctx.organizationId}
    `;
    return true;
  });

  if (!ok) {
    return { ok: false, error: QUOTE_PLAN_LOCKED_ERROR };
  }
  revalidateQuotePlanSurfaces(qid);
  return { ok: true };
}

export async function relaxQuotePlanDependencyHardSignalAction(params: {
  quoteId: string;
  consumerTaskId: string;
}): Promise<QuotePlanGapActionResult> {
  const qid = params.quoteId.trim();
  const consumerTaskId = params.consumerTaskId.trim();
  if (!qid || !consumerTaskId) {
    return { ok: false, error: "Missing quote or task." };
  }

  const ctx = await getMutableRequestContextOrThrow();

  const outcome = await db.$transaction(async (tx) => {
    const consumerTask = await loadEditableQuotePlanTask(
      tx,
      consumerTaskId,
      qid,
      ctx.organizationId,
    );
    if (!consumerTask) {
      return { ok: false as const, error: QUOTE_PLAN_LOCKED_ERROR };
    }

    const patched = await patchQuoteExecutionPlanTaskSignalsInTx(tx, {
      quoteId: qid,
      organizationId: ctx.organizationId,
      planTaskId: consumerTask.id,
      hardSignal: false,
    });
    if (!patched.ok) {
      return { ok: false as const, error: "Could not relax activation blocking for this task." };
    }

    await tx.$executeRaw`
      UPDATE "Quote"
      SET "updatedAt" = NOW()
      WHERE "id" = ${qid} AND "organizationId" = ${ctx.organizationId}
    `;
    return { ok: true as const };
  });

  if (!outcome.ok) {
    return { ok: false, error: outcome.error ?? QUOTE_PLAN_LOCKED_ERROR };
  }
  revalidateQuotePlanSurfaces(qid);
  return { ok: true };
}

