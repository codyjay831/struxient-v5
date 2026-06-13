"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import {
  buildValidGenerationMeta,
  type AILibraryProposalGenerationMeta,
} from "@/lib/ai/ai-execution-plan-generation";
import {
  AIService,
  type AIQuoteExecutionReviewContext,
} from "@/lib/ai/ai-service";
import { getAiActionErrorMessage } from "@/lib/ai/ai-provider-errors";
import {
  analyzeCrossLineWiring,
  mergeSignalsForCrossLineApply,
  type CrossLineWiringSuggestion,
  type UnresolvedWiringOrphan,
} from "@/lib/ai/signal-suggester";
import {
  QuoteExecutionReviewProposalSchema,
  type QuoteExecutionReviewOperation,
  type QuoteExecutionReviewProposal,
} from "@/lib/ai/quote-execution-review-proposal-schema";
import { validateQuoteExecutionReviewProposalForApply } from "@/lib/ai/quote-execution-review-proposal";
import { normalizeSignalKey } from "@/lib/signal-key";
import type { TaskCompletionRequirements } from "@/lib/task-readiness";
import type { TaskResourceRequirement } from "@/lib/task-resource";
import { QUOTE_STATUSES_EXECUTION_EDITABLE } from "@/lib/quote-status-workflow";
import {
  createQuoteExecutionTaskInTx,
  patchQuoteExecutionTaskSignalsBySourceTaskIdInTx,
} from "@/lib/quote-plan-mutations";

export type QuoteExecutionSecretaryReviewResult =
  | {
      ok: true;
      suggestions: CrossLineWiringSuggestion[];
      unresolvedOrphans: UnresolvedWiringOrphan[];
    }
  | { ok: false; error: string };

export type QuoteExecutionSecretaryApplyResult =
  | { ok: true }
  | { ok: false; error: string };

export type QuoteExecutionReviewAIResult =
  | {
      ok: true;
      proposal: QuoteExecutionReviewProposal;
      generation: AILibraryProposalGenerationMeta;
      unresolvedOrphans: UnresolvedWiringOrphan[];
    }
  | { ok: false; error: string };

export type QuoteExecutionReviewApplyResult =
  | { ok: true; appliedOperationIds: string[]; warnings: string[] }
  | { ok: false; error: string };

export type QuoteExecutionReviewMode = "signals" | "tasks";

const LOCKED_ERROR =
  "This quote is not editable. It may be archived, a job may already exist, or it is outside your organization.";
const QUOTE_SECRETARY_PATCH_RETIRED_ERROR =
  "AI Secretary patch flow is retired. Use whole-quote planning review and apply instead.";

function isQuoteSecretaryPatchFlowRetired(): boolean {
  return true;
}

async function loadQuoteLinesForSecretary(quoteId: string, organizationId: string) {
  return db.quote.findFirst({
    where: {
      id: quoteId,
      organizationId,
      status: { in: [...QUOTE_STATUSES_EXECUTION_EDITABLE] },
      job: { is: null },
    },
    select: {
      id: true,
      lineItems: {
        orderBy: [{ sortOrder: "asc" }],
        select: {
          id: true,
          description: true,
          draftExecutionTasks: {
            orderBy: [{ sortOrder: "asc" }],
            select: {
              id: true,
              title: true,
              category: true,
              providesSignals: true,
              requiresSignals: true,
            },
          },
        },
      },
    },
  });
}

async function loadQuoteForExecutionReviewAI(quoteId: string, organizationId: string) {
  return db.quote.findFirst({
    where: {
      id: quoteId,
      organizationId,
      status: { in: [...QUOTE_STATUSES_EXECUTION_EDITABLE] },
      job: { is: null },
    },
    select: {
      id: true,
      title: true,
      lineItems: {
        orderBy: [{ sortOrder: "asc" }],
        select: {
          id: true,
          description: true,
          draftExecutionTasks: {
            orderBy: [{ sortOrder: "asc" }],
            select: {
              id: true,
              title: true,
              category: true,
              stageId: true,
              stage: { select: { name: true } },
              providesSignals: true,
              requiresSignals: true,
              hardSignal: true,
            },
          },
        },
      },
    },
  });
}

