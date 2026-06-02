import { z } from "zod";

export const ScopeSuggestionConfidenceSchema = z.enum(["high", "medium", "low"]);

export const LineItemDetailAudienceSchema = z.enum(["internal", "customer", "both"]);

/**
 * Structured detail attached to a parent commercial line item — not a separate quote row.
 */
export const LineItemDetailSuggestionSchema = z.object({
  tempId: z.string(),
  label: z.string().max(200).optional().nullable(),
  content: z.string().min(1).max(5000),
  audience: LineItemDetailAudienceSchema.default("internal"),
});

/**
 * Parent commercial scope suggestion — what the customer is buying.
 */
export const CommercialLineItemSuggestionSchema = z.object({
  tempId: z.string(),
  description: z.string().min(1).max(2000),
  confidence: ScopeSuggestionConfidenceSchema.default("medium"),
  reasoning: z.string().optional().nullable(),
  customerScopeTitle: z.string().max(500).optional().nullable(),
  customerScopeDescription: z.string().max(10_000).optional().nullable(),
  lineItemDetails: z.array(LineItemDetailSuggestionSchema).default([]),
  executionPlanningNotes: z.array(z.string().max(2000)).default([]),
  missingInfo: z.array(z.string()).default([]),
});

/**
 * Optional separately-priced or independently removable scope.
 */
export const OptionalAddOnSuggestionSchema = z.object({
  tempId: z.string(),
  description: z.string().min(1).max(2000),
  whySeparate: z.string().min(1).max(2000),
  confidence: ScopeSuggestionConfidenceSchema.default("medium"),
  reasoning: z.string().optional().nullable(),
});

/**
 * A recommended existing Scope Library line item template.
 */
export const RecommendedTemplateSuggestionSchema = z.object({
  tempId: z.string(),
  templateId: z.string(),
  templateDescription: z.string(),
  confidence: ScopeSuggestionConfidenceSchema,
  reasoning: z.string().optional().nullable(),
});

/**
 * Full quote-level scope suggestion proposal (review-then-apply).
 */
export const QuoteScopeSuggestionsProposalSchema = z.object({
  quoteId: z.string(),
  sourceContextSummary: z.string().optional().nullable(),
  assumptions: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  quoteJobContext: z.array(z.string()).default([]),
  quoteMissingInfo: z.array(z.string()).default([]),
  recommendedTemplates: z.array(RecommendedTemplateSuggestionSchema).default([]),
  commercialLineItems: z.array(CommercialLineItemSuggestionSchema).default([]),
  optionalAddOns: z.array(OptionalAddOnSuggestionSchema).default([]),
});

export type ScopeSuggestionConfidence = z.infer<typeof ScopeSuggestionConfidenceSchema>;
export type LineItemDetailAudience = z.infer<typeof LineItemDetailAudienceSchema>;
export type LineItemDetailSuggestion = z.infer<typeof LineItemDetailSuggestionSchema>;
export type CommercialLineItemSuggestion = z.infer<typeof CommercialLineItemSuggestionSchema>;
export type OptionalAddOnSuggestion = z.infer<typeof OptionalAddOnSuggestionSchema>;
export type RecommendedTemplateSuggestion = z.infer<typeof RecommendedTemplateSuggestionSchema>;
export type QuoteScopeSuggestionsProposal = z.infer<typeof QuoteScopeSuggestionsProposalSchema>;

export type QuoteScopeSuggestionsGenerationMeta = {
  isSimulated: boolean;
  canApply: boolean;
  applyBlockedReason?: string;
};

export type QuoteScopeSuggestionsGenerationResult = {
  proposal: QuoteScopeSuggestionsProposal;
  generation: QuoteScopeSuggestionsGenerationMeta;
};

/** Approved commercial line item sent to apply (may be edited in review). */
export const ApprovedCommercialLineItemSchema = z.object({
  tempId: z.string(),
  description: z.string().min(1).max(2000),
  customerScopeTitle: z.string().max(500).optional().nullable(),
  customerScopeDescription: z.string().max(10_000).optional().nullable(),
  lineItemDetails: z.array(LineItemDetailSuggestionSchema).default([]),
  executionPlanningNotes: z.array(z.string().max(2000)).default([]),
  missingInfo: z.array(z.string()).default([]),
});

/** Approved subset sent to apply action. */
export const ApplyQuoteScopeSuggestionsInputSchema = z.object({
  selectedTemplateIds: z.array(z.string()).default([]),
  selectedCommercialLineItems: z.array(ApprovedCommercialLineItemSchema).default([]),
  selectedOptionalAddOnIds: z.array(z.string()).default([]),
  selectedQuoteJobContext: z.array(z.string()).default([]),
});

export type ApprovedCommercialLineItem = z.infer<typeof ApprovedCommercialLineItemSchema>;
export type ApplyQuoteScopeSuggestionsInput = z.infer<typeof ApplyQuoteScopeSuggestionsInputSchema>;
