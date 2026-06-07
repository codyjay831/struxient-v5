import type { QuotePaymentScheduleGenerationMeta, QuotePaymentScheduleProposal } from "@/lib/ai/quote-payment-schedule-proposal-schema";
import type { ApplyQuotePaymentScheduleInput } from "@/lib/ai/quote-payment-schedule-proposal-schema";

export type QuotePaymentScheduleGenerateOptions = {
  userInstructions?: string;
};

export type QuotePaymentScheduleGenerateResult = {
  error?: string;
  proposal?: QuotePaymentScheduleProposal;
  generation?: QuotePaymentScheduleGenerationMeta;
  preflight?: {
    hasLineItems: boolean;
    hasExecutionPlan: boolean;
    hasPaymentTermsInNotes: boolean;
    hasExistingSchedule: boolean;
    quoteTotalCents: number;
    hasMinimumContext: boolean;
  };
};

export type QuotePaymentScheduleApplyResult = {
  error?: string;
  success?: boolean;
  warnings?: string[];
  createdCount?: number;
};

export type QuotePaymentScheduleApplyOptions = {
  approved: ApplyQuotePaymentScheduleInput;
  generation?: QuotePaymentScheduleGenerationMeta;
};
