import type { QuotePlanProposal } from "@/lib/quote-plan/quote-plan-proposal-schema";

export const QUOTE_PLAN_EMPTY_FALLBACK_ERROR =
  "No execution plan could be generated. No tasks were created. Add tasks manually or retry generation.";

export const QUOTE_PLAN_INVALID_AI_ERROR =
  "AI generated an invalid quote-wide execution plan. No AI tasks were saved.";

export function hasQuotePlanProposalOperations(
  proposal: QuotePlanProposal | null | undefined,
): proposal is QuotePlanProposal {
  return Boolean(proposal && proposal.operations.length > 0);
}

export function shouldOpenQuotePlanProposalReview(
  proposal: QuotePlanProposal | null | undefined,
): proposal is QuotePlanProposal {
  return hasQuotePlanProposalOperations(proposal);
}

export function shouldShowQuotePlanProposalApplyAction(
  proposal: QuotePlanProposal | null | undefined,
): proposal is QuotePlanProposal {
  return hasQuotePlanProposalOperations(proposal);
}

export function quotePlanProposalEmptyError(
  fallback = QUOTE_PLAN_EMPTY_FALLBACK_ERROR,
): { ok: false; error: string } {
  return { ok: false, error: fallback };
}

export function toQuoteWidePlanGenerationError(message: string): string {
  if (/adjust the line item description/i.test(message)) {
    return QUOTE_PLAN_INVALID_AI_ERROR;
  }
  return message;
}
