"use server";

import { revalidatePath } from "next/cache";
import { QuoteStatus } from "@prisma/client";
import { db } from "@/lib/db";
import {
  getCommercialMutationContextOrThrow,
  getCommercialRequestContextOrThrow,
} from "@/lib/auth-context";
import {
  buildAiMeteringContext,
  runMeteredAiFeature,
} from "@/lib/billing/run-metered-ai-feature";
import { AIService } from "@/lib/ai/ai-service";
import { loadCommercialContextForQuote } from "@/lib/ai/commercial-context";
import {
  buildQuoteScopeCaptureContext,
  buildQuoteScopeContextSections,
} from "@/lib/ai/quote-scope-capture-context";
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
import {
  appendBusinessProfileContext,
  selectBusinessProfileAiContext,
} from "@/lib/business-profile/business-profile-ai-context";
import { getBusinessProfileForAi } from "@/lib/business-profile/business-profile-service";
import type {
  QuoteScopeSuggestionsApplyOptions,
  QuoteScopeSuggestionsApplyResult,
  QuoteScopeContextSectionsLoadResult,
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

export async function loadQuoteScopeContextSectionsAction(
  quoteId: string,
): Promise<QuoteScopeContextSectionsLoadResult> {
  const qid = quoteId.trim();
  if (!qid) {
    return { error: "Missing quote id." };
  }

  const ctx = await getCommercialRequestContextOrThrow();
  const commercialContext = await loadCommercialContextForQuote({
    organizationId: ctx.organizationId,
    quoteId: qid,
  });

  if (!commercialContext || commercialContext.quote.status !== QuoteStatus.DRAFT) {
    return { error: QUOTE_SCOPE_LOCKED_ERROR };
  }

  return {
    contextSections: buildQuoteScopeContextSections(commercialContext),
  };
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
        lineItems: { select: { description: true } },
      },
    });

    if (!quote) {
      return { error: QUOTE_SCOPE_LOCKED_ERROR };
    }

    const commercialContext = await loadCommercialContextForQuote({
      organizationId: ctx.organizationId,
      quoteId: qid,
    });
    if (!commercialContext) {
      return { error: QUOTE_SCOPE_LOCKED_ERROR };
    }

    const contextSections = buildQuoteScopeContextSections(commercialContext, {
      selectedSourceTypes: options?.selectedSourceTypes,
    });
    const contextText = buildQuoteScopeCaptureContext({
      captureText: options?.captureText,
      additionalInstructions: options?.additionalInstructions,
      commercialContext,
      selectedSourceTypes: options?.selectedSourceTypes,
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

    const metered = await runMeteredAiFeature({
      ctx: buildAiMeteringContext({
        organizationId: ctx.organizationId,
        feature: "quote_scope_suggestions",
        requestKind: "generate",
        promptChars: (aiContextText ?? contextText).length,
      }),
      run: async () => {
        const generated = await AIService.generateScopeSuggestions({
          quoteId: qid,
          contextText: aiContextText ?? contextText,
          organizationName: ctx.organizationName,
          recommendedTemplates: recommendedMatches,
          existingLineDescriptions: quote.lineItems.map((line) => line.description),
        });
        if (!generated.metering) {
          throw new Error("AI metering metadata missing from scope suggestions.");
        }
        return {
          result: generated,
          metering: generated.metering,
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
      contextSections,
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

  const ctx = await getCommercialMutationContextOrThrow();

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
          quoteMissingInfo: parsedProposal.quoteMissingInfo,
          sourceContextSummary: parsedProposal.sourceContextSummary ?? null,
          createdByUserId: ctx.userId ?? null,
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
