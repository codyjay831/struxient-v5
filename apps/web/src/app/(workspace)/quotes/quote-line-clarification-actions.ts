"use server";

import { revalidatePath } from "next/cache";
import { Prisma, QuoteStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCommercialRequestContextOrThrow } from "@/lib/auth-context";
import {
  buildAiMeteringContext,
  runMeteredAiFeature,
} from "@/lib/billing/run-metered-ai-feature";
import {
  getClarificationQuestionSetByKey,
  listActiveClarificationQuestionSetSummaries,
  selectClarificationQuestionSetsForLine,
} from "@/lib/clarification/clarification-repository";
import { normalizeForMatch } from "@/lib/clarification/clarification-matching";
import {
  draftHasBlockingErrors,
  validateClarificationSetDraft,
} from "@/lib/clarification/clarification-draft-validation";
import {
  renderClarificationAnswersToScopeText,
  validateAnswerValue,
} from "@/lib/clarification/clarification-answers";
import {
  LineClarificationAnswersSchema,
} from "@/lib/clarification/clarification-answer-schema";
import type { ClarificationQuestion } from "@/lib/clarification/clarification-types";
import type { LineClarificationAnswers } from "@/lib/clarification/clarification-types";
import {
  CLARIFICATION_CUSTOMER_HEADER,
  CLARIFICATION_INTERNAL_HEADER,
  mergeClarificationBlock,
} from "@/lib/clarification/clarification-scope-merge";
import { AIService } from "@/lib/ai/ai-service";
import { getAiActionErrorMessage } from "@/lib/ai/ai-provider-errors";
import {
  buildCommercialContextLineText,
  loadCommercialContextForQuote,
} from "@/lib/ai/commercial-context";
import type { ClarificationQuestionSetProposal } from "@/lib/ai/clarification-question-set-proposal-schema";
import { hasBreakingClarificationChanges } from "@/lib/clarification/clarification-versioning";
import {
  appendBusinessProfileContext,
  selectBusinessProfileAiContext,
} from "@/lib/business-profile/business-profile-ai-context";
import { getBusinessProfileForAi } from "@/lib/business-profile/business-profile-service";
import { listScopeDecisionContextStringsForLine } from "@/lib/quote-scope-decision-service";
import { QUOTE_PROPOSAL_FIELD_LIMITS, QUOTE_LINE_FIELD_LIMITS } from "./quote-field-limits";
import type {
  ApplyLineClarificationResult,
  GetClarificationLineModelResult,
  SearchClarificationQuestionSetsResult,
  SuggestLineClarificationResult,
} from "./quote-line-clarification-types";

const LINE_LOCKED_ERROR =
  "Scope clarification is only available on draft quotes without an activated job.";

const InputTypeSchema = z.enum([
  "single_choice",
  "multi_choice",
  "yes_no_unknown",
  "short_text",
  "number",
  "notes",
]);

const OptionPayloadSchema = z.object({
  key: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(300),
  aliases: z.array(z.string().trim().min(1).max(200)).default([]),
});

const QuestionPayloadSchema = z.object({
  key: z.string().trim().min(1).max(160),
  label: z.string().trim().min(1).max(300),
  inputType: InputTypeSchema,
  helpText: z.string().trim().max(400).nullable().optional(),
  allowOther: z.boolean().default(false),
  unit: z.string().trim().max(40).nullable().optional(),
  customerFacing: z.boolean().default(false),
  aliases: z.array(z.string().trim().min(1).max(200)).default([]),
  options: z.array(OptionPayloadSchema).default([]),
});

const CreateSetPayloadSchema = z.object({
  key: z.string().trim().min(1).max(160),
  label: z.string().trim().min(1).max(300),
  description: z.string().trim().max(400).nullable().optional(),
  aliases: z.array(z.string().trim().min(1).max(200)).default([]),
  keywords: z.array(z.string().trim().min(1).max(200)).default([]),
  questions: z.array(QuestionPayloadSchema).min(1),
  attachToTemplateTags: z.boolean().default(true),
  activateNow: z.boolean().default(true),
});

