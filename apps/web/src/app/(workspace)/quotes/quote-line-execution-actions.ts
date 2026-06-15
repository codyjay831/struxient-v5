"use server";

import { LineItemTemplateTaskSource, Prisma, TaskTemplateCategory } from "@prisma/client";
import { AIService } from "@/lib/ai/ai-service";
import { getAiActionErrorMessage } from "@/lib/ai/ai-provider-errors";
import { validateQuoteAiExecutionPlanForApply } from "@/lib/ai/quote-ai-execution-plan";
import type { AILibraryProposal } from "@/lib/ai/library-proposal-schema";
import { AILibraryProposalSchema } from "@/lib/ai/library-proposal-schema";
import type { AILibraryProposalGenerationMeta } from "@/lib/ai/ai-execution-plan-generation";
import { isAiExecutionContextPreflightEnabled } from "@/lib/ai/ai-execution-plan-generation";
import { buildTaskCompletionRequirementsFromAiTask } from "@/lib/ai/ai-proposal-task-requirements";
import { validateExecutionTaskStage } from "@/lib/ai/map-ai-stage";
import { revalidatePath } from "next/cache";
import { db, type ExtendedTransactionClient } from "@/lib/db";
import { getCommercialRequestContextOrThrow } from "@/lib/auth-context";
import {
  buildAiMeteringContext,
  runMeteredAiFeature,
} from "@/lib/billing/run-metered-ai-feature";
import { QUOTE_STATUSES_EXECUTION_EDITABLE } from "@/lib/quote-status-workflow";
import { parseTaskTemplateCategory } from "@/lib/task-template-category";
import type { TaskCompletionRequirements } from "@/lib/task-readiness";
import type { TaskResourceRequirement } from "@/lib/task-resource";
import { TASK_TEMPLATE_FIELD_LIMITS } from "@/app/(workspace)/settings/scope-library/task-template-field-limits";
import {
  buildQuoteLineExecutionPlanningContextFromLine,
  buildQuoteLineExecutionPlanningContextManifestFromLine,
} from "@/lib/ai/execution-planning-inputs";
import { buildQuoteExecutionPlanningContextFromManifest } from "@/lib/ai/quote-execution-planning-context";
import { resolveQuoteLineAiReplaceDeleteIds } from "@/lib/ai/quote-line-ai-replace";
import { normalizeSignalKey } from "@/lib/signal-key";
import {
  buildProviderTaskTitle,
  signalLooksSchedulingOrAccessRelated,
} from "@/lib/signal-display-copy";
import {
  appendBusinessProfileContext,
  selectBusinessProfileAiContext,
} from "@/lib/business-profile/business-profile-ai-context";
import { getBusinessProfileForAi } from "@/lib/business-profile/business-profile-service";
import {
  createQuoteExecutionTaskInTx,
  deleteQuoteExecutionTasksBySourceTaskIdInTx,
  patchQuoteExecutionTaskSignalsBySourceTaskIdInTx,
  reorderQuoteExecutionTasksBySourceTaskIdInTx,
  syncQuoteExecutionTaskFromSourceTaskInTx,
} from "@/lib/quote-plan-mutations";
import type {
  ExecutionContextAssessment,
  ExecutionPlanningContextManifest,
  QuoteLineExecutionAiApplyOptions,
  QuoteLineExecutionAiGenerateOptions,
  QuoteLineExecutionFormState,
  QuoteLineExecutionRevalidateScope,
} from "@/app/(workspace)/quotes/quote-line-execution-types";

export type {
  ExecutionContextAssessment,
  QuoteLineExecutionAiApplyMode,
  QuoteLineExecutionAiApplyOptions,
  QuoteLineExecutionAiGenerateOptions,
  QuoteLineExecutionFormState,
  QuoteLineExecutionRevalidateScope,
} from "@/app/(workspace)/quotes/quote-line-execution-types";

