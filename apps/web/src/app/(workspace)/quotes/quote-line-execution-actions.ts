"use server";

import { LineItemTemplateTaskSource, Prisma } from "@prisma/client";
import { AIService } from "@/lib/ai/ai-service";
import { getAiActionErrorMessage } from "@/lib/ai/ai-provider-errors";
import { validateQuoteAiExecutionPlanForPersist } from "@/lib/ai/quote-ai-execution-plan";
import { validateExecutionTaskStage } from "@/lib/ai/map-ai-stage";
import { revalidatePath } from "next/cache";
import { db, type ExtendedTransactionClient } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { QUOTE_STATUSES_EXECUTION_EDITABLE } from "@/lib/quote-status-workflow";
import { parseTaskTemplateCategory } from "@/lib/task-template-category";
import type { TaskCompletionRequirements } from "@/lib/task-readiness";
import type { TaskResourceRequirement } from "@/lib/task-resource";
import { TASK_TEMPLATE_FIELD_LIMITS } from "@/app/(workspace)/settings/scope-library/task-template-field-limits";

export type QuoteLineExecutionFormState = {
  error?: string;
  warnings?: string[];
};

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

export type QuoteLineExecutionRevalidateScope = "quote" | "execution-review";

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

  const ctx = await getRequestContextOrThrow();

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

    await tx.quoteLineExecutionTask.create({
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

  const ctx = await getRequestContextOrThrow();

  const ok = await db.$transaction(async (tx) => {
    const line = await assertDraftQuoteLine(tx, qid, lid, ctx.organizationId);
    if (!line) {
      return false;
    }

    const sortOrder = await nextSortOrderInStage(tx, lid, parsed.data.stageId);

    await tx.quoteLineExecutionTask.create({
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

  const ctx = await getRequestContextOrThrow();

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

  const ctx = await getRequestContextOrThrow();

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

  const ctx = await getRequestContextOrThrow();

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

export async function generateQuoteLineExecutionPlanAction(
  quoteId: string,
  lineItemId: string,
): Promise<QuoteLineExecutionFormState> {
  const qid = quoteId.trim();
  const lid = lineItemId.trim();
  if (!qid || !lid) {
    return { error: "Missing quote or line item." };
  }

  const ctx = await getRequestContextOrThrow();

  try {
    const line = await db.quoteLineItem.findFirst({
      where: {
        id: lid,
        quoteId: qid,
        quote: { organizationId: ctx.organizationId },
      },
      include: {
        quote: { select: { organizationId: true } },
        sourceLineItemTemplate: { include: { tags: { select: { name: true } } } },
      },
    });

    if (!line) {
      return { error: "Line item not found." };
    }

    const stages = await db.stage.findMany({
      where: { organizationId: ctx.organizationId, archivedAt: null },
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    });

    const tags = line.sourceLineItemTemplate?.tags.map((t) => t.name) || [];
    const plan = await AIService.generateExecutionPlan(
      line.description,
      line.quote.organizationId,
      tags,
      stages,
    );

    const validation = validateQuoteAiExecutionPlanForPersist(plan, stages);
    if (!validation.ok) {
      const detail =
        validation.unmappedTaskTitles.length > 0
          ? ` Unmapped: ${validation.unmappedTaskTitles.join(", ")}.`
          : "";
      return { error: `${validation.error}${detail}` };
    }

    await db.$transaction(async (tx) => {
      for (let i = 0; i < plan.tasks.length; i++) {
        const gTask = plan.tasks[i];
        const sortOrder = await nextSortOrderInStage(tx, lid, gTask.stageId ?? null);

        await tx.quoteLineExecutionTask.create({
          data: {
            quoteLineItemId: lid,
            sourceType: LineItemTemplateTaskSource.CUSTOM,
            title: gTask.title,
            category: gTask.category,
            instructions: gTask.instructions,
            stageId: gTask.stageId,
            providesSignals: gTask.providesSignals,
            requiresSignals: gTask.requiresSignals,
            hardSignal: false,
            requirementsJson: {
              checklist: gTask.checklist.map((c: { label: string }) => ({
                id: crypto.randomUUID(),
                label: c.label,
              })),
            } as Prisma.InputJsonValue,
            partsRequiredJson: {
              resources: gTask.resources.map((r: { name: string; quantity: number; isEquipment: boolean }) => ({
                id: crypto.randomUUID(),
                ...r,
              })),
            } as Prisma.InputJsonValue,
            sortOrder,
          },
        });
      }

      await touchQuoteUpdatedAt(tx, qid, ctx.organizationId);
    });

    revalidatePath(`/quotes/${qid}`);
    return { warnings: validation.warnings.length > 0 ? validation.warnings : undefined };
  } catch (e) {
    console.error("Failed to generate execution plan", e);
    return { error: getAiActionErrorMessage(e) };
  }
}