const UpdateSetQuestionsPayloadSchema = z.object({
  questions: z.array(QuestionPayloadSchema).min(1),
});

function revalidateQuoteCommercialSurfaces(quoteId: string) {
  const id = quoteId.trim();
  revalidatePath(`/quotes/${id}`);
  revalidatePath(`/quotes/${id}/execution-review`);
  revalidatePath("/leads");
  revalidatePath("/workstation");
}

/** Tag names → hyphenated keys so display vocabulary lines up with binding keys. */
function toTagKeys(tagNames: readonly string[]): string[] {
  return tagNames
    .map((name) => normalizeForMatch(name).replace(/\s+/g, "-"))
    .filter(Boolean);
}

async function loadDraftLine(quoteId: string, lineId: string, organizationId: string) {
  return db.quoteLineItem.findFirst({
    where: {
      id: lineId,
      quoteId,
      quote: { organizationId, status: QuoteStatus.DRAFT, job: { is: null } },
    },
    select: {
      id: true,
      description: true,
      internalNotes: true,
      customerIncludedNotes: true,
      sourceLineItemTemplate: {
        select: { id: true, tags: { select: { id: true, name: true, aliases: true } } },
      },
    },
  });
}

async function loadSavedAnswersForLineSet(
  lineId: string,
  questionSetKey: string,
  questionSetVersion: number,
): Promise<LineClarificationAnswers | null> {
  const savedRow = await db.quoteLineClarification.findFirst({
    where: {
      quoteLineItemId: lineId,
      questionSetKey,
      questionSetVersion,
    },
    select: { answersJson: true },
  });
  if (!savedRow) return null;
  const parsed = LineClarificationAnswersSchema.safeParse(savedRow.answersJson);
  return parsed.success ? parsed.data : null;
}

function normalizeSetKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/_{2,}/g, "_");
}

async function writeClarificationQuestions(
  tx: Pick<typeof db, "clarificationQuestion" | "clarificationOption">,
  questionSetId: string,
  questions: z.infer<typeof QuestionPayloadSchema>[],
) {
  for (const [questionIdx, question] of questions.entries()) {
    const createdQuestion = await tx.clarificationQuestion.create({
      data: {
        questionSetId,
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
          questionId: createdQuestion.id,
          key: option.key,
          label: option.label,
          aliases: option.aliases,
          sortOrder: optionIdx,
        },
      });
    }
  }
}

/**
 * Returns the clarification question set that best matches a draft quote line,
 * plus alternative sets the user can switch to. Read-only.
 */
export async function getClarificationLineModelAction(
  quoteId: string,
  lineId: string,
): Promise<GetClarificationLineModelResult> {
  const qid = quoteId.trim();
  const lid = lineId.trim();
  if (!qid || !lid) {
    return { error: "Missing quote or line id." };
  }

  const ctx = await getCommercialRequestContextOrThrow();

  try {
    const line = await loadDraftLine(qid, lid, ctx.organizationId);
    if (!line) {
      return { error: LINE_LOCKED_ERROR };
    }

    const tagNames = line.sourceLineItemTemplate?.tags.map((t) => t.name) ?? [];
    const tagAliases = line.sourceLineItemTemplate?.tags.flatMap((t) => t.aliases) ?? [];

    const matches = await selectClarificationQuestionSetsForLine(
      ctx.organizationId,
      {
        description: line.description,
        tagKeys: toTagKeys([...tagNames, ...tagAliases]),
        extraText: [...tagNames, line.internalNotes ?? ""].join(" "),
      },
      { minScore: 0.3 },
    );

    const top = matches[0] ?? null;
    const topSet = top
      ? await getClarificationQuestionSetByKey(ctx.organizationId, top.questionSetKey)
      : null;

    const matchedSet =
      topSet && topSet.status === "active"
        ? {
            key: topSet.key,
            version: topSet.version,
            label: topSet.label,
            status: topSet.status,
            description: topSet.description,
            questions: topSet.questions,
          }
        : null;

    const savedAnswers = matchedSet
      ? await loadSavedAnswersForLineSet(line.id, matchedSet.key, matchedSet.version)
      : null;

    return {
      model: {
        lineId: line.id,
        lineDescription: line.description,
        matchedSet,
        alternatives: matches
          .slice(top ? 1 : 0)
          .map((m) => ({ key: m.questionSetKey, label: m.label, confidence: m.confidence })),
        recommendedConfidence: top?.confidence ?? null,
        savedAnswers,
      },
    };
  } catch (e) {
    console.error("[quote-clarification] load failed", { quoteId: qid, lineId: lid, error: e });
    return { error: "Failed to load scope clarification questions." };
  }
}

