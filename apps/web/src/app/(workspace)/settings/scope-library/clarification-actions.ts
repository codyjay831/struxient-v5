"use server";

import { StaffRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { AIService } from "@/lib/ai/ai-service";
import type { ClarificationQuestionSetProposal } from "@/lib/ai/clarification-question-set-proposal-schema";
import { hasBreakingClarificationChanges } from "@/lib/clarification/clarification-versioning";
import {
  appendBusinessProfileContext,
  selectBusinessProfileAiContext,
} from "@/lib/business-profile/business-profile-ai-context";
import { getBusinessProfileForAi } from "@/lib/business-profile/business-profile-service";

const INPUT_TYPES = [
  "single_choice",
  "multi_choice",
  "yes_no_unknown",
  "short_text",
  "number",
  "notes",
] as const;
const STATUSES = ["draft", "active", "archived", "merged"] as const;

const OptionSchema = z.object({
  key: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(300),
  aliases: z.array(z.string().trim().min(1).max(200)).default([]),
});

const QuestionSchema = z.object({
  key: z.string().trim().min(1).max(160),
  label: z.string().trim().min(1).max(300),
  inputType: z.enum(INPUT_TYPES),
  helpText: z.string().trim().max(400).nullable().optional(),
  allowOther: z.boolean().default(false),
  unit: z.string().trim().max(40).nullable().optional(),
  customerFacing: z.boolean().default(false),
  aliases: z.array(z.string().trim().min(1).max(200)).default([]),
  options: z.array(OptionSchema).default([]),
});

const SetPayloadSchema = z.object({
  key: z.string().trim().min(1).max(160),
  label: z.string().trim().min(1).max(300),
  status: z.enum(STATUSES),
  description: z.string().trim().max(400).nullable().optional(),
  aliases: z.array(z.string().trim().min(1).max(200)).default([]),
  keywords: z.array(z.string().trim().min(1).max(200)).default([]),
  mergedIntoKey: z.string().trim().max(160).nullable().optional(),
  tagIds: z.array(z.string().trim().min(1)).default([]),
  questions: z.array(QuestionSchema).default([]),
});

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/_{2,}/g, "_");
}

function canManageClarification(role: StaffRole): boolean {
  return role === StaffRole.OWNER || role === StaffRole.ADMIN;
}

function assertCanManage(role: StaffRole) {
  if (!canManageClarification(role)) {
    throw new Error("Only Owner/Admin can manage clarification library.");
  }
}

async function writeQuestions(
  tx: Pick<typeof db, "clarificationQuestion" | "clarificationOption">,
  setId: string,
  questions: z.infer<typeof QuestionSchema>[],
) {
  await tx.clarificationQuestion.deleteMany({ where: { questionSetId: setId } });
  for (const [questionIdx, question] of questions.entries()) {
    const created = await tx.clarificationQuestion.create({
      data: {
        questionSetId: setId,
        key: question.key,
        label: question.label,
        inputType: question.inputType,
        helpText: question.helpText ?? null,
        allowOther: question.allowOther,
        unit: question.unit ?? null,
        customerFacing: question.customerFacing,
        aliases: question.aliases,
        sortOrder: questionIdx,
      },
      select: { id: true },
    });
    for (const [optionIdx, option] of question.options.entries()) {
      await tx.clarificationOption.create({
        data: {
          questionId: created.id,
          key: option.key,
          label: option.label,
          aliases: option.aliases,
          sortOrder: optionIdx,
        },
      });
    }
  }
}