function trimOrNull(value: FormDataEntryValue | null): string | null {
  if (value == null || typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function trimRequired(value: FormDataEntryValue | null): string {
  if (value == null || typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function enforceMaxLength(
  label: string,
  value: string,
  max: number,
): QuoteLineExecutionFormState | null {
  if (value.length > max) {
    return { error: `${label} is too long (max ${max} characters).` };
  }
  return null;
}

function parseSignals(value: FormDataEntryValue | null): string[] {
  if (value == null || typeof value !== "string") {
    return [];
  }
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

async function touchQuoteUpdatedAt(tx: ExtendedTransactionClient, quoteId: string, organizationId: string) {
  await tx.$executeRaw`
    UPDATE "Quote"
    SET "updatedAt" = NOW()
    WHERE "id" = ${quoteId} AND "organizationId" = ${organizationId}
  `;
}

async function nextSortOrderInStage(
  tx: ExtendedTransactionClient,
  quoteLineItemId: string,
  stageId: string | null,
) {
  const agg = await tx.quoteLineExecutionTask.aggregate({
    where: { quoteLineItemId, stageId },
    _max: { sortOrder: true },
  });
  return (agg._max.sortOrder ?? -1) + 1;
}

async function renumberSortOrdersInStage(
  tx: ExtendedTransactionClient,
  quoteLineItemId: string,
  stageId: string | null,
) {
  const rows = await tx.quoteLineExecutionTask.findMany({
    where: { quoteLineItemId, stageId },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  for (let i = 0; i < rows.length; i++) {
    await tx.quoteLineExecutionTask.update({
      where: { id: rows[i].id },
      data: { sortOrder: i },
    });
  }
}

type ParsedTaskBody =
  | QuoteLineExecutionFormState
  | {
      data: {
        title: string;
        stageId: string | null;
        category: NonNullable<ReturnType<typeof parseTaskTemplateCategory>>;
        instructions: string | null;
        providesSignals: string[];
        requiresSignals: string[];
        hardSignal: boolean;
        requirementsJson: TaskCompletionRequirements | null;
        partsRequiredJson: TaskResourceRequirement | null;
      };
    };

function parseTaskBodyFromForm(formData: FormData): ParsedTaskBody {
  const title = trimRequired(formData.get("title"));
  if (!title) {
    return { error: "Title is required." };
  }
  const titleErr = enforceMaxLength("Title", title, TASK_TEMPLATE_FIELD_LIMITS.title);
  if (titleErr) {
    return titleErr;
  }
  const stageId = trimOrNull(formData.get("stageId"));
  const category = parseTaskTemplateCategory(formData.get("category"));
  if (!category) {
    return { error: "Choose a valid task category." };
  }
  const instructionsRaw = trimOrNull(formData.get("instructions"));
  if (instructionsRaw) {
    const instErr = enforceMaxLength(
      "Instructions",
      instructionsRaw,
      TASK_TEMPLATE_FIELD_LIMITS.instructions,
    );
    if (instErr) {
      return instErr;
    }
  }

  const providesSignals = parseSignals(formData.get("providesSignals"));
  const requiresSignals = parseSignals(formData.get("requiresSignals"));
  const hardSignal = formData.get("hardSignal") === "on";

  const requirementsJson: TaskCompletionRequirements = {
    noteRequired: formData.get("noteRequired") === "on",
    photoRequired: formData.get("photoRequired") === "on",
    attachmentRequired: formData.get("attachmentRequired") === "on",
  };

  const checklistRaw = formData.get("checklistJson");
  if (typeof checklistRaw === "string" && checklistRaw) {
    try {
      requirementsJson.checklist = JSON.parse(checklistRaw);
    } catch (e) {
      console.error("Failed to parse checklistJson", e);
    }
  }

  const partsRaw = formData.get("partsRequiredJson");
  let partsRequiredJson: TaskResourceRequirement | null = null;
  if (typeof partsRaw === "string" && partsRaw) {
    try {
      partsRequiredJson = JSON.parse(partsRaw);
    } catch (e) {
      console.error("Failed to parse partsRequiredJson", e);
    }
  }

  return {
    data: {
      title,
      stageId,
      category,
      instructions: instructionsRaw,
      providesSignals,
      requiresSignals,
      hardSignal,
      requirementsJson,
      partsRequiredJson,
    },
  };
}

async function assertDraftQuoteLine(
  tx: ExtendedTransactionClient,
  quoteId: string,
  lineItemId: string,
  organizationId: string,
) {
  return tx.quoteLineItem.findFirst({
    where: {
      id: lineItemId,
      quoteId,
      quote: {
        organizationId,
        status: { in: [...QUOTE_STATUSES_EXECUTION_EDITABLE] },
        job: { is: null },
      },
    },
    select: { id: true, quoteId: true },
  });
}

const QUOTE_LINE_EXECUTION_LOCKED_ERROR =
  "This quote line is not editable. The quote may be archived, a job may already be activated, or it is outside your organization.";
const QUOTE_LINE_AI_RETIRED_ERROR =
  "Per-line AI execution planning is retired. Use whole-quote execution planning from Execution Review.";

function isPerLineAiPlanningRetired(): boolean {
  return true;
}

function parseRevalidateScope(
  value: FormDataEntryValue | null,
): QuoteLineExecutionRevalidateScope {
  if (typeof value === "string" && value.trim() === "execution-review") {
    return "execution-review";
  }
  return "quote";
}

function revalidateQuoteLineExecutionSurfaces(
  quoteId: string,
  scope: QuoteLineExecutionRevalidateScope,
) {
  revalidatePath(`/quotes/${quoteId}`);
  if (scope === "execution-review") {
    revalidatePath(`/quotes/${quoteId}/execution-review`);
  }
}

export async function addQuoteLineExecutionTaskFromReusableAction(
  quoteId: string,
  lineItemId: string,
  _prevState: QuoteLineExecutionFormState,
  formData: FormData,
): Promise<QuoteLineExecutionFormState> {
  const qid = quoteId.trim();
  const lid = lineItemId.trim();
  const taskTemplateId = trimRequired(formData.get("taskTemplateId"));
  if (!qid || !lid || !taskTemplateId) {
    return { error: "Missing quote line or reusable task." };
  }

  const ctx = await getCommercialRequestContextOrThrow();

  const outcome = await db.$transaction(async (tx) => {
    const line = await assertDraftQuoteLine(tx, qid, lid, ctx.organizationId);
    if (!line) {
      return { ok: false as const, code: "LINE" as const };
    }

    const reusable = await tx.taskTemplate.findFirst({
      where: {
        id: taskTemplateId,
        organizationId: ctx.organizationId,
        archivedAt: null,
      },
    });
    if (!reusable) {
      return { ok: false as const, code: "TEMPLATE" as const };
    }

    const sortOrder = await nextSortOrderInStage(tx, lid, reusable.stageId);

    const created = await tx.quoteLineExecutionTask.create({
      data: {
        quoteLineItemId: lid,
        sourceLineItemTemplateTaskId: null,
        sourceTaskTemplateId: reusable.id,
        sourceType: LineItemTemplateTaskSource.TASK_TEMPLATE,
        title: reusable.title,
        stageId: reusable.stageId,
        category: reusable.category,
        instructions: reusable.instructions,
        providesSignals: reusable.providesSignals,
        requiresSignals: reusable.requiresSignals,
        hardSignal: reusable.hardSignal,
        requirementsJson: reusable.requirementsJson || {},
        partsRequiredJson: reusable.partsRequiredJson || {},
        sortOrder,
      },
      select: { id: true },
    });

    await createQuoteExecutionTaskInTx(tx, {
      quoteId: qid,
      organizationId: ctx.organizationId,
      input: {
        title: reusable.title,
        stageId: reusable.stageId,
        category: reusable.category,
        instructions: reusable.instructions ?? null,
        providesSignals: reusable.providesSignals,
        requiresSignals: reusable.requiresSignals,
        hardSignal: reusable.hardSignal,
        requirementsJson: (reusable.requirementsJson || {}) as Prisma.InputJsonValue,
        partsRequiredJson: (reusable.partsRequiredJson || {}) as Prisma.InputJsonValue,
        sourceType: "TASK_TEMPLATE",
        sourceTaskTemplateId: reusable.id,
        sourceLineItemTemplateTaskId: null,
        sourceQuoteLineExecutionTaskId: created.id,
        origin: "TEMPLATE_COPY",
        relatedLineItemIds: [lid],
      },
    });

    await touchQuoteUpdatedAt(tx, qid, ctx.organizationId);
    return { ok: true as const };
  });

  if (!outcome.ok) {
    if (outcome.code === "LINE") {
      return { error: QUOTE_LINE_EXECUTION_LOCKED_ERROR };
    }
    return {
      error:
        "That reusable task was not found, may be hidden, or is outside your organization.",
    };
  }

  revalidateQuoteLineExecutionSurfaces(qid, parseRevalidateScope(formData.get("revalidateScope")));
  return {};
}

export async function addQuoteLineExecutionTaskCustomAction(
  quoteId: string,
  lineItemId: string,
  _prevState: QuoteLineExecutionFormState,
  formData: FormData,
): Promise<QuoteLineExecutionFormState> {
  const qid = quoteId.trim();
  const lid = lineItemId.trim();
  if (!qid || !lid) {
    return { error: "Missing quote or line item." };
  }

  const parsed = parseTaskBodyFromForm(formData);
  if (!("data" in parsed)) {
    return parsed;
  }

  const stageCheck = validateExecutionTaskStage(parsed.data.stageId, "quote_line");
  if (!stageCheck.ok) {
    return { error: stageCheck.message };
  }

  const ctx = await getCommercialRequestContextOrThrow();

  const ok = await db.$transaction(async (tx) => {
    const line = await assertDraftQuoteLine(tx, qid, lid, ctx.organizationId);
    if (!line) {
      return false;
    }

    const sortOrder = await nextSortOrderInStage(tx, lid, parsed.data.stageId);

    const created = await tx.quoteLineExecutionTask.create({
      data: {
        quoteLineItemId: lid,
        sourceLineItemTemplateTaskId: null,
        sourceTaskTemplateId: null,
        sourceType: LineItemTemplateTaskSource.CUSTOM,
        title: parsed.data.title,
        stageId: parsed.data.stageId,
        category: parsed.data.category,
        instructions: parsed.data.instructions,
        providesSignals: parsed.data.providesSignals,
        requiresSignals: parsed.data.requiresSignals,
        hardSignal: parsed.data.hardSignal,
        requirementsJson: (parsed.data.requirementsJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        partsRequiredJson: (parsed.data.partsRequiredJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        sortOrder,
      },
      select: { id: true },
    });

    await createQuoteExecutionTaskInTx(tx, {
      quoteId: qid,
      organizationId: ctx.organizationId,
      input: {
        title: parsed.data.title,
        stageId: parsed.data.stageId,
        category: parsed.data.category,
        instructions: parsed.data.instructions,
        providesSignals: parsed.data.providesSignals,
        requiresSignals: parsed.data.requiresSignals,
        hardSignal: parsed.data.hardSignal,
        requirementsJson: (parsed.data.requirementsJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        partsRequiredJson: (parsed.data.partsRequiredJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        sourceType: "CUSTOM",
        sourceTaskTemplateId: null,
        sourceLineItemTemplateTaskId: null,
        sourceQuoteLineExecutionTaskId: created.id,
        origin: "MANUAL",
        relatedLineItemIds: [lid],
      },
    });

    await touchQuoteUpdatedAt(tx, qid, ctx.organizationId);
    return true;
  });

  if (!ok) {
    return { error: QUOTE_LINE_EXECUTION_LOCKED_ERROR };
  }

  revalidateQuoteLineExecutionSurfaces(qid, parseRevalidateScope(formData.get("revalidateScope")));
  return {};
}

export async function updateQuoteLineExecutionTaskAction(
  quoteId: string,
  lineItemId: string,
  taskId: string,
  _prevState: QuoteLineExecutionFormState,
  formData: FormData,
): Promise<QuoteLineExecutionFormState> {
  const qid = quoteId.trim();
  const lid = lineItemId.trim();
  const kid = taskId.trim();
  if (!qid || !lid || !kid) {
    return { error: "Missing quote, line item, or task." };
  }

  const parsed = parseTaskBodyFromForm(formData);
  if (!("data" in parsed)) {
    return parsed;
  }

  const stageCheck = validateExecutionTaskStage(parsed.data.stageId, "quote_line");
  if (!stageCheck.ok) {
    return { error: stageCheck.message };
  }

  const ctx = await getCommercialRequestContextOrThrow();

  const outcome = await db.$transaction(async (tx) => {
    const existing = await tx.quoteLineExecutionTask.findFirst({
      where: { id: kid, quoteLineItemId: lid },
      include: {
        quoteLineItem: {
          select: {
            quoteId: true,
            quote: { select: { organizationId: true, status: true } },
          },
        },
      },
    });
    if (
      !existing ||
      existing.quoteLineItem.quoteId !== qid ||
      existing.quoteLineItem.quote.organizationId !== ctx.organizationId ||
      !QUOTE_STATUSES_EXECUTION_EDITABLE.includes(existing.quoteLineItem.quote.status)
    ) {
      return { ok: false as const };
    }

    const quoteHasJob = await tx.job.findFirst({
      where: { quoteId: qid, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (quoteHasJob) {
      return { ok: false as const };
    }

    const oldStageId = existing.stageId;
    const newStageId = parsed.data.stageId;

    if (newStageId !== oldStageId) {
      const sortOrder = await nextSortOrderInStage(tx, lid, newStageId);
      await tx.quoteLineExecutionTask.update({
        where: { id: kid },
        data: {
          title: parsed.data.title,
          stageId: newStageId,
          category: parsed.data.category,
          instructions: parsed.data.instructions,
          providesSignals: parsed.data.providesSignals,
          requiresSignals: parsed.data.requiresSignals,
          hardSignal: parsed.data.hardSignal,
          requirementsJson: (parsed.data.requirementsJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          partsRequiredJson: (parsed.data.partsRequiredJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          sortOrder,
        },
      });
      await syncQuoteExecutionTaskFromSourceTaskInTx(tx, {
        quoteId: qid,
        organizationId: ctx.organizationId,
        sourceQuoteLineExecutionTaskId: kid,
        data: {
          title: parsed.data.title,
          category: parsed.data.category,
          stageId: newStageId,
          instructions: parsed.data.instructions,
          providesSignals: parsed.data.providesSignals,
          requiresSignals: parsed.data.requiresSignals,
          hardSignal: parsed.data.hardSignal,
          requirementsJson: (parsed.data.requirementsJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          partsRequiredJson: (parsed.data.partsRequiredJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        },
      });
      await renumberSortOrdersInStage(tx, lid, oldStageId);
    } else {
      await tx.quoteLineExecutionTask.update({
        where: { id: kid },
        data: {
          title: parsed.data.title,
          category: parsed.data.category,
          instructions: parsed.data.instructions,
          providesSignals: parsed.data.providesSignals,
          requiresSignals: parsed.data.requiresSignals,
          hardSignal: parsed.data.hardSignal,
          requirementsJson: (parsed.data.requirementsJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          partsRequiredJson: (parsed.data.partsRequiredJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        },
      });
      await syncQuoteExecutionTaskFromSourceTaskInTx(tx, {
        quoteId: qid,
        organizationId: ctx.organizationId,
        sourceQuoteLineExecutionTaskId: kid,
        data: {
          title: parsed.data.title,
          category: parsed.data.category,
          instructions: parsed.data.instructions,
          providesSignals: parsed.data.providesSignals,
          requiresSignals: parsed.data.requiresSignals,
          hardSignal: parsed.data.hardSignal,
          requirementsJson: (parsed.data.requirementsJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          partsRequiredJson: (parsed.data.partsRequiredJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        },
      });
    }

    await touchQuoteUpdatedAt(tx, qid, ctx.organizationId);
    return { ok: true as const };
  });

  if (!outcome.ok) {
    return { error: QUOTE_LINE_EXECUTION_LOCKED_ERROR };
  }

  revalidateQuoteLineExecutionSurfaces(qid, parseRevalidateScope(formData.get("revalidateScope")));
  return {};
}

export async function moveQuoteLineExecutionTaskAction(
  quoteId: string,
  lineItemId: string,
  taskId: string,
  direction: "up" | "down",
  _prevState: QuoteLineExecutionFormState,
  formData: FormData,
): Promise<QuoteLineExecutionFormState> {
  void formData;
  const qid = quoteId.trim();
  const lid = lineItemId.trim();
  const kid = taskId.trim();
  if (!qid || !lid || !kid) {
    return { error: "Missing quote, line item, or task." };
  }

  const ctx = await getCommercialRequestContextOrThrow();

  const outcome = await db.$transaction(async (tx) => {
    const existing = await tx.quoteLineExecutionTask.findFirst({
      where: { id: kid, quoteLineItemId: lid },
      include: {
        quoteLineItem: {
          select: {
            quoteId: true,
            quote: { select: { organizationId: true, status: true } },
          },
        },
      },
    });
    if (
      !existing ||
      existing.quoteLineItem.quoteId !== qid ||
      existing.quoteLineItem.quote.organizationId !== ctx.organizationId ||
      !QUOTE_STATUSES_EXECUTION_EDITABLE.includes(existing.quoteLineItem.quote.status)
    ) {
      return { ok: false as const };
    }

    const quoteHasJob = await tx.job.findFirst({
      where: { quoteId: qid, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (quoteHasJob) {
      return { ok: false as const };
    }

    const stageId = existing.stageId;
    const peers = await tx.quoteLineExecutionTask.findMany({
      where: { quoteLineItemId: lid, stageId },
      orderBy: { sortOrder: "asc" },
    });
    const idx = peers.findIndex((p) => p.id === kid);
    if (idx < 0) {
      return { ok: false as const };
    }
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= peers.length) {
      return { ok: true as const };
    }

    const a = peers[idx];
    const b = peers[swapWith];
    const temp = 1_000_000 + Math.floor(Math.random() * 100_000);
    await tx.quoteLineExecutionTask.update({
      where: { id: a.id },
      data: { sortOrder: temp },
    });
    await tx.quoteLineExecutionTask.update({
      where: { id: b.id },
      data: { sortOrder: a.sortOrder },
    });
    await tx.quoteLineExecutionTask.update({
      where: { id: a.id },
      data: { sortOrder: b.sortOrder },
    });

    const reorderPlanResult = await reorderQuoteExecutionTasksBySourceTaskIdInTx(tx, {
      quoteId: qid,
      organizationId: ctx.organizationId,
      sortOrderBySourceTaskId: {
        [a.id]: b.sortOrder,
        [b.id]: a.sortOrder,
      },
    });
    if (!reorderPlanResult.ok) {
      return { ok: false as const };
    }

    await touchQuoteUpdatedAt(tx, qid, ctx.organizationId);
    return { ok: true as const };
  });

  if (!outcome.ok) {
    return { error: QUOTE_LINE_EXECUTION_LOCKED_ERROR };
  }

  revalidateQuoteLineExecutionSurfaces(qid, parseRevalidateScope(formData.get("revalidateScope")));
  return {};
}

export async function deleteQuoteLineExecutionTaskAction(
  quoteId: string,
  lineItemId: string,
  taskId: string,
  _prevState: QuoteLineExecutionFormState,
  formData: FormData,
): Promise<QuoteLineExecutionFormState> {
  void formData;
  const qid = quoteId.trim();
  const lid = lineItemId.trim();
  const kid = taskId.trim();
  if (!qid || !lid || !kid) {
    return { error: "Missing quote, line item, or task." };
  }

  const ctx = await getCommercialRequestContextOrThrow();

  const outcome = await db.$transaction(async (tx) => {
    const existing = await tx.quoteLineExecutionTask.findFirst({
      where: { id: kid, quoteLineItemId: lid },
      include: {
        quoteLineItem: {
          select: {
            quoteId: true,
            quote: { select: { organizationId: true, status: true } },
          },
        },
      },
    });
    if (
      !existing ||
      existing.quoteLineItem.quoteId !== qid ||
      existing.quoteLineItem.quote.organizationId !== ctx.organizationId ||
      !QUOTE_STATUSES_EXECUTION_EDITABLE.includes(existing.quoteLineItem.quote.status)
    ) {
      return { ok: false as const };
    }

    const quoteHasJob = await tx.job.findFirst({
      where: { quoteId: qid, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (quoteHasJob) {
      return { ok: false as const };
    }

    const stageId = existing.stageId;
    await tx.quoteLineExecutionTask.delete({ where: { id: kid } });
    await deleteQuoteExecutionTasksBySourceTaskIdInTx(tx, {
      quoteId: qid,
      organizationId: ctx.organizationId,
      sourceTaskIds: [kid],
    });
    await renumberSortOrdersInStage(tx, lid, stageId);
    await touchQuoteUpdatedAt(tx, qid, ctx.organizationId);
    return { ok: true as const };
  });

  if (!outcome.ok) {
    return { error: QUOTE_LINE_EXECUTION_LOCKED_ERROR };
  }

  revalidateQuoteLineExecutionSurfaces(qid, parseRevalidateScope(formData.get("revalidateScope")));
  return {};
}

async function createQuoteLineExecutionTasksFromProposal(
  tx: ExtendedTransactionClient,
  quoteId: string,
  organizationId: string,
  quoteLineItemId: string,
  proposal: AILibraryProposal,
) {
  for (const gTask of proposal.tasks) {
    const sortOrder = await nextSortOrderInStage(tx, quoteLineItemId, gTask.stageId ?? null);

    const created = await tx.quoteLineExecutionTask.create({
      data: {
        quoteLineItemId,
        sourceType: gTask.sourceTaskTemplateId
          ? LineItemTemplateTaskSource.TASK_TEMPLATE
          : LineItemTemplateTaskSource.CUSTOM,
        sourceTaskTemplateId: gTask.sourceTaskTemplateId ?? null,
        title: gTask.title,
        category: gTask.category,
        instructions: gTask.instructions,
        stageId: gTask.stageId ?? null,
        providesSignals: gTask.providesSignals,
        requiresSignals: gTask.requiresSignals,
        hardSignal: gTask.hardSignal,
        assigneeRole: gTask.assigneeRole ?? null,
        requirementsJson: buildTaskCompletionRequirementsFromAiTask(gTask) as Prisma.InputJsonValue,
        partsRequiredJson: {
          resources: gTask.resources.map((r) => ({
            id: crypto.randomUUID(),
            ...r,
          })),
        } as Prisma.InputJsonValue,
        sortOrder,
      },
      select: { id: true },
    });

    await createQuoteExecutionTaskInTx(tx, {
      quoteId,
      organizationId,
      input: {
        title: gTask.title,
        stageId: gTask.stageId ?? null,
        category: gTask.category,
        instructions: gTask.instructions ?? null,
        providesSignals: gTask.providesSignals,
        requiresSignals: gTask.requiresSignals,
        hardSignal: gTask.hardSignal,
        requirementsJson: buildTaskCompletionRequirementsFromAiTask(gTask) as Prisma.InputJsonValue,
        partsRequiredJson: {
          resources: gTask.resources.map((r) => ({
            id: crypto.randomUUID(),
            ...r,
          })),
        } as Prisma.InputJsonValue,
        sourceType: gTask.sourceTaskTemplateId ? "TASK_TEMPLATE" : "CUSTOM",
        sourceTaskTemplateId: gTask.sourceTaskTemplateId ?? null,
        sourceLineItemTemplateTaskId: null,
        sourceQuoteLineExecutionTaskId: created.id,
        origin: "AI_PLAN",
        relatedLineItemIds: [quoteLineItemId],
      },
    });
  }
}

export async function generateQuoteLineExecutionAIProposalAction(
  quoteId: string,
  lineItemId: string,
  options?: QuoteLineExecutionAiGenerateOptions,
): Promise<{
  error?: string;
  proposal?: AILibraryProposal;
  generation?: AILibraryProposalGenerationMeta;
  contextManifest?: ExecutionPlanningContextManifest;
  contextPreview?: string;
}> {
  if (isPerLineAiPlanningRetired()) {
    return { error: QUOTE_LINE_AI_RETIRED_ERROR };
  }
  const qid = quoteId.trim();
  const lid = lineItemId.trim();
  if (!qid || !lid) {
    return { error: "Missing quote or line item." };
  }

  const ctx = await getCommercialRequestContextOrThrow();
  const startedAt = Date.now();

  try {
    console.info("[quote-ai] generate start", { quoteId: qid, lineItemId: lid });

    const line = await db.quoteLineItem.findFirst({
      where: {
        id: lid,
        quoteId: qid,
        quote: {
          organizationId: ctx.organizationId,
          status: { in: [...QUOTE_STATUSES_EXECUTION_EDITABLE] },
          job: { is: null },
        },
      },
      select: {
        description: true,
        internalNotes: true,
        customerScopeTitle: true,
        customerScopeDescription: true,
        customerIncludedNotes: true,
        customerExcludedNotes: true,
        quote: {
          select: {
            organizationId: true,
            internalNotes: true,
            lead: { select: { notes: true } },
            serviceLocation: {
              select: {
                apn: true,
                apnSourceTitle: true,
                detailsStatus: true,
                utility: { select: { name: true } },
                jurisdiction: { select: { name: true } },
              },
            },
          },
        },
        sourceLineItemTemplate: { select: { tags: { select: { name: true } } } },
      },
    });

    if (!line) {
      console.warn("[quote-ai] generate locked", {
        quoteId: qid,
        lineItemId: lid,
        durationMs: Date.now() - startedAt,
      });
      return { error: QUOTE_LINE_EXECUTION_LOCKED_ERROR };
    }

    const stages = await db.stage.findMany({
      where: { organizationId: ctx.organizationId, archivedAt: null },
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    });

    const tags = line.sourceLineItemTemplate?.tags.map((t) => t.name) || [];
    const contextManifest = buildQuoteLineExecutionPlanningContextManifestFromLine({
      line,
      userInstructions: options?.userInstructions,
      priorMissingContext: options?.priorMissingContext,
    });
    const userInstructions = buildQuoteLineExecutionPlanningContextFromLine({
      line,
      userInstructions: options?.userInstructions,
      priorMissingContext: options?.priorMissingContext,
      sourceFlags: options?.sourceFlags,
      itemOverrides: options?.itemOverrides,
    });
    const profile = await getBusinessProfileForAi(ctx.organizationId);
    const selectedProfileContext = selectBusinessProfileAiContext(
      "QUOTE_LINE_EXECUTION_PLANNING",
      profile,
    );
    const userInstructionsWithProfile = appendBusinessProfileContext(
      userInstructions,
      selectedProfileContext,
    );
    const contextPreview = buildQuoteExecutionPlanningContextFromManifest(contextManifest, {
      sourceFlags: options?.sourceFlags,
      itemOverrides: options?.itemOverrides,
    });

    const metered = await runMeteredAiFeature({
      ctx: buildAiMeteringContext({
        organizationId: ctx.organizationId,
        feature: "execution_plan_quote_line",
        requestKind: "generate",
        promptChars: line.description.length,
      }),
      run: async () => {
        const generated = await AIService.generateExecutionPlan(
          line.description,
          line.quote.organizationId,
          tags,
          stages,
          [],
          ctx.organizationName,
          userInstructionsWithProfile,
        );
        if (!generated.metering) {
          throw new Error("AI metering metadata missing from line execution plan.");
        }
        return {
          result: generated,
          metering: generated.metering,
          responseChars: JSON.stringify(generated.proposal).length,
        };
      },
    });
    if (!metered.ok) {
      return { error: metered.error };
    }
    const generated = metered.data;

    console.info("[quote-ai] generate ok", {
      quoteId: qid,
      lineItemId: lid,
      durationMs: Date.now() - startedAt,
      taskCount: generated.proposal.tasks.length,
      isSimulated: generated.generation.isSimulated,
    });

    return {
      proposal: generated.proposal,
      generation: generated.generation,
      contextManifest,
      contextPreview,
    };
  } catch (e) {
    console.error("[quote-ai] generate failed", {
      quoteId: qid,
      lineItemId: lid,
      durationMs: Date.now() - startedAt,
      error: e,
    });
    return { error: getAiActionErrorMessage(e) };
  }
}

export async function assessQuoteLineExecutionContextAction(
  quoteId: string,
  lineItemId: string,
  options?: QuoteLineExecutionAiGenerateOptions,
): Promise<{
  error?: string;
  assessment?: ExecutionContextAssessment;
  contextManifest?: ExecutionPlanningContextManifest;
  contextPreview?: string;
}> {
  if (isPerLineAiPlanningRetired()) {
    return { error: QUOTE_LINE_AI_RETIRED_ERROR };
  }
  const qid = quoteId.trim();
  const lid = lineItemId.trim();
  if (!qid || !lid) {
    return { error: "Missing quote or line item." };
  }
  const preflightEnabled = isAiExecutionContextPreflightEnabled();

  const ctx = await getCommercialRequestContextOrThrow();
  const startedAt = Date.now();

  try {
    const line = await db.quoteLineItem.findFirst({
      where: {
        id: lid,
        quoteId: qid,
        quote: {
          organizationId: ctx.organizationId,
          status: { in: [...QUOTE_STATUSES_EXECUTION_EDITABLE] },
          job: { is: null },
        },
      },
      select: {
        description: true,
        internalNotes: true,
        customerScopeTitle: true,
        customerScopeDescription: true,
        customerIncludedNotes: true,
        customerExcludedNotes: true,
        quote: {
          select: {
            organizationId: true,
            internalNotes: true,
            lead: { select: { notes: true } },
            serviceLocation: {
              select: {
                apn: true,
                apnSourceTitle: true,
                detailsStatus: true,
                utility: { select: { name: true } },
                jurisdiction: { select: { name: true } },
              },
            },
          },
        },
        sourceLineItemTemplate: { select: { tags: { select: { name: true } } } },
      },
    });
    if (!line) {
      return { error: QUOTE_LINE_EXECUTION_LOCKED_ERROR };
    }

    const stages = await db.stage.findMany({
      where: { organizationId: ctx.organizationId, archivedAt: null },
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    });

    const tags = line.sourceLineItemTemplate?.tags.map((t) => t.name) || [];
    const contextManifest = buildQuoteLineExecutionPlanningContextManifestFromLine({
      line,
      userInstructions: options?.userInstructions,
      priorMissingContext: options?.priorMissingContext,
    });
    const userInstructions = buildQuoteLineExecutionPlanningContextFromLine({
      line,
      userInstructions: options?.userInstructions,
      priorMissingContext: options?.priorMissingContext,
      sourceFlags: options?.sourceFlags,
      itemOverrides: options?.itemOverrides,
    });
    const profile = await getBusinessProfileForAi(ctx.organizationId);
    const selectedProfileContext = selectBusinessProfileAiContext(
      "QUOTE_LINE_EXECUTION_PLANNING",
      profile,
    );
    const userInstructionsWithProfile = appendBusinessProfileContext(
      userInstructions,
      selectedProfileContext,
    );
    const contextPreview = buildQuoteExecutionPlanningContextFromManifest(contextManifest, {
      sourceFlags: options?.sourceFlags,
      itemOverrides: options?.itemOverrides,
    });
    const assessmentResult = preflightEnabled
      ? await (async () => {
          const metered = await runMeteredAiFeature({
            ctx: buildAiMeteringContext({
              organizationId: ctx.organizationId,
              feature: "execution_context_assess",
              requestKind: "assess",
              promptChars: line.description.length,
            }),
            run: async () => {
              const result = await AIService.assessExecutionPlanningContext({
                templateId: "compat",
                description: line.description,
                organizationId: line.quote.organizationId,
                tags,
                existingStages: stages,
                existingSignals: [],
                organizationName: ctx.organizationName,
                userInstructions: userInstructionsWithProfile,
              });
              if (!result.metering) {
                throw new Error("AI metering metadata missing from context assessment.");
              }
              return {
                result: result.assessment,
                metering: result.metering,
              };
            },
          });
          if (!metered.ok) {
            throw new Error(metered.error);
          }
          return metered.data;
        })()
      : { foundContext: [], missingContext: [], assumptions: [] };
    const assessment = assessmentResult;
    console.info("[quote-ai] assess ok", {
      quoteId: qid,
      lineItemId: lid,
      durationMs: Date.now() - startedAt,
      missingCount: assessment.missingContext.length,
    });

    return { assessment, contextManifest, contextPreview };
  } catch (e) {
    console.error("[quote-ai] assess failed", {
      quoteId: qid,
      lineItemId: lid,
      durationMs: Date.now() - startedAt,
      error: e,
    });
    return { error: getAiActionErrorMessage(e, "Failed to assess execution context.") };
  }
}

export async function applyQuoteLineExecutionAIProposalAction(
  quoteId: string,
  lineItemId: string,
  proposal: AILibraryProposal,
  generation?: AILibraryProposalGenerationMeta,
  options?: QuoteLineExecutionAiApplyOptions,
): Promise<{ error?: string; success?: boolean; warnings?: string[] }> {
  if (isPerLineAiPlanningRetired()) {
    return { error: QUOTE_LINE_AI_RETIRED_ERROR };
  }
  const qid = quoteId.trim();
  const lid = lineItemId.trim();
  if (!qid || !lid) {
    return { error: "Missing quote or line item." };
  }

  const ctx = await getCommercialRequestContextOrThrow();

  try {
    const parsedProposal = AILibraryProposalSchema.parse(proposal);

    const stages = await db.stage.findMany({
      where: { organizationId: ctx.organizationId, archivedAt: null },
      select: { id: true, name: true },
    });

    const validation = validateQuoteAiExecutionPlanForApply(
      parsedProposal,
      stages,
      generation,
    );
    if (!validation.ok) {
      const detail =
        validation.unmappedTaskTitles.length > 0
          ? ` Unmapped: ${validation.unmappedTaskTitles.join(", ")}.`
          : "";
      return { error: `${validation.error}${detail}` };
    }

    await db.$transaction(async (tx) => {
      const line = await assertDraftQuoteLine(tx, qid, lid, ctx.organizationId);
      if (!line) {
        throw new Error("LINE_LOCKED");
      }

      const mode = options?.mode ?? "append";
      if (mode === "replace") {
        const existingTaskRows = await tx.quoteLineExecutionTask.findMany({
          where: { quoteLineItemId: lid },
          select: { id: true },
        });
        const replacePlan = resolveQuoteLineAiReplaceDeleteIds(
          existingTaskRows.map((row) => row.id),
          options?.keepTaskIds ?? [],
        );
        if (replacePlan.deleteTaskIds.length > 0) {
          await tx.quoteLineExecutionTask.deleteMany({
            where: {
              quoteLineItemId: lid,
              id: { in: replacePlan.deleteTaskIds },
            },
          });
          await deleteQuoteExecutionTasksBySourceTaskIdInTx(tx, {
            quoteId: qid,
            organizationId: ctx.organizationId,
            sourceTaskIds: replacePlan.deleteTaskIds,
          });
        }
      }

      await createQuoteLineExecutionTasksFromProposal(
        tx,
        qid,
        ctx.organizationId,
        lid,
        parsedProposal,
      );
      await touchQuoteUpdatedAt(tx, qid, ctx.organizationId);
    });

    revalidateQuoteLineExecutionSurfaces(qid, options?.revalidateScope ?? "quote");
    return {
      success: true,
      warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
    };
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "LINE_LOCKED") {
        return { error: QUOTE_LINE_EXECUTION_LOCKED_ERROR };
      }
      if (e.message === "INVALID_KEEP_TASKS") {
        return { error: "One or more tasks selected to keep are no longer available on this line." };
      }
    }
    console.error("Failed to apply AI execution plan", e);
    return { error: "Failed to apply AI execution plan." };
  }
}

type QuoteExecutionGapActionResult =
  | { ok: true }
  | { ok: false; error: string };

type EditableQuoteTaskRecord = {
  id: string;
  title: string;
  stageId: string | null;
  category: TaskTemplateCategory;
  instructions: string | null;
  requiresSignals: string[];
  providesSignals: string[];
  hardSignal: boolean;
  quoteLineItemId: string;
};

function addSignalByEquivalence(existing: string[], signal: string): string[] {
  const trimmed = signal.trim();
  if (!trimmed) {
    return existing;
  }
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

async function loadEditableQuoteTask(
  tx: ExtendedTransactionClient,
  taskId: string,
  quoteId: string,
  organizationId: string,
): Promise<EditableQuoteTaskRecord | null> {
  const task = await tx.quoteLineExecutionTask.findFirst({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      stageId: true,
      category: true,
      instructions: true,
      requiresSignals: true,
      providesSignals: true,
      hardSignal: true,
      quoteLineItemId: true,
      quoteLineItem: {
        select: {
          quoteId: true,
          quote: {
            select: { organizationId: true, status: true },
          },
        },
      },
    },
  });

  if (
    !task ||
    task.quoteLineItem.quoteId !== quoteId ||
    task.quoteLineItem.quote.organizationId !== organizationId ||
    !QUOTE_STATUSES_EXECUTION_EDITABLE.includes(task.quoteLineItem.quote.status)
  ) {
    return null;
  }

  const quoteHasJob = await tx.job.findFirst({
    where: { quoteId, organizationId },
    select: { id: true },
  });
  if (quoteHasJob) {
    return null;
  }

  return {
    id: task.id,
    title: task.title,
    stageId: task.stageId,
    category: task.category,
    instructions: task.instructions,
    requiresSignals: task.requiresSignals,
    providesSignals: task.providesSignals,
    hardSignal: task.hardSignal,
    quoteLineItemId: task.quoteLineItemId,
  };
}

export async function addQuoteLineDependencyProviderTaskAction(params: {
  quoteId: string;
  consumerTaskId: string;
  signal: string;
}): Promise<QuoteExecutionGapActionResult> {
  const qid = params.quoteId.trim();
  const consumerTaskId = params.consumerTaskId.trim();
  const signal = params.signal.trim();
  if (!qid || !consumerTaskId || !signal) {
    return { ok: false, error: "Missing quote, task, or signal." };
  }

  const ctx = await getCommercialRequestContextOrThrow();

  const outcome = await db.$transaction(async (tx) => {
    const consumerTask = await loadEditableQuoteTask(tx, consumerTaskId, qid, ctx.organizationId);
    if (!consumerTask) {
      return { ok: false as const };
    }

    const normalizedSignal = normalizeSignalKey(signal);
    const existingProviders = await tx.quoteLineExecutionTask.findMany({
      where: {
        quoteLineItem: {
          quoteId: qid,
          quote: { organizationId: ctx.organizationId },
        },
      },
      select: { providesSignals: true },
    });
    if (
      existingProviders.some((task) =>
        task.providesSignals.some((entry) => normalizeSignalKey(entry) === normalizedSignal),
      )
    ) {
      await touchQuoteUpdatedAt(tx, qid, ctx.organizationId);
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
    const sortOrder = await nextSortOrderInStage(tx, consumerTask.quoteLineItemId, stageId);

    const created = await tx.quoteLineExecutionTask.create({
      data: {
        quoteLineItemId: consumerTask.quoteLineItemId,
        sourceLineItemTemplateTaskId: null,
        sourceTaskTemplateId: null,
        sourceType: LineItemTemplateTaskSource.CUSTOM,
        title,
        stageId,
        category,
        instructions: null,
        providesSignals: [signal],
        requiresSignals: [],
        hardSignal: false,
        requirementsJson: {},
        partsRequiredJson: {},
        sortOrder,
      },
      select: { id: true },
    });

    await createQuoteExecutionTaskInTx(tx, {
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
        sourceQuoteLineExecutionTaskId: created.id,
        origin: "MANUAL",
        relatedLineItemIds: [consumerTask.quoteLineItemId],
      },
    });

    await touchQuoteUpdatedAt(tx, qid, ctx.organizationId);
    return { ok: true as const };
  });

  if (!outcome.ok) {
    return { ok: false, error: outcome.error ?? QUOTE_LINE_EXECUTION_LOCKED_ERROR };
  }

  revalidateQuoteLineExecutionSurfaces(qid, "execution-review");
  return { ok: true };
}

export async function connectQuoteLineDependencyGapToTaskAction(params: {
  quoteId: string;
  consumerTaskId: string;
  providerTaskId: string;
  signal: string;
}): Promise<QuoteExecutionGapActionResult> {
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

  const ctx = await getCommercialRequestContextOrThrow();

  const ok = await db.$transaction(async (tx) => {
    const [consumerTask, providerTask] = await Promise.all([
      loadEditableQuoteTask(tx, consumerTaskId, qid, ctx.organizationId),
      loadEditableQuoteTask(tx, providerTaskId, qid, ctx.organizationId),
    ]);
    if (!consumerTask || !providerTask) {
      return false;
    }

    await tx.quoteLineExecutionTask.update({
      where: { id: providerTask.id },
      data: {
        providesSignals: addSignalByEquivalence(providerTask.providesSignals, signal),
      },
    });
    await patchQuoteExecutionTaskSignalsBySourceTaskIdInTx(tx, {
      quoteId: qid,
      organizationId: ctx.organizationId,
      sourceQuoteLineExecutionTaskId: providerTask.id,
      providesSignals: addSignalByEquivalence(providerTask.providesSignals, signal),
    });

    await touchQuoteUpdatedAt(tx, qid, ctx.organizationId);
    return true;
  });

  if (!ok) {
    return { ok: false, error: QUOTE_LINE_EXECUTION_LOCKED_ERROR };
  }

  revalidateQuoteLineExecutionSurfaces(qid, "execution-review");
  return { ok: true };
}

export async function removeQuoteLineDependencyRequirementAction(params: {
  quoteId: string;
  consumerTaskId: string;
  signal: string;
}): Promise<QuoteExecutionGapActionResult> {
  const qid = params.quoteId.trim();
  const consumerTaskId = params.consumerTaskId.trim();
  const signal = params.signal.trim();
  if (!qid || !consumerTaskId || !signal) {
    return { ok: false, error: "Missing quote, task, or signal." };
  }

  const ctx = await getCommercialRequestContextOrThrow();

  const ok = await db.$transaction(async (tx) => {
    const consumerTask = await loadEditableQuoteTask(tx, consumerTaskId, qid, ctx.organizationId);
    if (!consumerTask) {
      return false;
    }

    await tx.quoteLineExecutionTask.update({
      where: { id: consumerTask.id },
      data: {
        requiresSignals: removeSignalByEquivalence(consumerTask.requiresSignals, signal),
      },
    });
    await patchQuoteExecutionTaskSignalsBySourceTaskIdInTx(tx, {
      quoteId: qid,
      organizationId: ctx.organizationId,
      sourceQuoteLineExecutionTaskId: consumerTask.id,
      requiresSignals: removeSignalByEquivalence(consumerTask.requiresSignals, signal),
    });

    await touchQuoteUpdatedAt(tx, qid, ctx.organizationId);
    return true;
  });

  if (!ok) {
    return { ok: false, error: QUOTE_LINE_EXECUTION_LOCKED_ERROR };
  }

  revalidateQuoteLineExecutionSurfaces(qid, "execution-review");
  return { ok: true };
}

export async function relaxQuoteLineDependencyHardSignalAction(params: {
  quoteId: string;
  consumerTaskId: string;
}): Promise<QuoteExecutionGapActionResult> {
  const qid = params.quoteId.trim();
  const consumerTaskId = params.consumerTaskId.trim();
  if (!qid || !consumerTaskId) {
    return { ok: false, error: "Missing quote or task." };
  }

  const ctx = await getCommercialRequestContextOrThrow();

  const outcome = await db.$transaction(async (tx) => {
    const consumerTask = await loadEditableQuoteTask(tx, consumerTaskId, qid, ctx.organizationId);
    if (!consumerTask) {
      return { ok: false as const };
    }
    if (consumerTask.requiresSignals.length !== 1) {
      return {
        ok: false as const,
        error:
          "This task has multiple required signals. Relaxing would affect all of them.",
      };
    }

    await tx.quoteLineExecutionTask.update({
      where: { id: consumerTask.id },
      data: { hardSignal: false },
    });
    await syncQuoteExecutionTaskFromSourceTaskInTx(tx, {
      quoteId: qid,
      organizationId: ctx.organizationId,
      sourceQuoteLineExecutionTaskId: consumerTask.id,
      data: { hardSignal: false },
    });

    await touchQuoteUpdatedAt(tx, qid, ctx.organizationId);
    return { ok: true as const };
  });

  if (!outcome.ok) {
    return { ok: false, error: outcome.error ?? QUOTE_LINE_EXECUTION_LOCKED_ERROR };
  }

  revalidateQuoteLineExecutionSurfaces(qid, "execution-review");
  return { ok: true };
}