function makeChecklistWithIds(
  checklist: { label: string }[],
): NonNullable<TaskCompletionRequirements["checklist"]> {
  return checklist.map((item) => ({ id: crypto.randomUUID(), label: item.label }));
}

function buildRequirementsJson(operation: Extract<QuoteExecutionReviewOperation, { type: "add_task" }>) {
  return {
    noteRequired: operation.task.noteRequired ?? false,
    photoRequired: operation.task.photoRequired ?? false,
    attachmentRequired: operation.task.attachmentRequired ?? false,
    checklist: makeChecklistWithIds(operation.task.checklist),
  } satisfies TaskCompletionRequirements;
}

function buildResourcesJson(operation: Extract<QuoteExecutionReviewOperation, { type: "add_task" }>) {
  return {
    resources: operation.task.resources.map((resource) => ({
      id: crypto.randomUUID(),
      name: resource.name,
      quantity: resource.quantity,
      unit: resource.unit,
      isEquipment: resource.isEquipment,
    })),
  } satisfies TaskResourceRequirement;
}

function mergeSignals(existing: string[], add: string[], remove: string[]): string[] {
  const removed = new Set(remove.map((value) => value.trim()).filter(Boolean));
  const merged = existing.filter((value) => !removed.has(value));
  for (const value of add.map((entry) => entry.trim()).filter(Boolean)) {
    if (!merged.includes(value)) {
      merged.push(value);
    }
  }
  return merged;
}

function normalizeTaskTitle(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function haveEquivalentSignals(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const left = new Set(a.map((value) => normalizeSignalKey(value)));
  const right = new Set(b.map((value) => normalizeSignalKey(value)));
  if (left.size !== right.size) {
    return false;
  }
  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }
  return true;
}

export async function reviewQuoteCrossLineWiringAction(
  quoteId: string,
): Promise<QuoteExecutionSecretaryReviewResult> {
  const qid = quoteId.trim();
  if (!qid) {
    return { ok: false, error: "Missing quote id." };
  }

  const ctx = await getRequestContextOrThrow();
  const quote = await loadQuoteLinesForSecretary(qid, ctx.organizationId);
  if (!quote) {
    return { ok: false, error: LOCKED_ERROR };
  }

  const lines = quote.lineItems.map((line) => ({
    id: line.id,
    description: line.description,
    tasks: line.draftExecutionTasks.map((task) => ({
      id: task.id,
      title: task.title,
      category: task.category,
      provides: task.providesSignals,
      requires: task.requiresSignals,
    })),
  }));

  const analysis = analyzeCrossLineWiring(lines);

  return {
    ok: true,
    suggestions: analysis.suggestions,
    unresolvedOrphans: analysis.unresolvedOrphans,
  };
}

