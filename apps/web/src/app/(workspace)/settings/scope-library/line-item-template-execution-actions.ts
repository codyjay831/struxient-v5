"use server";

import { LineItemTemplateTaskSource, Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AIService } from "@/lib/ai/ai-service";
import { getAiActionErrorMessage } from "@/lib/ai/ai-provider-errors";
import type { AILibraryProposal } from "@/lib/ai/library-proposal-schema";
import type { AILibraryProposalGenerationMeta } from "@/lib/ai/ai-execution-plan-generation";
import { isAiExecutionContextPreflightEnabled } from "@/lib/ai/ai-execution-plan-generation";
import { validateLibraryDefaultExecutionProposalForApply } from "@/lib/ai/library-ai-execution-plan";
import { buildTaskCompletionRequirementsFromAiTask } from "@/lib/ai/ai-proposal-task-requirements";
import { validateExecutionTaskStage } from "@/lib/ai/map-ai-stage";
import { db, type ExtendedTransactionClient } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { parseTaskTemplateCategory } from "@/lib/task-template-category";
import type { TaskCompletionRequirements } from "@/lib/task-readiness";
import type { TaskResourceRequirement } from "@/lib/task-resource";
import { TASK_TEMPLATE_FIELD_LIMITS } from "@/app/(workspace)/settings/scope-library/task-template-field-limits";
import { lineItemTemplateDefaultExecutionPath } from "@/lib/line-item-template-execution-path";
import { buildTemplateExecutionPlanningContext } from "@/lib/ai/execution-planning-inputs";
import type { ExecutionContextAssessment } from "@/lib/ai/execution-context-assessment-schema";

