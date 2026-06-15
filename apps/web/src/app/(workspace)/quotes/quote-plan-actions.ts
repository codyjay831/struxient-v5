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
import { createQuoteExecutionTaskInTx } from "@/lib/quote-plan-mutations";
import { ensureQuoteExecutionPlanInTx } from "@/lib/quote-line-item-template-apply-tx";
import { QUOTE_STATUSES_EXECUTION_EDITABLE } from "@/lib/quote-status-workflow";
import { assertExecutionPlanPermission } from "@/lib/execution-plan-permissions";
import { evaluateQuoteJobActivationReadiness } from "@/lib/quote-job-activation-readiness";

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

type AcceptQuotePlanResult =
  | { ok: true; acceptedPlanVersion: number; planningInputHash: string }
  | { ok: false; error: string };
type ToggleQuoteExecutionTaskProtectionResult =
  | { ok: true; protected: boolean }
  | { ok: false; error: string };

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
  return QuotePlanProposalSchema.parse({
    quoteId: params.quoteId,
    schemaVersion: 1,
    plannerVersion: "whole-quote-ai-v1",
    generatedAgainstInputHash: params.generatedAgainstInputHash,
    basePlanVersion: params.basePlanVersion,
    summary: params.aiProposal.summary,
    assumptions: params.aiProposal.assumptions,
    warnings: params.aiProposal.warnings,
    operations: params.aiProposal.tasks.map((task, index) => ({
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

export async function seedUncoordinatedDraftAction(quoteId: string): Promise<QuotePlanSeedResult> {
  const qid = quoteId.trim();
  if (!qid) return { ok: false, error: "Missing quote id." };
  const ctx = await getMutableRequestContextOrThrow();
  const [quote, planContext] = await Promise.all([
    loadEditableQuoteWithDraftTasks(db, qid, ctx.organizationId),
    loadQuotePlanContext(qid, ctx.organizationId),
  ]);
  if (!quote || !planContext) {
    return { ok: false, error: "Quote is not editable for execution planning." };
  }
  const generatedAgainstInputHash = computeQuotePlanningInputHash(
    buildQuotePlanPlanningInput(planContext),
    QUOTE_PLAN_INPUT_SCHEMA_VERSION,
  );
  const proposal = buildUncoordinatedDraftProposal({
    quoteId: qid,
    generatedAgainstInputHash,
    basePlanVersion: quote.executionPlan?.planVersion ?? 1,
    lines: quote.lineItems.map((line) => ({
      id: line.id,
      description: line.description,
      tasks: line.draftExecutionTasks,
    })),
  });
  const applied = await applyQuoteExecutionPlanProposalAction(qid, proposal, {
    modelProviderMeta: {
      isFallback: true,
      reason: "Manual uncoordinated draft seed request",
      source: "seedUncoordinatedDraftAction",
    },
  });
  if (!applied.ok) return applied;
  return {
    ok: true,
    proposal,
    appliedOperationIds: applied.appliedOperationIds,
    resultingPlanVersion: applied.resultingPlanVersion,
  };
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
    revalidatePath(`/quotes/${qid}`);
    revalidatePath(`/quotes/${qid}/execution-review`);
  }
  return result;
}

