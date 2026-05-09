"use server";

import { LineItemTemplateTaskSource, Prisma, type ExecutionStageKey } from "@prisma/client";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { parseExecutionStageKey } from "@/lib/execution-stage-catalog";
import { parseTaskTemplateCategory } from "@/lib/task-template-category";
import { TASK_TEMPLATE_FIELD_LIMITS } from "@/app/(workspace)/scope-library/task-template-field-limits";
import { lineItemTemplateDefaultExecutionPath } from "@/lib/line-item-template-execution-path";

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

async function touchLineItemTemplateUpdatedAt(
  tx: Prisma.TransactionClient,
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
  tx: Prisma.TransactionClient,
  lineItemTemplateId: string,
  stageKey: ExecutionStageKey,
) {
  const agg = await tx.lineItemTemplateTask.aggregate({
    where: { lineItemTemplateId, stageKey },
    _max: { sortOrder: true },
  });
  return (agg._max.sortOrder ?? -1) + 1;
}

async function renumberSortOrdersInStage(
  tx: Prisma.TransactionClient,
  lineItemTemplateId: string,
  stageKey: ExecutionStageKey,
) {
  const rows = await tx.lineItemTemplateTask.findMany({
    where: { lineItemTemplateId, stageKey },
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
        stageKey: NonNullable<ReturnType<typeof parseExecutionStageKey>>;
        category: NonNullable<ReturnType<typeof parseTaskTemplateCategory>>;
        instructions: string | null;
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
  const stageKey = parseExecutionStageKey(formData.get("stageKey"));
  if (!stageKey) {
    return { error: "Choose a valid execution stage." };
  }
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
  return {
    data: {
      title,
      stageKey,
      category,
      instructions: instructionsRaw,
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

    const sortOrder = await nextSortOrderInStage(tx, tid, reusable.stageKey);

    await tx.lineItemTemplateTask.create({
      data: {
        lineItemTemplateId: tid,
        sourceType: LineItemTemplateTaskSource.TASK_TEMPLATE,
        sourceTaskTemplateId: reusable.id,
        title: reusable.title,
        stageKey: reusable.stageKey,
        category: reusable.category,
        instructions: reusable.instructions,
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

  const ctx = await getRequestContextOrThrow();

  const ok = await db.$transaction(async (tx) => {
    const preset = await tx.lineItemTemplate.findFirst({
      where: { id: tid, organizationId: ctx.organizationId, archivedAt: null },
      select: { id: true },
    });
    if (!preset) {
      return false;
    }

    const sortOrder = await nextSortOrderInStage(tx, tid, parsed.data.stageKey);

    await tx.lineItemTemplateTask.create({
      data: {
        lineItemTemplateId: tid,
        sourceType: LineItemTemplateTaskSource.CUSTOM,
        sourceTaskTemplateId: null,
        title: parsed.data.title,
        stageKey: parsed.data.stageKey,
        category: parsed.data.category,
        instructions: parsed.data.instructions,
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

    const oldStage = existing.stageKey;
    const newStage = parsed.data.stageKey;

    if (newStage !== oldStage) {
      const sortOrder = await nextSortOrderInStage(tx, tid, newStage);
      await tx.lineItemTemplateTask.update({
        where: { id: kid },
        data: {
          title: parsed.data.title,
          stageKey: newStage,
          category: parsed.data.category,
          instructions: parsed.data.instructions,
          sortOrder,
        },
      });
      await renumberSortOrdersInStage(tx, tid, oldStage);
    } else {
      await tx.lineItemTemplateTask.update({
        where: { id: kid },
        data: {
          title: parsed.data.title,
          category: parsed.data.category,
          instructions: parsed.data.instructions,
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

    const stageKey = existing.stageKey;
    await tx.lineItemTemplateTask.delete({ where: { id: kid } });
    await renumberSortOrdersInStage(tx, tid, stageKey);
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

    const stageKey = existing.stageKey;
    const peers = await tx.lineItemTemplateTask.findMany({
      where: { lineItemTemplateId: tid, stageKey },
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
