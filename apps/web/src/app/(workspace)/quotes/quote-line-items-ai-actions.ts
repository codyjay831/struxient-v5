"use server";

import { revalidatePath } from "next/cache";
import { QuoteStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getCommercialRequestContextOrThrow } from "@/lib/auth-context";
import { preflightAiUsage, runOrganizationAiAction } from "@/lib/billing/ai-action-guard";
import { AIService } from "@/lib/ai/ai-service";
import { buildQuoteScopeCaptureContext } from "@/lib/ai/quote-scope-capture-context";
import {
  recommendLineItemTemplates,
  type LineItemTemplateMatchCandidate,
} from "@/lib/ai/recommend-line-item-templates";
import {
  ApplyQuoteScopeSuggestionsInputSchema,
  QuoteScopeSuggestionsProposalSchema,
} from "@/lib/ai/quote-line-items-proposal-schema";
import { validateQuoteScopeSuggestionsForApply } from "@/lib/ai/quote-line-items-ai-plan";
import { getAiActionErrorMessage } from "@/lib/ai/ai-provider-errors";
import {
  performApplyQuoteScopeSuggestionsInTx,
  QuoteScopeApplyTxError,
} from "@/lib/quote-scope-suggestions-apply-tx";
import { readRequest } from "@/lib/lead/lead-projection";
import {
  appendBusinessProfileContext,
  selectBusinessProfileAiContext,
} from "@/lib/business-profile/business-profile-ai-context";
import { getBusinessProfileForAi } from "@/lib/business-profile/business-profile-service";
import type {
  QuoteScopeSuggestionsApplyOptions,
  QuoteScopeSuggestionsApplyResult,
  QuoteScopeSuggestionsGenerateOptions,
  QuoteScopeSuggestionsGenerateResult,
} from "./quote-line-items-ai-types";

const QUOTE_SCOPE_LOCKED_ERROR =
  "Scope suggestions can only be generated on draft quotes without an activated job.";

function revalidateQuoteCommercialSurfaces(quoteId: string) {
  const id = quoteId.trim();
  revalidatePath(`/quotes/${id}`);
  revalidatePath(`/quotes/${id}/execution-review`);
  revalidatePath("/leads");
  revalidatePath("/workstation");
  revalidatePath("/workstation/tasks");
  revalidatePath("/workstation/jobs");
}

export async function generateQuoteScopeSuggestionsAction(
  quoteId: string,
  options?: QuoteScopeSuggestionsGenerateOptions,
): Promise<QuoteScopeSuggestionsGenerateResult> {
  const qid = quoteId.trim();
  if (!qid) {
    return { error: "Missing quote id." };
  }

  const ctx = await getCommercialRequestContextOrThrow();
  const startedAt = Date.now();

  try {
    const quote = await db.quote.findFirst({
      where: {
        id: qid,
        organizationId: ctx.organizationId,
        status: QuoteStatus.DRAFT,
        job: { is: null },
      },
      select: {
        id: true,
        internalNotes: true,
        lineItems: { select: { description: true } },
        lead: {
          select: {
            notes: true,
            request: true,
          },
        },
      },
    });

    if (!quote) {
      return { error: QUOTE_SCOPE_LOCKED_ERROR };
    }

    const leadRequest = quote.lead ? readRequest(quote.lead.request) : null;
    const leadScopeSummary = leadRequest?.scope ?? null;

    const contextText = buildQuoteScopeCaptureContext({
      captureText: options?.captureText,
      additionalInstructions: options?.additionalInstructions,
      quoteInternalNotes: quote.internalNotes,
      leadNotes: quote.lead?.notes ?? null,
      leadScopeSummary,
      sources: options?.sources,
      priorMissingInfo: options?.priorMissingInfo,
    });

    if (!contextText) {
      return {
        error:
          "Add a work description or include at least one context source before generating scope suggestions.",
      };
    }

    const templateRows = await db.lineItemTemplate.findMany({
      where: { organizationId: ctx.organizationId, archivedAt: null },
      select: {
        id: true,
        description: true,
        updatedAt: true,
        tags: { select: { name: true, aliases: true } },
      },
    });

    const candidates: LineItemTemplateMatchCandidate[] = templateRows.map((row) => ({
      id: row.id,
      description: row.description,
      tagNames: row.tags.map((tag) => tag.name),
      tagAliases: row.tags.flatMap((tag) => tag.aliases),
      updatedAt: row.updatedAt,
    }));

    const recommendedMatches = recommendLineItemTemplates(contextText, candidates);

    const profile = await getBusinessProfileForAi(ctx.organizationId);
    const selectedProfileContext = selectBusinessProfileAiContext("QUOTE_SCOPE_SUGGESTIONS", profile);
    const aiContextText = appendBusinessProfileContext(contextText, selectedProfileContext);

    const modelName = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
    const metered = await runOrganizationAiAction({
      ctx: {
        organizationId: ctx.organizationId,
        feature: "quote_scope_suggestions",
        provider: "gemini",
        model: modelName,
        requestKind: "generate",
        promptChars: (aiContextText ?? contextText).length,
      },
      execute: async () => {
        const generated = await AIService.generateScopeSuggestions({
          quoteId: qid,
          contextText: aiContextText ?? contextText,
          organizationName: ctx.organizationName,
          recommendedTemplates: recommendedMatches,
          existingLineDescriptions: quote.lineItems.map((line) => line.description),
        });
        return {
          result: generated,
          responseChars: JSON.stringify(generated).length,
        };
      },
    });

    if (!metered.ok) {
      return { error: metered.error };
    }

    const generated = metered.data;

    console.info("[quote-scope-ai] generate ok", {
      quoteId: qid,
      durationMs: Date.now() - startedAt,
      recommendedCount: generated.proposal.recommendedTemplates.length,
      commercialCount: generated.proposal.commercialLineItems.length,
      optionalCount: generated.proposal.optionalAddOns.length,
      isSimulated: generated.generation.isSimulated,
    });

    return {
      proposal: generated.proposal,
      generation: generated.generation,
    };
  } catch (e) {
    console.error("[quote-scope-ai] generate failed", {
      quoteId: qid,
      durationMs: Date.now() - startedAt,
      error: e,
    });
    return { error: getAiActionErrorMessage(e) };
  }
}