export async function createClarificationQuestionSetAction(input: {
  label: string;
  key?: string;
}): Promise<{ error?: string; setId?: string }> {
  const ctx = await getRequestContextOrThrow();
  try {
    assertCanManage(ctx.role);
    const label = input.label.trim();
    if (!label) return { error: "Set label is required." };
    const key = normalizeKey(input.key?.trim() || label.replace(/\s+/g, "."));
    if (!key) return { error: "Set key is required." };

    const existing = await db.clarificationQuestionSet.findFirst({
      where: { organizationId: ctx.organizationId, key },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const set = await db.clarificationQuestionSet.create({
      data: {
        organizationId: ctx.organizationId,
        key,
        version: (existing?.version ?? 0) + 1,
        label,
        status: "draft",
      },
      select: { id: true },
    });
    revalidatePath("/settings/scope-library/clarification");
    return { setId: set.id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to create question set." };
  }
}

export async function saveClarificationQuestionSetAction(input: {
  setId: string;
  payload: z.infer<typeof SetPayloadSchema>;
}): Promise<{ error?: string; setId?: string; versionBumped?: boolean }> {
  const ctx = await getRequestContextOrThrow();
  try {
    assertCanManage(ctx.role);
    const parsed = SetPayloadSchema.parse(input.payload);
    const setId = input.setId.trim();
    if (!setId) return { error: "Missing question set id." };

    const existing = await db.clarificationQuestionSet.findFirst({
      where: { id: setId, organizationId: ctx.organizationId },
      include: {
        questions: {
          include: { options: { select: { key: true } } },
          orderBy: { sortOrder: "asc" },
        },
      },
    });
    if (!existing) return { error: "Question set not found." };

    const wantsMerge = parsed.status === "merged" && parsed.mergedIntoKey;
    const mergedInto = wantsMerge
      ? await db.clarificationQuestionSet.findFirst({
          where: {
            organizationId: ctx.organizationId,
            key: parsed.mergedIntoKey!,
            status: "active",
            archivedAt: null,
          },
          orderBy: { version: "desc" },
          select: { id: true },
        })
      : null;
    if (wantsMerge && !mergedInto) {
      return { error: "Merged-into key must point to an active set." };
    }

    const breaking =
      existing.status === "active" &&
      hasBreakingClarificationChanges(
        existing.questions.map((q) => ({
          key: q.key,
          inputType: q.inputType,
          options: q.options,
        })),
        parsed.questions,
      );

    if (breaking) {
      const latest = await db.clarificationQuestionSet.findFirst({
        where: { organizationId: ctx.organizationId, key: parsed.key },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const created = await db.$transaction(async (tx) => {
        const next = await tx.clarificationQuestionSet.create({
          data: {
            organizationId: ctx.organizationId,
            key: parsed.key,
            version: (latest?.version ?? 0) + 1,
            label: parsed.label,
            status: parsed.status,
            description: parsed.description ?? null,
            aliases: parsed.aliases,
            keywords: parsed.keywords,
            mergedIntoId: mergedInto?.id ?? null,
            tags: { connect: parsed.tagIds.map((id) => ({ id })) },
          },
          select: { id: true },
        });
        await writeQuestions(tx, next.id, parsed.questions);
        return next;
      });
      revalidatePath("/settings/scope-library/clarification");
      return { setId: created.id, versionBumped: true };
    }

    await db.$transaction(async (tx) => {
      await tx.clarificationQuestionSet.update({
        where: { id: existing.id },
        data: {
          key: parsed.key,
          label: parsed.label,
          status: parsed.status,
          description: parsed.description ?? null,
          aliases: parsed.aliases,
          keywords: parsed.keywords,
          mergedIntoId: mergedInto?.id ?? null,
          tags: {
            set: [],
            connect: parsed.tagIds.map((id) => ({ id })),
          },
        },
      });
      await writeQuestions(tx, existing.id, parsed.questions);
    });
    revalidatePath("/settings/scope-library/clarification");
    return { setId: existing.id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to save question set." };
  }
}

export async function archiveClarificationQuestionSetAction(setId: string) {
  const ctx = await getRequestContextOrThrow();
  try {
    assertCanManage(ctx.role);
    await db.clarificationQuestionSet.updateMany({
      where: { id: setId, organizationId: ctx.organizationId },
      data: { status: "archived", archivedAt: new Date() },
    });
    revalidatePath("/settings/scope-library/clarification");
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to archive set." };
  }
}

export async function generateClarificationQuestionSetProposalAction(input: {
  lineText: string;
  missingContext?: string[];
}) {
  const ctx = await getRequestContextOrThrow();
  try {
    assertCanManage(ctx.role);
    const profile = await getBusinessProfileForAi(ctx.organizationId);
    const selectedProfileContext = selectBusinessProfileAiContext(
      "CLARIFICATION_QUESTION_GENERATION",
      profile,
    );
    const lineTextWithProfile = appendBusinessProfileContext(input.lineText, selectedProfileContext);
    const result = await AIService.generateClarificationQuestionSet({
      lineText: lineTextWithProfile ?? input.lineText,
      organizationName: ctx.organizationName,
      missingContext: input.missingContext ?? [],
    });
    return { proposal: result.proposal, generation: result.generation };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to generate set proposal." };
  }
}

export async function createQuestionSetFromProposalAction(input: {
  proposal: ClarificationQuestionSetProposal;
  tagIds?: string[];
}) {
  const ctx = await getRequestContextOrThrow();
  try {
    assertCanManage(ctx.role);
    const proposal = input.proposal;
    const created = await db.$transaction(async (tx) => {
      const existing = await tx.clarificationQuestionSet.findFirst({
        where: { organizationId: ctx.organizationId, key: proposal.key },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const set = await tx.clarificationQuestionSet.create({
        data: {
          organizationId: ctx.organizationId,
          key: proposal.key,
          version: (existing?.version ?? 0) + 1,
          label: proposal.label,
          status: "draft",
          description: proposal.description ?? null,
          aliases: proposal.aliases,
          keywords: proposal.keywords,
          tags: { connect: (input.tagIds ?? []).map((id) => ({ id })) },
        },
        select: { id: true },
      });
      await writeQuestions(
        tx,
        set.id,
        proposal.questions.map((question) => ({
          ...question,
          options: question.options ?? [],
        })),
      );
      return set;
    });
    revalidatePath("/settings/scope-library/clarification");
    return { setId: created.id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to create set from AI proposal." };
  }
}