export type LineItemTemplateExecutionFormState = {
  error?: string;
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
): LineItemTemplateExecutionFormState | null {
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

async function touchLineItemTemplateUpdatedAt(
  tx: ExtendedTransactionClient,
  templateId: string,
  organizationId: string,
) {
  await tx.$executeRaw`
    UPDATE "LineItemTemplate"
    SET "updatedAt" = NOW()
    WHERE "id" = ${templateId} AND "organizationId" = ${organizationId}
  `;
}

async function nextSortOrderInStage(
  tx: ExtendedTransactionClient,
  lineItemTemplateId: string,
  stageId: string | null,
) {
  const agg = await tx.lineItemTemplateTask.aggregate({
    where: { lineItemTemplateId, stageId },
    _max: { sortOrder: true },
  });
  return (agg._max.sortOrder ?? -1) + 1;
}

async function renumberSortOrdersInStage(
  tx: ExtendedTransactionClient,
  lineItemTemplateId: string,
  stageId: string | null,
) {
  const rows = await tx.lineItemTemplateTask.findMany({
    where: { lineItemTemplateId, stageId },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  for (let i = 0; i < rows.length; i++) {
    await tx.lineItemTemplateTask.update({
      where: { id: rows[i].id },
      data: { sortOrder: i },
    });
  }
}

type ParsedTaskBody =
  | LineItemTemplateExecutionFormState
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

/** Add a default execution row by copying an org TaskTemplate server-side (ignores client title/stage). */
export async function addLineItemTemplateTaskFromReusableAction(
  lineItemTemplateId: string,
  _prevState: LineItemTemplateExecutionFormState,
  formData: FormData,
): Promise<LineItemTemplateExecutionFormState> {
  const tid = lineItemTemplateId.trim();
  const taskTemplateId = trimRequired(formData.get("taskTemplateId"));
  if (!tid || !taskTemplateId) {
    return { error: "Missing saved line item or reusable task." };
  }

  const ctx = await getRequestContextOrThrow();

  const outcome = await db.$transaction(async (tx) => {
    const preset = await tx.lineItemTemplate.findFirst({
      where: { id: tid, organizationId: ctx.organizationId, archivedAt: null },
      select: { id: true },
    });
    if (!preset) {
      return { ok: false as const, code: "NOT_FOUND" as const };
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

    const sortOrder = await nextSortOrderInStage(tx, tid, reusable.stageId);

    await tx.lineItemTemplateTask.create({
      data: {
        lineItemTemplateId: tid,
        sourceType: LineItemTemplateTaskSource.TASK_TEMPLATE,
        sourceTaskTemplateId: reusable.id,
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

    await touchLineItemTemplateUpdatedAt(tx, tid, ctx.organizationId);
    return { ok: true as const };
  });

  if (!outcome.ok) {
    if (outcome.code === "NOT_FOUND") {
      return {
        error:
          "That saved line item was not found, may be hidden, or is outside your organization.",
      };
    }
    return {
      error:
        "That reusable task was not found, may be hidden, or is outside your organization.",
    };
  }

  redirect(lineItemTemplateDefaultExecutionPath(tid));
}

export async function addLineItemTemplateTaskCustomAction(
  lineItemTemplateId: string,
  _prevState: LineItemTemplateExecutionFormState,
  formData: FormData,
): Promise<LineItemTemplateExecutionFormState> {
  const tid = lineItemTemplateId.trim();
  if (!tid) {
    return { error: "Missing saved line item." };
  }

  const parsed = parseTaskBodyFromForm(formData);
  if (!("data" in parsed)) {
    return parsed;
  }

  const stageCheck = validateExecutionTaskStage(
    parsed.data.stageId,
    "line_item_default_execution",
  );
  if (!stageCheck.ok) {
    return { error: stageCheck.message };
  }

  const ctx = await getRequestContextOrThrow();

  const ok = await db.$transaction(async (tx) => {
    const preset = await tx.lineItemTemplate.findFirst({
      where: { id: tid, organizationId: ctx.organizationId, archivedAt: null },
      select: { id: true },
    });
    if (!preset) {
      return false;
    }

    const sortOrder = await nextSortOrderInStage(tx, tid, parsed.data.stageId);

    await tx.lineItemTemplateTask.create({
      data: {
        lineItemTemplateId: tid,
        sourceType: LineItemTemplateTaskSource.CUSTOM,
        sourceTaskTemplateId: null,
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

    await touchLineItemTemplateUpdatedAt(tx, tid, ctx.organizationId);
    return true;
  });

  if (!ok) {
    return {
      error:
        "That saved line item was not found, may be hidden, or is outside your organization.",
    };
  }

  redirect(lineItemTemplateDefaultExecutionPath(tid));
}

export async function updateLineItemTemplateTaskAction(
  lineItemTemplateId: string,
  taskId: string,
  _prevState: LineItemTemplateExecutionFormState,
  formData: FormData,
): Promise<LineItemTemplateExecutionFormState> {
  const tid = lineItemTemplateId.trim();
  const kid = taskId.trim();
  if (!tid || !kid) {
    return { error: "Missing saved line item or task." };
  }

  const parsed = parseTaskBodyFromForm(formData);
  if (!("data" in parsed)) {
    return parsed;
  }

  const stageCheck = validateExecutionTaskStage(
    parsed.data.stageId,
    "line_item_default_execution",
  );
  if (!stageCheck.ok) {
    return { error: stageCheck.message };
  }

  const ctx = await getRequestContextOrThrow();

  const outcome = await db.$transaction(async (tx) => {
    const existing = await tx.lineItemTemplateTask.findFirst({
      where: { id: kid, lineItemTemplateId: tid },
      include: {
        lineItemTemplate: { select: { organizationId: true, archivedAt: true } },
      },
    });
    if (
      !existing ||
      existing.lineItemTemplate.organizationId !== ctx.organizationId ||
      existing.lineItemTemplate.archivedAt != null
    ) {
      return { ok: false as const };
    }

    const oldStageId = existing.stageId;
    const newStageId = parsed.data.stageId;

    if (newStageId !== oldStageId) {
      const sortOrder = await nextSortOrderInStage(tx, tid, newStageId);
      await tx.lineItemTemplateTask.update({
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
      await renumberSortOrdersInStage(tx, tid, oldStageId);
    } else {
      await tx.lineItemTemplateTask.update({
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

    await touchLineItemTemplateUpdatedAt(tx, tid, ctx.organizationId);
    return { ok: true as const };
  });

  if (!outcome.ok) {
    return {
      error:
        "This task could not be updated. It may have been removed, or the saved line item is outside your organization.",
    };
  }

  redirect(lineItemTemplateDefaultExecutionPath(tid));
}

export async function deleteLineItemTemplateTaskAction(
  lineItemTemplateId: string,
  taskId: string,
  _prevState: LineItemTemplateExecutionFormState,
  formData: FormData,
): Promise<LineItemTemplateExecutionFormState> {
  void formData;
  const tid = lineItemTemplateId.trim();
  const kid = taskId.trim();
  if (!tid || !kid) {
    return { error: "Missing saved line item or task." };
  }

  const ctx = await getRequestContextOrThrow();

  const outcome = await db.$transaction(async (tx) => {
    const existing = await tx.lineItemTemplateTask.findFirst({
      where: { id: kid, lineItemTemplateId: tid },
      include: {
        lineItemTemplate: { select: { organizationId: true, archivedAt: true } },
      },
    });
    if (
      !existing ||
      existing.lineItemTemplate.organizationId !== ctx.organizationId ||
      existing.lineItemTemplate.archivedAt != null
    ) {
      return { ok: false as const };
    }

    const stageId = existing.stageId;
    await tx.lineItemTemplateTask.delete({ where: { id: kid } });
    await renumberSortOrdersInStage(tx, tid, stageId);
    await touchLineItemTemplateUpdatedAt(tx, tid, ctx.organizationId);
    return { ok: true as const };
  });

  if (!outcome.ok) {
    return {
      error:
        "This task could not be removed. It may have already been deleted, or the saved line item is outside your organization.",
    };
  }

  redirect(lineItemTemplateDefaultExecutionPath(tid));
}

export async function moveLineItemTemplateTaskAction(
  lineItemTemplateId: string,
  taskId: string,
  direction: "up" | "down",
  _prevState: LineItemTemplateExecutionFormState,
  formData: FormData,
): Promise<LineItemTemplateExecutionFormState> {
  void formData;
  const tid = lineItemTemplateId.trim();
  const kid = taskId.trim();
  if (!tid || !kid) {
    return { error: "Missing saved line item or task." };
  }

  const ctx = await getRequestContextOrThrow();

  const ok = await db.$transaction(async (tx) => {
    const existing = await tx.lineItemTemplateTask.findFirst({
      where: { id: kid, lineItemTemplateId: tid },
      include: {
        lineItemTemplate: { select: { organizationId: true, archivedAt: true } },
      },
    });
    if (
      !existing ||
      existing.lineItemTemplate.organizationId !== ctx.organizationId ||
      existing.lineItemTemplate.archivedAt != null
    ) {
      return false;
    }

    const stageId = existing.stageId;
    const peers = await tx.lineItemTemplateTask.findMany({
      where: { lineItemTemplateId: tid, stageId },
      orderBy: { sortOrder: "asc" },
    });
    const idx = peers.findIndex((p) => p.id === kid);
    if (idx < 0) {
      return false;
    }
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= peers.length) {
      return true;
    }

    const a = peers[idx];
    const b = peers[swapWith];
    const temp = 1_000_000 + Math.floor(Math.random() * 100_000);
    await tx.lineItemTemplateTask.update({
      where: { id: a.id },
      data: { sortOrder: temp },
    });
    await tx.lineItemTemplateTask.update({
      where: { id: b.id },
      data: { sortOrder: a.sortOrder },
    });
    await tx.lineItemTemplateTask.update({
      where: { id: a.id },
      data: { sortOrder: b.sortOrder },
    });

    await touchLineItemTemplateUpdatedAt(tx, tid, ctx.organizationId);
    return true;
  });

  if (!ok) {
    return {
      error:
        "Could not reorder this task. It may have been removed, or the saved line item is outside your organization.",
    };
  }

  redirect(lineItemTemplateDefaultExecutionPath(tid));
}

export async function generateLineItemTemplateAIProposalAction(
  lineItemTemplateId: string,
  userInstructions?: string,
): Promise<{
  error?: string;
  proposal?: AILibraryProposal;
  generation?: AILibraryProposalGenerationMeta;
}> {
  const tid = lineItemTemplateId.trim();
  if (!tid) {
    return { error: "Missing saved line item." };
  }

  const ctx = await getRequestContextOrThrow();

  try {
    const preset = await db.lineItemTemplate.findFirst({
      where: { id: tid, organizationId: ctx.organizationId, archivedAt: null },
      select: {
        description: true,
        tags: { select: { name: true } },
      },
    });

    if (!preset) {
      return { error: "Line item template not found." };
    }

    const stages = await db.stage.findMany({
      where: { organizationId: ctx.organizationId, archivedAt: null },
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    });

    // TODO: Fetch existing signals for vocabulary normalization
    const existingSignals: string[] = [];

    const generated = await AIService.generateLibraryExecutionPlan({
      organizationId: ctx.organizationId,
      templateId: tid,
      description: preset.description,
      tags: preset.tags.map(t => t.name),
      organizationName: ctx.organizationName,
      existingStages: stages,
      existingSignals,
      userInstructions,
    });

    return { proposal: generated.proposal, generation: generated.generation };
  } catch (e) {
    console.error("Failed to generate AI execution plan", e);
    return { error: getAiActionErrorMessage(e) };
  }
}

export async function assessLineItemTemplateExecutionContextAction(
  lineItemTemplateId: string,
  userInstructions?: string,
): Promise<{ error?: string; assessment?: ExecutionContextAssessment }> {
  const tid = lineItemTemplateId.trim();
  if (!tid) {
    return { error: "Missing saved line item." };
  }
  if (!isAiExecutionContextPreflightEnabled()) {
    return {
      assessment: { foundContext: [], missingContext: [], assumptions: [] },
    };
  }

  const ctx = await getRequestContextOrThrow();

  try {
    const preset = await db.lineItemTemplate.findFirst({
      where: { id: tid, organizationId: ctx.organizationId, archivedAt: null },
      select: {
        description: true,
        tags: { select: { name: true } },
      },
    });

    if (!preset) {
      return { error: "Line item template not found." };
    }

    const stages = await db.stage.findMany({
      where: { organizationId: ctx.organizationId, archivedAt: null },
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    });

    const assessment = await AIService.assessExecutionPlanningContext({
      organizationId: ctx.organizationId,
      templateId: tid,
      description: preset.description,
      tags: preset.tags.map((t) => t.name),
      organizationName: ctx.organizationName,
      existingStages: stages,
      existingSignals: [],
      userInstructions: buildTemplateExecutionPlanningContext(preset.description, userInstructions),
    });

    return { assessment };
  } catch (e) {
    console.error("Failed to assess AI execution context", e);
    return { error: getAiActionErrorMessage(e, "Failed to assess execution context.") };
  }
}

export async function applyLineItemTemplateAIProposalAction(
  lineItemTemplateId: string,
  proposal: AILibraryProposal,
  generation?: AILibraryProposalGenerationMeta,
): Promise<{ error?: string; success?: boolean }> {
  const tid = lineItemTemplateId.trim();
  if (!tid) {
    return { error: "Missing saved line item." };
  }

  const ctx = await getRequestContextOrThrow();

  try {
    const stages = await db.stage.findMany({
      where: { organizationId: ctx.organizationId, archivedAt: null },
      select: { id: true, name: true },
    });

    const applyValidation = validateLibraryDefaultExecutionProposalForApply(proposal, generation, stages);
    if (!applyValidation.ok) {
      const detail =
        applyValidation.unmappedTaskTitles.length > 0
          ? ` Unmapped: ${applyValidation.unmappedTaskTitles.join(", ")}.`
          : "";
      return { error: `${applyValidation.error}${detail}` };
    }

    await db.$transaction(async (tx) => {
      const preset = await tx.lineItemTemplate.findFirst({
        where: { id: tid, organizationId: ctx.organizationId, archivedAt: null },
        select: { id: true },
      });

      if (!preset) {
        throw new Error("Line item template not found.");
      }

      // Create tasks from proposal
      for (const pTask of proposal.tasks) {
        const sortOrder = await nextSortOrderInStage(tx, tid, pTask.stageId ?? null);

        await tx.lineItemTemplateTask.create({
          data: {
            lineItemTemplateId: tid,
            sourceType: pTask.sourceTaskTemplateId
              ? LineItemTemplateTaskSource.TASK_TEMPLATE
              : LineItemTemplateTaskSource.CUSTOM,
            sourceTaskTemplateId: pTask.sourceTaskTemplateId ?? null,
            title: pTask.title,
            category: pTask.category,
            instructions: pTask.instructions,
            stageId: pTask.stageId ?? null,
            providesSignals: pTask.providesSignals,
            requiresSignals: pTask.requiresSignals,
            hardSignal: pTask.hardSignal,
            assigneeRole: pTask.assigneeRole ?? null,
            requirementsJson: buildTaskCompletionRequirementsFromAiTask(pTask) as Prisma.InputJsonValue,
            partsRequiredJson: {
              resources: pTask.resources.map((r) => ({ id: crypto.randomUUID(), ...r })),
            } as Prisma.InputJsonValue,
            sortOrder,
          },
        });
      }

      await touchLineItemTemplateUpdatedAt(tx, tid, ctx.organizationId);
    });

    revalidatePath(lineItemTemplateDefaultExecutionPath(tid));
    return { success: true };
  } catch (e) {
    console.error("Failed to apply AI execution plan", e);
    return { error: "Failed to apply AI execution plan." };
  }
}