/**
 * Returns the full question set for a key (used when the user switches sets).
 */
export async function getClarificationSetByKeyAction(
  quoteId: string,
  lineId: string,
  setKey: string,
): Promise<GetClarificationLineModelResult> {
  const qid = quoteId.trim();
  const lid = lineId.trim();
  const key = setKey.trim();
  if (!qid || !lid || !key) {
    return { error: "Missing quote, line, or question set key." };
  }
  const ctx = await getCommercialRequestContextOrThrow();
  const line = await loadDraftLine(qid, lid, ctx.organizationId);
  if (!line) {
    return { error: LINE_LOCKED_ERROR };
  }
  const set = await getClarificationQuestionSetByKey(ctx.organizationId, key);
  if (!set || set.status !== "active") {
    return { error: "That question set is not available." };
  }
  const savedAnswers = await loadSavedAnswersForLineSet(line.id, set.key, set.version);
  return {
    model: {
      lineId: line.id,
      lineDescription: line.description,
      matchedSet: {
        key: set.key,
        version: set.version,
        label: set.label,
        status: set.status,
        description: set.description,
        questions: set.questions,
      },
      alternatives: [],
      recommendedConfidence: null,
      savedAnswers,
    },
  };
}

export async function searchActiveClarificationQuestionSetsAction(
  quoteId: string,
  lineId: string,
  query?: string,
): Promise<SearchClarificationQuestionSetsResult> {
  const qid = quoteId.trim();
  const lid = lineId.trim();
  if (!qid || !lid) return { error: "Missing quote or line id." };
  const ctx = await getCommercialRequestContextOrThrow();
  try {
    const line = await loadDraftLine(qid, lid, ctx.organizationId);
    if (!line) return { error: LINE_LOCKED_ERROR };
    const sets = await listActiveClarificationQuestionSetSummaries(ctx.organizationId, {
      query,
      limit: 100,
    });
    return { sets };
  } catch (error) {
    console.error("[quote-clarification] set search failed", { quoteId: qid, lineId: lid, error });
    return { error: "Failed to load question sets." };
  }
}

/**
 * AI assist: suggests likely answers for a question set from the line text.
 * Review-then-apply — the panel preselects these; nothing persists here.
 */