export async function applyQuoteCrossLineWiringSuggestionAction(
  quoteId: string,
  suggestionKey: string,
): Promise<QuoteExecutionSecretaryApplyResult> {
  if (isQuoteSecretaryPatchFlowRetired()) {
    return { ok: false, error: QUOTE_SECRETARY_PATCH_RETIRED_ERROR };
  }
  const qid = quoteId.trim();
  const key = suggestionKey.trim();
  if (!qid || !key) {
    return { ok: false, error: "Missing quote or suggestion." };
  }

  const ctx = await getRequestContextOrThrow();
  const review = await reviewQuoteCrossLineWiringAction(qid);
  if (!review.ok) {
    return { ok: false, error: review.error };
  }

  const suggestion = review.suggestions.find((s) => s.suggestionKey === key);
  if (!suggestion) {
    return { ok: false, error: "This suggestion is no longer available. Run review again." };
  }

  const outcome = await db.$transaction(async (tx) => {
    const quote = await tx.quote.findFirst({
      where: {
        id: qid,
        organizationId: ctx.organizationId,
        status: { in: [...QUOTE_STATUSES_EXECUTION_EDITABLE] },
        job: { is: null },
      },
      select: { id: true },
    });
    if (!quote) {
      return { ok: false as const };
    }

    const [consumer, provider] = await Promise.all([
      tx.quoteLineExecutionTask.findFirst({
        where: { id: suggestion.consumerTaskId },
        include: {
          quoteLineItem: {
            select: { quoteId: true, quote: { select: { organizationId: true } } },
          },
        },
      }),
      tx.quoteLineExecutionTask.findFirst({
        where: { id: suggestion.providerTaskId },
        include: {
          quoteLineItem: {
            select: { quoteId: true, quote: { select: { organizationId: true } } },
          },
        },
      }),
    ]);

    if (
      !consumer ||
      !provider ||
      consumer.quoteLineItem.quoteId !== qid ||
      provider.quoteLineItem.quoteId !== qid ||
      consumer.quoteLineItem.quote.organizationId !== ctx.organizationId ||
      provider.quoteLineItem.quote.organizationId !== ctx.organizationId
    ) {
      return { ok: false as const };
    }

    const signal = suggestion.signal;

    await tx.quoteLineExecutionTask.update({
      where: { id: consumer.id },
      data: {
        requiresSignals: mergeSignalsForCrossLineApply(consumer.requiresSignals, [signal]),
      },
    });
    await patchQuoteExecutionTaskSignalsBySourceTaskIdInTx(tx, {
      quoteId: qid,
      organizationId: ctx.organizationId,
      sourceQuoteLineExecutionTaskId: consumer.id,
      requiresSignals: mergeSignalsForCrossLineApply(consumer.requiresSignals, [signal]),
    });

    await tx.quoteLineExecutionTask.update({
      where: { id: provider.id },
      data: {
        providesSignals: mergeSignalsForCrossLineApply(provider.providesSignals, [signal]),
      },
    });
    await patchQuoteExecutionTaskSignalsBySourceTaskIdInTx(tx, {
      quoteId: qid,
      organizationId: ctx.organizationId,
      sourceQuoteLineExecutionTaskId: provider.id,
      providesSignals: mergeSignalsForCrossLineApply(provider.providesSignals, [signal]),
    });

    await tx.$executeRaw`
      UPDATE "Quote"
      SET "updatedAt" = NOW()
      WHERE "id" = ${qid} AND "organizationId" = ${ctx.organizationId}
    `;

    return { ok: true as const };
  });

  if (!outcome.ok) {
    return { ok: false, error: LOCKED_ERROR };
  }

  revalidatePath(`/quotes/${qid}`);
  revalidatePath(`/quotes/${qid}/execution-review`);
  return { ok: true };
}

export async function generateQuoteExecutionReviewAIProposalAction(
  quoteId: string,
  options?: { mode?: QuoteExecutionReviewMode },
): Promise<QuoteExecutionReviewAIResult> {
  if (isQuoteSecretaryPatchFlowRetired()) {
    return { ok: false, error: QUOTE_SECRETARY_PATCH_RETIRED_ERROR };
  }
  const qid = quoteId.trim();
  if (!qid) {
    return { ok: false, error: "Missing quote id." };
  }

  const ctx = await getRequestContextOrThrow();
  const [quote, stages] = await Promise.all([
    loadQuoteForExecutionReviewAI(qid, ctx.organizationId),
    db.stage.findMany({
      where: { organizationId: ctx.organizationId, archivedAt: null },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!quote) {
    return { ok: false, error: LOCKED_ERROR };
  }

  const lines = quote.lineItems.map((line) => ({
    id: line.id,
    description: line.description,
    tasks: line.draftExecutionTasks.map((task) => ({
      id: task.id,
      title: task.title,
      category: task.category,
      stageId: task.stageId,
      stageName: task.stage?.name ?? null,
      providesSignals: task.providesSignals,
      requiresSignals: task.requiresSignals,
      hardSignal: task.hardSignal,
    })),
  }));

  const secretaryLines = lines.map((line) => ({
    id: line.id,
    description: line.description,
    tasks: line.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      category: task.category,
      provides: task.providesSignals,
      requires: task.requiresSignals,
    })),
  }));
  const analysis = analyzeCrossLineWiring(secretaryLines);
  const totalTasks = lines.reduce((sum, line) => sum + line.tasks.length, 0);
  const hardSignalByTaskId = new Map(
    lines.flatMap((line) => line.tasks.map((task) => [task.id, task.hardSignal] as const)),
  );
  const hardOrphanCount = analysis.unresolvedOrphans.reduce(
    (count, orphan) => count + (hardSignalByTaskId.get(orphan.consumerTaskId) ? 1 : 0),
    0,
  );
  const mode = options?.mode ?? "signals";
  const aiContext: AIQuoteExecutionReviewContext = {
    quoteId: quote.id,
    quoteTitle: quote.title,
    organizationId: ctx.organizationId,
    existingStages: stages,
    lines,
    currentSummary: {
      totalTasks,
      orphanCount: analysis.unresolvedOrphans.length,
      hardOrphanCount,
    },
    deterministicSuggestions: analysis.suggestions.map((suggestion) => ({
      signal: suggestion.signal,
      consumerTaskId: suggestion.consumerTaskId,
      providerTaskId: suggestion.providerTaskId,
      consumerTaskTitle: suggestion.consumerTaskTitle,
      providerTaskTitle: suggestion.providerTaskTitle,
    })),
  };

  try {
    const generated = await AIService.generateQuoteExecutionReviewProposal(aiContext, mode);
    const proposal = QuoteExecutionReviewProposalSchema.parse({
      ...generated.proposal,
      quoteId: quote.id,
    });
    const filteredOperations = proposal.operations.filter((operation) =>
      mode === "signals"
        ? operation.type === "patch_task_signals"
        : operation.type === "add_task",
    );
    return {
      ok: true,
      proposal: { ...proposal, operations: filteredOperations },
      generation: generated.generation ?? buildValidGenerationMeta(),
      unresolvedOrphans: analysis.unresolvedOrphans,
    };
  } catch (error) {
    return { ok: false, error: getAiActionErrorMessage(error) };
  }
}

