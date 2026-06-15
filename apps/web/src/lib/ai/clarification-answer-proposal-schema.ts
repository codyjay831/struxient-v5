/**
 * AI assist for Scope Clarification — proposal schema.
 *
 * The model proposes likely answers for an existing canonical question set,
 * read from the line's description and notes. Strictly review-then-apply: the
 * suggestions preselect chips in the panel; nothing persists until the user
 * confirms and the deterministic apply action runs.
 *
 * AI never invents new questions or option keys here — it can only suggest
 * values for the set it was given, plus free-text "other"/notes. This keeps the
 * canonical library clean (new sets/questions go through a separate, governed
 * draft-and-review flow, not silent creation).
 */

import { z } from "zod";
import type { AiMeteringMetadata } from "./ai-metering-types";

export const ClarificationSuggestionConfidenceSchema = z.enum(["high", "medium", "low"]);

/** A suggested value for one question in the target set. */
export const ClarificationAnswerSuggestionSchema = z.object({
  questionKey: z.string().min(1).max(200),
  /**
   * Suggested option keys for choice / yes_no questions (use "yes" | "no").
   * Empty for text/number/notes/unknown suggestions.
   */
  optionKeys: z.array(z.string().min(1).max(120)).max(50).default([]),
  /** Free text for short_text / notes, or the "Other" value for choices. */
  text: z.string().max(2000).optional().nullable(),
  /** Numeric value for number questions. */
  number: z.number().finite().optional().nullable(),
  /** True when the model believes the answer is genuinely unknown. */
  unknown: z.boolean().default(false),
  confidence: ClarificationSuggestionConfidenceSchema.default("medium"),
  reasoning: z.string().max(500).optional().nullable(),
});

export const ClarificationAnswerProposalSchema = z.object({
  questionSetKey: z.string().min(1).max(200),
  questionSetVersion: z.number().int().nonnegative(),
  suggestions: z.array(ClarificationAnswerSuggestionSchema).default([]),
  /** Questions the model could not infer and recommends confirming in field. */
  unresolvedQuestionKeys: z.array(z.string().min(1).max(200)).default([]),
  notes: z.array(z.string().max(500)).default([]),
});

export type ClarificationSuggestionConfidence = z.infer<
  typeof ClarificationSuggestionConfidenceSchema
>;
export type ClarificationAnswerSuggestion = z.infer<typeof ClarificationAnswerSuggestionSchema>;
export type ClarificationAnswerProposal = z.infer<typeof ClarificationAnswerProposalSchema>;

export type ClarificationAnswerGenerationMeta = {
  isSimulated: boolean;
  canApply: boolean;
  applyBlockedReason?: string;
};

export type ClarificationAnswerGenerationResult = {
  proposal: ClarificationAnswerProposal;
  generation: ClarificationAnswerGenerationMeta;
  metering?: AiMeteringMetadata;
};