export async function suggestLineClarificationAnswersAction(
  quoteId: string,
  lineId: string,
  setKey: string,
): Promise<SuggestLineClarificationResult> {
  const qid = quoteId.trim();
  const lid = lineId.trim();
  const key = setKey.trim();
  if (!qid || !lid || !key) {
    return { error: "Missing quote, line, or question set id." };
  }

  const ctx = await getCommercialRequestContextOrThrow();

  try {
    const line = await loadDraftLine(qid, lid, ctx.organizationId);
    if (!line) {
      return { error: LINE_LOCKED_ERROR };
    }

    const set = await getClarificationQuestionSetByKey(ctx.organizationId, key);
    if (!set || (set.status !== "active" && set.status !== "draft")) {
      return { error: "That question set is not available." };
    }

    const commercialContext = await loadCommercialContextForQuote({
      organizationId: ctx.organizationId,
      quoteId: qid,
    });
    if (!commercialContext) {
      return { error: LINE_LOCKED_ERROR };
    }
    const lineText = buildCommercialContextLineText(commercialContext, { lineId: lid });
    const unresolvedScopeDetails = await listScopeDecisionContextStringsForLine(db, {
      organizationId: ctx.organizationId,
      quoteId: qid,
      lineId: lid,
    });

    const metered = await runMeteredAiFeature({
      ctx: buildAiMeteringContext({
        organizationId: ctx.organizationId,
        feature: "clarification_answers",
        requestKind: "generate",
        promptChars: lineText.length,
      }),
      run: async () => {
        const result = await AIService.generateClarificationAnswerSuggestions({
          set: {
            key: set.key,
            version: set.version,
            label: set.label,
            questions: set.questions.map((q) => ({
              key: q.key,
              label: q.label,
              inputType: q.inputType,
              allowOther: q.allowOther,
              unit: q.unit,
              options: q.options?.map((o) => ({ key: o.key, label: o.label })),
            })),
          },
          lineText,
          organizationName: ctx.organizationName,
          unresolvedScopeDetails,
        });
        if (!result.metering) {
          throw new Error("AI metering metadata missing from clarification answers.");
        }
        return {
          result,
          metering: result.metering,
          responseChars: JSON.stringify(result.proposal).length,
        };
      },
    });
    if (!metered.ok) {
      return { error: metered.error };
    }
    const result = metered.data;

    return { proposal: result.proposal, generation: result.generation };
  } catch (e) {
    console.error("[quote-clarification] suggest failed", { quoteId: qid, lineId: lid, error: e });
    return { error: getAiActionErrorMessage(e, "Failed to suggest clarification answers.") };
  }
}

/**
 * Checks whether a set key already exists in the org library (for inline warnings).
 */
export async function checkClarificationSetKeyAction(key: string): Promise<{
  error?: string;
  existing?: { label: string; latestVersion: number };
}> {
  const normalized = normalizeSetKey(key);
  if (!normalized) return { error: "Set key is required." };

  const ctx = await getCommercialRequestContextOrThrow();
  try {
    const row = await db.clarificationQuestionSet.findFirst({
      where: { organizationId: ctx.organizationId, key: normalized },
      orderBy: { version: "desc" },
      select: { label: true, version: true },
    });
    if (!row) return {};
    return { existing: { label: row.label, latestVersion: row.version } };
  } catch (error) {
    console.error("[quote-clarification] key check failed", { key: normalized, error });
    return { error: "Failed to check set key." };
  }
}

/**
 * AI assist: drafts a new clarification question set from the current line.
 * The client must review/edit before create.
 */
export async function generateClarificationQuestionSetForLineAction(
  quoteId: string,
  lineId: string,
): Promise<{
  error?: string;
  proposal?: ClarificationQuestionSetProposal;
  generation?: { isSimulated: boolean; canApply: boolean; applyBlockedReason?: string };
}> {
  const qid = quoteId.trim();
  const lid = lineId.trim();
  if (!qid || !lid) return { error: "Missing quote or line id." };

  const ctx = await getCommercialRequestContextOrThrow();
  try {
    const line = await loadDraftLine(qid, lid, ctx.organizationId);
    if (!line) return { error: LINE_LOCKED_ERROR };

    const tagNames = line.sourceLineItemTemplate?.tags.map((tag) => tag.name) ?? [];
    const commercialContext = await loadCommercialContextForQuote({
      organizationId: ctx.organizationId,
      quoteId: qid,
    });
    if (!commercialContext) {
      return { error: LINE_LOCKED_ERROR };
    }
    const lineText = buildCommercialContextLineText(commercialContext, {
      lineId: lid,
      includeTemplateTags: tagNames,
    });
    const profile = await getBusinessProfileForAi(ctx.organizationId);
    const selectedProfileContext = selectBusinessProfileAiContext(
      "CLARIFICATION_QUESTION_GENERATION",
      profile,
    );
    const lineTextWithProfile = appendBusinessProfileContext(lineText, selectedProfileContext);
    const unresolvedScopeDetails = await listScopeDecisionContextStringsForLine(db, {
      organizationId: ctx.organizationId,
      quoteId: qid,
      lineId: lid,
    });

    const metered = await runMeteredAiFeature({
      ctx: buildAiMeteringContext({
        organizationId: ctx.organizationId,
        feature: "clarification_question_set",
        requestKind: "generate",
        promptChars: (lineTextWithProfile ?? lineText).length + unresolvedScopeDetails.join("").length,
      }),
      run: async () => {
        const result = await AIService.generateClarificationQuestionSet({
          lineText: lineTextWithProfile ?? lineText,
          organizationName: ctx.organizationName,
          missingContext: unresolvedScopeDetails,
        });
        if (!result.metering) {
          throw new Error("AI metering metadata missing from clarification question set.");
        }
        return {
          result,
          metering: result.metering,
          responseChars: JSON.stringify(result.proposal).length,
        };
      },
    });
    if (!metered.ok) {
      return { error: metered.error };
    }
    const result = metered.data;
    return { proposal: result.proposal, generation: result.generation };
  } catch (error) {
    console.error("[quote-clarification] generate set failed", {
      quoteId: qid,
      lineId: lid,
      error,
    });
    return {
      error: getAiActionErrorMessage(error, "Failed to generate clarification questions."),
    };
  }
}