export async function applyQuoteExecutionReviewAIProposalAction(
  quoteId: string,
  proposal: QuoteExecutionReviewProposal,
  selectedOperationIds: string[],
  generation?: AILibraryProposalGenerationMeta,
): Promise<QuoteExecutionReviewApplyResult> {
  if (isQuoteSecretaryPatchFlowRetired()) {
    return { ok: false, error: QUOTE_SECRETARY_PATCH_RETIRED_ERROR };
  }
  const qid = quoteId.trim();
  if (!qid) {
    return { ok: false, error: "Missing quote id." };
  }

  const parsedProposal = QuoteExecutionReviewProposalSchema.parse(proposal);
  if (parsedProposal.quoteId !== qid) {
    return { ok: false, error: "Proposal does not match this quote." };
  }

  const ctx = await getRequestContextOrThrow();

  const quote = await loadQuoteForExecutionReviewAI(qid, ctx.organizationId);
  if (!quote) {
    return { ok: false, error: LOCKED_ERROR };
  }

  const stages = await db.stage.findMany({
    where: { organizationId: ctx.organizationId, archivedAt: null },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });

  const validLineItemIds = new Set(quote.lineItems.map((line) => line.id));
  const validTaskIds = new Set(
    quote.lineItems.flatMap((line) => line.draftExecutionTasks.map((task) => task.id)),
  );

  const validation = validateQuoteExecutionReviewProposalForApply({
    proposal: parsedProposal,
    allowedStages: stages,
    validLineItemIds,
    validTaskIds,
    selectedOperationIds,
    generation,
  });

  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  const operationMap = new Map(parsedProposal.operations.map((operation) => [operation.opId, operation]));

  await db.$transaction(async (tx) => {
    const locked = await tx.quote.findFirst({
      where: {
        id: qid,
        organizationId: ctx.organizationId,
        status: { in: [...QUOTE_STATUSES_EXECUTION_EDITABLE] },
        job: { is: null },
      },
      select: { id: true },
    });
    if (!locked) {
      throw new Error(LOCKED_ERROR);
    }

    for (const opId of validation.selectedOperationIds) {
      const operation = operationMap.get(opId);
      if (!operation) {
        continue;
      }

      if (operation.type === "add_task") {
        const existingSimilarTasks = await tx.quoteLineExecutionTask.findMany({
          where: {
            quoteLineItemId: operation.lineItemId,
            stageId: operation.task.stageId,
          },
          select: {
            title: true,
            providesSignals: true,
            requiresSignals: true,
            hardSignal: true,
          },
        });
        const alreadyExists = existingSimilarTasks.some(
          (task) =>
            normalizeTaskTitle(task.title) === normalizeTaskTitle(operation.task.title) &&
            task.hardSignal === operation.task.hardSignal &&
            haveEquivalentSignals(task.providesSignals, operation.task.providesSignals) &&
            haveEquivalentSignals(task.requiresSignals, operation.task.requiresSignals),
        );
        if (alreadyExists) {
          continue;
        }

        const agg = await tx.quoteLineExecutionTask.aggregate({
          where: {
            quoteLineItemId: operation.lineItemId,
            stageId: operation.task.stageId,
          },
          _max: { sortOrder: true },
        });
        const nextSortOrder = (agg._max.sortOrder ?? -1) + 1;

        const created = await tx.quoteLineExecutionTask.create({
          data: {
            quoteLineItemId: operation.lineItemId,
            title: operation.task.title,
            stageId: operation.task.stageId,
            category: operation.task.category,
            instructions: operation.task.instructions ?? null,
            sortOrder: nextSortOrder,
            sourceType: "CUSTOM",
            sourceTaskTemplateId: null,
            sourceLineItemTemplateTaskId: null,
            providesSignals: operation.task.providesSignals,
            requiresSignals: operation.task.requiresSignals,
            hardSignal: operation.task.hardSignal,
            requirementsJson: buildRequirementsJson(operation),
            partsRequiredJson: buildResourcesJson(operation),
          },
          select: { id: true },
        });
        await createQuoteExecutionTaskInTx(tx, {
          quoteId: qid,
          organizationId: ctx.organizationId,
          input: {
            title: operation.task.title,
            category: operation.task.category,
            stageId: operation.task.stageId,
            instructions: operation.task.instructions ?? null,
            providesSignals: operation.task.providesSignals,
            requiresSignals: operation.task.requiresSignals,
            hardSignal: operation.task.hardSignal,
            requirementsJson: buildRequirementsJson(operation),
            partsRequiredJson: buildResourcesJson(operation),
            sourceType: "CUSTOM",
            sourceTaskTemplateId: null,
            sourceLineItemTemplateTaskId: null,
            sourceQuoteLineExecutionTaskId: created.id,
            origin: "AI_PLAN",
            relatedLineItemIds: [operation.lineItemId],
          },
        });
        continue;
      }

      const task = await tx.quoteLineExecutionTask.findFirst({
        where: { id: operation.taskId },
        include: {
          quoteLineItem: {
            select: { quoteId: true, quote: { select: { organizationId: true } } },
          },
        },
      });
      if (
        !task ||
        task.quoteLineItem.quoteId !== qid ||
        task.quoteLineItem.quote.organizationId !== ctx.organizationId
      ) {
        throw new Error("One or more AI changes are no longer valid for this quote.");
      }

      await tx.quoteLineExecutionTask.update({
        where: { id: task.id },
        data: {
          providesSignals: mergeSignals(
            task.providesSignals,
            operation.addProvides,
            operation.removeProvides,
          ),
          requiresSignals: mergeSignals(
            task.requiresSignals,
            operation.addRequires,
            operation.removeRequires,
          ),
        },
      });
      await patchQuoteExecutionTaskSignalsBySourceTaskIdInTx(tx, {
        quoteId: qid,
        organizationId: ctx.organizationId,
        sourceQuoteLineExecutionTaskId: task.id,
        providesSignals: mergeSignals(
          task.providesSignals,
          operation.addProvides,
          operation.removeProvides,
        ),
        requiresSignals: mergeSignals(
          task.requiresSignals,
          operation.addRequires,
          operation.removeRequires,
        ),
      });
    }

    await tx.$executeRaw`
      UPDATE "Quote"
      SET "updatedAt" = NOW()
      WHERE "id" = ${qid} AND "organizationId" = ${ctx.organizationId}
    `;
  });

  revalidatePath(`/quotes/${qid}`);
  revalidatePath(`/quotes/${qid}/execution-review`);
  return { ok: true, appliedOperationIds: validation.selectedOperationIds, warnings: validation.warnings };
}
