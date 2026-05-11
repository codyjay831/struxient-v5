"use server";

import {
  LineItemTemplateTaskSource,
  Prisma,
  QuoteLineExecutionMergeMode,
  QuoteLineExecutionReviewStatus,
  type ExecutionStageKey,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { QUOTE_STATUSES_EXECUTION_EDITABLE } from "@/lib/quote-status-workflow";
import { parseExecutionStageKey } from "@/lib/execution-stage-catalog";
import { parseTaskTemplateCategory } from "@/lib/task-template-category";
import { TASK_TEMPLATE_FIELD_LIMITS } from "@/app/(workspace)/scope-library/task-template-field-limits";

export type QuoteLineExecutionFormState = {
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
): QuoteLineExecutionFormState | null {
  if (value.length > max) {
    return { error: `${label} is too long (max ${max} characters).` };
  }
  return null;
}

async function touchQuoteUpdatedAt(tx: Prisma.TransactionClient, quoteId: string, organizationId: string) {
  await tx.$executeRaw`
    UPDATE "Quote"
    SET "updatedAt" = NOW()
    WHERE "id" = ${quoteId} AND "organizationId" = ${organizationId}
  `;
}

async function nextSortOrderInStage(
  tx: Prisma.TransactionClient,
  quoteLineItemId: string,
  stageKey: ExecutionStageKey,
) {
  const agg = await tx.quoteLineExecutionTask.aggregate({
    where: { quoteLineItemId, stageKey },
    _max: { sortOrder: true },
  });
  return (agg._max.sortOrder ?? -1) + 1;
}

async function renumberSortOrdersInStage(
  tx: Prisma.TransactionClient,
  quoteLineItemId: string,
  stageKey: ExecutionStageKey,
) {
  const rows = await tx.quoteLineExecutionTask.findMany({
    where: { quoteLineItemId, stageKey },
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

async function assertDraftQuoteLine(
  tx: Prisma.TransactionClient,
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

async function clearNoExecutionNeededWhenTasksAdded(
  tx: Prisma.TransactionClient,
  lineItemId: string,
) {
  await tx.quoteLineItem.updateMany({
    where: {
      id: lineItemId,
      executionReviewStatus: QuoteLineExecutionReviewStatus.NO_EXECUTION_NEEDED,
    },
    data: { executionReviewStatus: QuoteLineExecutionReviewStatus.UNREVIEWED },
  });
}

/**
 * Allowlisted internal surfaces a quote-line execution edit may have been launched from.
 * Parsed strictly from form data — no arbitrary URL is ever passed to {@link revalidatePath}.
 */
export type QuoteLineExecutionRevalidateScope = "quote" | "execution-review";

function parseRevalidateScope(
  value: FormDataEntryValue | null,
): QuoteLineExecutionRevalidateScope {
  if (typeof value === "string" && value.trim() === "execution-review") {
    return "execution-review";
  }
  return "quote";
}

/**
 * Always revalidate the quote-detail page (canonical home of draft execution) and
 * additionally revalidate the execution-review page when the edit was launched from there.
 * Both paths are constructed from the validated quote id — never from raw input.
 */
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

    const sortOrder = await nextSortOrderInStage(tx, lid, reusable.stageKey);

    await tx.quoteLineExecutionTask.create({
      data: {
        quoteLineItemId: lid,
        sourceLineItemTemplateTaskId: null,
        sourceTaskTemplateId: reusable.id,
        sourceType: LineItemTemplateTaskSource.TASK_TEMPLATE,
        title: reusable.title,
        stageKey: reusable.stageKey,
        category: reusable.category,
        instructions: reusable.instructions,
        sortOrder,
      },
    });

    await clearNoExecutionNeededWhenTasksAdded(tx, lid);
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

  const ctx = await getRequestContextOrThrow();

  const ok = await db.$transaction(async (tx) => {
    const line = await assertDraftQuoteLine(tx, qid, lid, ctx.organizationId);
    if (!line) {
      return false;
    }

    const sortOrder = await nextSortOrderInStage(tx, lid, parsed.data.stageKey);

    await tx.quoteLineExecutionTask.create({
      data: {
        quoteLineItemId: lid,
        sourceLineItemTemplateTaskId: null,
        sourceTaskTemplateId: null,
        sourceType: LineItemTemplateTaskSource.CUSTOM,
        title: parsed.data.title,
        stageKey: parsed.data.stageKey,
        category: parsed.data.category,
        instructions: parsed.data.instructions,
        sortOrder,
      },
    });

    await clearNoExecutionNeededWhenTasksAdded(tx, lid);
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

    const oldStage = existing.stageKey;
    const newStage = parsed.data.stageKey;

    if (newStage !== oldStage) {
      const sortOrder = await nextSortOrderInStage(tx, lid, newStage);
      await tx.quoteLineExecutionTask.update({
        where: { id: kid },
        data: {
          title: parsed.data.title,
          stageKey: newStage,
          category: parsed.data.category,
          instructions: parsed.data.instructions,
          sortOrder,
        },
      });
      await renumberSortOrdersInStage(tx, lid, oldStage);
    } else {
      await tx.quoteLineExecutionTask.update({
        where: { id: kid },
        data: {
          title: parsed.data.title,
          category: parsed.data.category,
          instructions: parsed.data.instructions,
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

export async function deleteQuoteLineExecutionTaskAction(
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

    const stageKey = existing.stageKey;
    await tx.quoteLineExecutionTask.delete({ where: { id: kid } });
    await renumberSortOrdersInStage(tx, lid, stageKey);
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
  const qid = quoteId.trim();
  const lid = lineItemId.trim();
  const kid = taskId.trim();
  if (!qid || !lid || !kid) {
    return { error: "Missing quote, line item, or task." };
  }

  const ctx = await getRequestContextOrThrow();

  const ok = await db.$transaction(async (tx) => {
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
      return false;
    }

    const quoteHasJob = await tx.job.findFirst({
      where: { quoteId: qid, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (quoteHasJob) {
      return false;
    }

    const stageKey = existing.stageKey;
    const peers = await tx.quoteLineExecutionTask.findMany({
      where: { quoteLineItemId: lid, stageKey },
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
    return true;
  });

  if (!ok) {
    return { error: QUOTE_LINE_EXECUTION_LOCKED_ERROR };
  }

  revalidateQuoteLineExecutionSurfaces(qid, parseRevalidateScope(formData.get("revalidateScope")));
  return {};
}

export async function updateQuoteLineExecutionSettingsAction(
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

  const mergeRaw = trimRequired(formData.get("executionMergeMode"));
  if (
    mergeRaw !== QuoteLineExecutionMergeMode.MERGE_INTO_JOB_STAGES &&
    mergeRaw !== QuoteLineExecutionMergeMode.KEEP_SEPARATE_BLOCK
  ) {
    return { error: "Choose how this scope should land in the job plan." };
  }
  const executionMergeMode = mergeRaw as QuoteLineExecutionMergeMode;

  const markNoExecution = formData.get("noExecutionNeeded") === "on";
  const nextReviewStatus = markNoExecution
    ? QuoteLineExecutionReviewStatus.NO_EXECUTION_NEEDED
    : QuoteLineExecutionReviewStatus.UNREVIEWED;

  const ctx = await getRequestContextOrThrow();

  const outcome = await db.$transaction(async (tx) => {
    const line = await tx.quoteLineItem.findFirst({
      where: {
        id: lid,
        quoteId: qid,
        quote: {
          organizationId: ctx.organizationId,
          status: { in: [...QUOTE_STATUSES_EXECUTION_EDITABLE] },
          job: { is: null },
        },
      },
      select: { id: true },
    });
    if (!line) {
      return { ok: false as const, code: "LINE" as const };
    }

    if (markNoExecution) {
      const taskCount = await tx.quoteLineExecutionTask.count({
        where: { quoteLineItemId: lid },
      });
      if (taskCount > 0) {
        return { ok: false as const, code: "TASKS" as const };
      }
    }

    await tx.quoteLineItem.update({
      where: { id: lid },
      data: {
        executionMergeMode,
        executionReviewStatus: nextReviewStatus,
      },
    });

    await touchQuoteUpdatedAt(tx, qid, ctx.organizationId);
    return { ok: true as const };
  });

  if (!outcome.ok) {
    if (outcome.code === "TASKS") {
      return {
        error:
          "Remove draft tasks from this line before marking it commercial-only, or leave tasks and keep execution planning on.",
      };
    }
    return { error: QUOTE_LINE_EXECUTION_LOCKED_ERROR };
  }

  revalidateQuoteLineExecutionSurfaces(qid, parseRevalidateScope(formData.get("revalidateScope")));
  return {};
}

export async function moveQuoteLineWorkOrderAction(
  quoteId: string,
  lineItemId: string,
  direction: "earlier" | "later",
  _prevState: QuoteLineExecutionFormState,
  formData: FormData,
): Promise<QuoteLineExecutionFormState> {
  void _prevState;
  const qid = quoteId.trim();
  const lid = lineItemId.trim();
  if (!qid || !lid) {
    return { error: "Missing quote or line item." };
  }

  const ctx = await getRequestContextOrThrow();

  const ok = await db.$transaction(async (tx) => {
    const line = await tx.quoteLineItem.findFirst({
      where: {
        id: lid,
        quoteId: qid,
        quote: {
          organizationId: ctx.organizationId,
          status: { in: [...QUOTE_STATUSES_EXECUTION_EDITABLE] },
          job: { is: null },
        },
      },
      select: { id: true },
    });
    if (!line) {
      return false;
    }

    const ordered = await tx.quoteLineItem.findMany({
      where: { quoteId: qid },
      orderBy: [{ executionOrder: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    const idx = ordered.findIndex((r) => r.id === lid);
    if (idx < 0) {
      return false;
    }
    const swapIdx = direction === "earlier" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= ordered.length) {
      return true;
    }

    const ids = ordered.map((r) => r.id);
    const tmp = ids[idx]!;
    ids[idx] = ids[swapIdx]!;
    ids[swapIdx] = tmp;
    for (let i = 0; i < ids.length; i++) {
      await tx.quoteLineItem.update({
        where: { id: ids[i] },
        data: { executionOrder: i },
      });
    }

    await touchQuoteUpdatedAt(tx, qid, ctx.organizationId);
    return true;
  });

  if (!ok) {
    return { error: QUOTE_LINE_EXECUTION_LOCKED_ERROR };
  }

  revalidateQuoteLineExecutionSurfaces(qid, parseRevalidateScope(formData.get("revalidateScope")));
  return {};
}