export async function applyQuoteScopeSuggestionsAction(
  quoteId: string,
  proposal: unknown,
  options: QuoteScopeSuggestionsApplyOptions,
): Promise<QuoteScopeSuggestionsApplyResult> {
  const qid = quoteId.trim();
  if (!qid) {
    return { error: "Missing quote id." };
  }

  const ctx = await getCommercialRequestContextOrThrow();

  try {
    const parsedProposal = QuoteScopeSuggestionsProposalSchema.parse(proposal);
    if (parsedProposal.quoteId !== qid) {
      return { error: "Proposal does not match this quote." };
    }

    const approved = ApplyQuoteScopeSuggestionsInputSchema.parse(options.approved);

    const allowedTemplateIds = (
      await db.lineItemTemplate.findMany({
        where: { organizationId: ctx.organizationId, archivedAt: null },
        select: { id: true },
      })
    ).map((row) => row.id);

    const validation = validateQuoteScopeSuggestionsForApply(
      parsedProposal,
      approved,
      allowedTemplateIds,
      options.generation,
    );

    if (!validation.ok) {
      return { error: validation.error };
    }

    const optionalByTempId = new Map(
      parsedProposal.optionalAddOns.map((item) => [item.tempId, item]),
    );
    const selectedOptionalAddOns = approved.selectedOptionalAddOnIds
      .map((id) => optionalByTempId.get(id))
      .filter(Boolean) as typeof parsedProposal.optionalAddOns;

    let outcome: Awaited<ReturnType<typeof performApplyQuoteScopeSuggestionsInTx>>;
    try {
      outcome = await db.$transaction(async (tx) =>
        performApplyQuoteScopeSuggestionsInTx(tx, {
          quoteId: qid,
          organizationId: ctx.organizationId,
          selectedTemplateIds: approved.selectedTemplateIds,
          selectedCommercialLineItems: approved.selectedCommercialLineItems,
          selectedOptionalAddOns,
          selectedQuoteJobContext: approved.selectedQuoteJobContext,
        }),
      );
    } catch (e) {
      if (e instanceof QuoteScopeApplyTxError) {
        return { error: e.message };
      }
      throw e;
    }

    if (!outcome.ok) {
      return { error: outcome.error };
    }

    revalidateQuoteCommercialSurfaces(qid);

    return {
      success: true,
      createdCount: outcome.createdCount,
      warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
    };
  } catch (e) {
    console.error("[quote-scope-ai] apply failed", { quoteId: qid, error: e });
    if (e instanceof Error && e.message.trim()) {
      return { error: e.message };
    }
    return { error: getAiActionErrorMessage(e, "Failed to apply scope suggestions.") };
  }
}