/**
 * Creates an org-scoped question set from reviewed input and returns it for
 * immediate use on the current line.
 */
export async function createClarificationQuestionSetForLineAction(
  quoteId: string,
  lineId: string,
  payload: unknown,
): Promise<{
  error?: string;
  matchedSet?: {
    key: string;
    version: number;
    label: string;
    status: "draft" | "active" | "archived" | "merged";
    description?: string;
    questions: ClarificationQuestion[];
  };
}> {
  const qid = quoteId.trim();
  const lid = lineId.trim();
  if (!qid || !lid) return { error: "Missing quote or line id." };

  const ctx = await getCommercialRequestContextOrThrow();
  let parsed: z.infer<typeof CreateSetPayloadSchema>;
  try {
    parsed = CreateSetPayloadSchema.parse(payload);
  } catch {
    return { error: "Invalid question-set payload." };
  }

  try {
    const line = await loadDraftLine(qid, lid, ctx.organizationId);
    if (!line) return { error: LINE_LOCKED_ERROR };

    const setKey = normalizeSetKey(parsed.key || parsed.label.replace(/\s+/g, "."));
    if (!setKey) return { error: "Question set key is required." };

    const existing = await db.clarificationQuestionSet.findFirst({
      where: { organizationId: ctx.organizationId, key: setKey },
      orderBy: { version: "desc" },
      select: { label: true, version: true },
    });
    const draftIssues = validateClarificationSetDraft(
      {
        key: setKey,
        label: parsed.label,
        questions: parsed.questions.map((question) => ({
          key: question.key,
          label: question.label,
          inputType: question.inputType,
          options: question.options,
        })),
      },
      existing ? { existingSetKey: { label: existing.label, latestVersion: existing.version } } : undefined,
    );
    if (draftHasBlockingErrors(draftIssues)) {
      return { error: draftIssues.find((issue) => issue.severity === "error")?.message ?? "Invalid question set." };
    }

    const created = await db.$transaction(async (tx) => {
      const latest = await tx.clarificationQuestionSet.findFirst({
        where: { organizationId: ctx.organizationId, key: setKey },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const questionSet = await tx.clarificationQuestionSet.create({
        data: {
          organizationId: ctx.organizationId,
          key: setKey,
          version: (latest?.version ?? 0) + 1,
          label: parsed.label,
          status: parsed.activateNow ? "active" : "draft",
          description: parsed.description ?? null,
          aliases: parsed.aliases,
          keywords: parsed.keywords,
          tags: parsed.attachToTemplateTags
            ? {
                connect: (line.sourceLineItemTemplate?.tags ?? []).map((tag) => ({ id: tag.id })),
              }
            : undefined,
        },
        select: { id: true, key: true },
      });
      await writeClarificationQuestions(tx, questionSet.id, parsed.questions);
      return questionSet;
    });

    const fullSet = await getClarificationQuestionSetByKey(ctx.organizationId, created.key);
    if (!fullSet) return { error: "Question set created but could not be loaded." };

    revalidateQuoteCommercialSurfaces(qid);
    revalidatePath("/settings/scope-library/clarification");

    return {
      matchedSet: {
        key: fullSet.key,
        version: fullSet.version,
        label: fullSet.label,
        status: fullSet.status,
        description: fullSet.description,
        questions: fullSet.questions,
      },
    };
  } catch (error) {
    console.error("[quote-clarification] create set failed", {
      quoteId: qid,
      lineId: lid,
      error,
    });
    return { error: "Failed to create clarification questions for this line." };
  }
}

function toMatchedSetResponse(
  set: NonNullable<Awaited<ReturnType<typeof getClarificationQuestionSetByKey>>>,
) {
  return {
    key: set.key,
    version: set.version,
    label: set.label,
    status: set.status,
    description: set.description,
    questions: set.questions,
  };
}

/**
 * Updates an existing question set from the line clarify flow (add/edit questions).
 * Non-breaking edits update in place; structural changes create a new version and
 * migrate matching saved answers on this line to the new version.
 */
export async function updateClarificationQuestionSetForLineAction(
  quoteId: string,
  lineId: string,
  setKey: string,
  setVersion: number,
  payload: unknown,
): Promise<{
  error?: string;
  matchedSet?: ReturnType<typeof toMatchedSetResponse>;
  savedAnswers?: LineClarificationAnswers | null;
}> {
  const qid = quoteId.trim();
  const lid = lineId.trim();
  const key = setKey.trim();
  if (!qid || !lid || !key) return { error: "Missing quote, line, or question set id." };

  let parsed: z.infer<typeof UpdateSetQuestionsPayloadSchema>;
  try {
    parsed = UpdateSetQuestionsPayloadSchema.parse(payload);
  } catch {
    return { error: "Invalid question update payload." };
  }

  const ctx = await getCommercialRequestContextOrThrow();

  try {
    const line = await loadDraftLine(qid, lid, ctx.organizationId);
    if (!line) return { error: LINE_LOCKED_ERROR };

    const existing = await db.clarificationQuestionSet.findFirst({
      where: {
        organizationId: ctx.organizationId,
        key,
        version: setVersion,
        archivedAt: null,
      },
      include: {
        tags: { select: { id: true } },
        questions: {
          orderBy: { sortOrder: "asc" },
          include: { options: { select: { key: true } } },
        },
      },
    });
    if (!existing) return { error: "Question set not found." };

    const draftIssues = validateClarificationSetDraft({
      key: existing.key,
      label: existing.label,
      questions: parsed.questions.map((question) => ({
        key: question.key,
        label: question.label,
        inputType: question.inputType,
        options: question.options,
      })),
    });
    if (draftHasBlockingErrors(draftIssues)) {
      return {
        error:
          draftIssues.find((issue) => issue.severity === "error")?.message ??
          "Invalid question set.",
      };
    }

    const breaking = hasBreakingClarificationChanges(
      existing.questions.map((q) => ({
        key: q.key,
        inputType: q.inputType,
        options: q.options,
      })),
      parsed.questions,
    );

    const targetKey = existing.key;
    let targetVersion = existing.version;

    if (breaking) {
      const latest = await db.clarificationQuestionSet.findFirst({
        where: { organizationId: ctx.organizationId, key: existing.key },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      targetVersion = (latest?.version ?? existing.version) + 1;

      await db.$transaction(async (tx) => {
        const next = await tx.clarificationQuestionSet.create({
          data: {
            organizationId: ctx.organizationId,
            key: existing.key,
            version: targetVersion,
            label: existing.label,
            status: existing.status,
            description: existing.description,
            aliases: existing.aliases,
            keywords: existing.keywords,
            tags: { connect: existing.tags.map((tag) => ({ id: tag.id })) },
          },
          select: { id: true },
        });
        await writeClarificationQuestions(tx, next.id, parsed.questions);
      });
    } else {
      await db.$transaction(async (tx) => {
        await writeClarificationQuestions(tx, existing.id, parsed.questions);
      });
    }

    const fullSet = await db.clarificationQuestionSet.findFirst({
      where: {
        organizationId: ctx.organizationId,
        key: targetKey,
        version: targetVersion,
        archivedAt: null,
      },
      include: {
        mergedInto: { select: { key: true } },
        tags: { select: { name: true, aliases: true } },
        questions: {
          orderBy: { sortOrder: "asc" },
          include: { options: { orderBy: { sortOrder: "asc" } } },
        },
      },
    });
    if (!fullSet) return { error: "Updated question set could not be loaded." };

    const mapped = await getClarificationQuestionSetByKey(ctx.organizationId, fullSet.key);
    if (!mapped) return { error: "Updated question set could not be loaded." };

    let savedAnswers: LineClarificationAnswers | null = null;
    if (breaking && targetVersion !== setVersion) {
      const priorRow = await db.quoteLineClarification.findFirst({
        where: {
          quoteLineItemId: lid,
          questionSetKey: key,
          questionSetVersion: setVersion,
        },
        select: { answersJson: true },
      });
      const priorParsed = priorRow
        ? LineClarificationAnswersSchema.safeParse(priorRow.answersJson)
        : null;
      const validKeys = new Set(parsed.questions.map((q) => q.key));
      if (priorParsed?.success) {
        const migrated: LineClarificationAnswers = {
          questionSetKey: targetKey,
          questionSetVersion: targetVersion,
          answers: priorParsed.data.answers.filter((answer) =>
            validKeys.has(answer.questionKey),
          ),
        };
        if (migrated.answers.length > 0) {
          await db.quoteLineClarification.upsert({
            where: {
              quoteLineItemId_questionSetKey_questionSetVersion: {
                quoteLineItemId: lid,
                questionSetKey: targetKey,
                questionSetVersion: targetVersion,
              },
            },
            create: {
              quoteLineItemId: lid,
              clarificationSetId: fullSet.id,
              questionSetKey: targetKey,
              questionSetVersion: targetVersion,
              answersJson: migrated as unknown as Prisma.InputJsonValue,
            },
            update: {
              clarificationSetId: fullSet.id,
              answersJson: migrated as unknown as Prisma.InputJsonValue,
            },
          });
          savedAnswers = migrated;
        }
      }
    } else {
      const savedRow = await db.quoteLineClarification.findFirst({
        where: {
          quoteLineItemId: lid,
          questionSetKey: targetKey,
          questionSetVersion: targetVersion,
        },
        select: { answersJson: true },
      });
      if (savedRow) {
        const parsedSaved = LineClarificationAnswersSchema.safeParse(savedRow.answersJson);
        if (parsedSaved.success) savedAnswers = parsedSaved.data;
      }
    }

    revalidateQuoteCommercialSurfaces(qid);
    revalidatePath("/settings/scope-library/clarification");

    return {
      matchedSet: toMatchedSetResponse(mapped),
      savedAnswers,
    };
  } catch (error) {
    console.error("[quote-clarification] update set failed", {
      quoteId: qid,
      lineId: lid,
      setKey: key,
      error,
    });
    return { error: "Failed to update clarification questions." };
  }
}

/**
 * Applies confirmed clarification answers to a draft quote line's scope text.
 *
 * Interim no-schema persistence: customer-facing answers merge into
 * `customerIncludedNotes`, all provided answers (including unknowns surfaced as
 * "Needs field verify") merge into `internalNotes`. Idempotent per header block.
 *
 * Does NOT touch execution tasks, signals, pricing, or activation.
 */
export async function applyLineClarificationAnswersAction(
  quoteId: string,
  lineId: string,
  answersPayload: unknown,
): Promise<ApplyLineClarificationResult> {
  const qid = quoteId.trim();
  const lid = lineId.trim();
  if (!qid || !lid) {
    return { error: "Missing quote or line id." };
  }

  const ctx = await getCommercialRequestContextOrThrow();

  let parsed;
  try {
    parsed = LineClarificationAnswersSchema.parse(answersPayload);
  } catch {
    return { error: "Invalid clarification answers." };
  }

  // Validate answer values against the (current) question definitions when the
  // set is still resolvable. Snapshots keep rendering safe regardless.
  const set = await getClarificationQuestionSetByKey(ctx.organizationId, parsed.questionSetKey);
  if (set) {
    const questionsByKey = new Map(set.questions.map((q) => [q.key, q]));
    for (const answer of parsed.answers) {
      const question = questionsByKey.get(answer.questionKey);
      if (!question) continue;
      const result = validateAnswerValue(question, answer.value);
      if (!result.ok) {
        return { error: result.error };
      }
    }
  }

  const { customerLines, internalLines } = renderClarificationAnswersToScopeText(
    parsed.answers,
  );

  try {
    const outcome = await db.$transaction(async (tx) => {
      const line = await tx.quoteLineItem.findFirst({
        where: {
          id: lid,
          quoteId: qid,
          quote: { organizationId: ctx.organizationId, status: QuoteStatus.DRAFT, job: { is: null } },
        },
        select: { id: true, internalNotes: true, customerIncludedNotes: true },
      });
      if (!line) {
        return { ok: false as const };
      }

      const nextInternal = mergeClarificationBlock(
        line.internalNotes,
        CLARIFICATION_INTERNAL_HEADER,
        internalLines,
      );
      const nextCustomer = mergeClarificationBlock(
        line.customerIncludedNotes,
        CLARIFICATION_CUSTOMER_HEADER,
        customerLines,
      );

      // Respect existing field limits; truncation would corrupt data silently.
      if (nextInternal && nextInternal.length > QUOTE_LINE_FIELD_LIMITS.internalNotes) {
        return { ok: false as const, tooLong: "internal" as const };
      }
      if (
        nextCustomer &&
        nextCustomer.length > QUOTE_PROPOSAL_FIELD_LIMITS.customerIncludedNotes
      ) {
        return { ok: false as const, tooLong: "customer" as const };
      }

      await tx.quoteLineItem.update({
        where: { id: lid },
        data: { internalNotes: nextInternal, customerIncludedNotes: nextCustomer },
      });

      const clarificationSet = await tx.clarificationQuestionSet.findFirst({
        where: {
          organizationId: ctx.organizationId,
          key: parsed.questionSetKey,
          version: parsed.questionSetVersion,
        },
        select: { id: true },
      });

      await tx.quoteLineClarification.upsert({
        where: {
          quoteLineItemId_questionSetKey_questionSetVersion: {
            quoteLineItemId: lid,
            questionSetKey: parsed.questionSetKey,
            questionSetVersion: parsed.questionSetVersion,
          },
        },
        create: {
          quoteLineItemId: lid,
          clarificationSetId: clarificationSet?.id ?? null,
          questionSetKey: parsed.questionSetKey,
          questionSetVersion: parsed.questionSetVersion,
          answersJson: parsed as unknown as Prisma.InputJsonValue,
        },
        update: {
          clarificationSetId: clarificationSet?.id ?? null,
          answersJson: parsed as unknown as Prisma.InputJsonValue,
        },
      });

      return { ok: true as const };
    });

    if (!outcome.ok) {
      if (outcome.tooLong === "internal") {
        return { error: "Line internal notes would exceed the maximum length." };
      }
      if (outcome.tooLong === "customer") {
        return { error: "Customer included notes would exceed the maximum length." };
      }
      return { error: LINE_LOCKED_ERROR };
    }

    revalidateQuoteCommercialSurfaces(qid);
    return {
      success: true,
      customerLineCount: customerLines.length,
      internalLineCount: internalLines.length,
    };
  } catch (e) {
    console.error("[quote-clarification] apply failed", { quoteId: qid, lineId: lid, error: e });
    return { error: "Failed to apply scope clarification." };
  }
}
