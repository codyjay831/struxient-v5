import { PaymentScheduleAnchorType } from "@prisma/client";
import { z } from "zod";

export const PaymentScheduleAnchorTypeSchema = z.nativeEnum(PaymentScheduleAnchorType);

export const PaymentScheduleMilestoneSuggestionSchema = z.object({
  tempId: z.string(),
  title: z.string().min(1).max(200),
  percentage: z.string().optional().nullable(),
  amountCents: z.number().int().nonnegative().optional().nullable(),
  anchorType: PaymentScheduleAnchorTypeSchema,
  anchorStageName: z.string().max(200).optional().nullable(),
  reasoning: z.string().max(2000).optional().nullable(),
});

export const QuotePaymentScheduleProposalSchema = z.object({
  quoteId: z.string(),
  sourceContextSummary: z.string().optional().nullable(),
  scheduleRationale: z.string().max(5000).optional().nullable(),
  assumptions: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  missingInfo: z.array(z.string()).default([]),
  milestones: z.array(PaymentScheduleMilestoneSuggestionSchema).default([]),
});

export type PaymentScheduleMilestoneSuggestion = z.infer<
  typeof PaymentScheduleMilestoneSuggestionSchema
>;
export type QuotePaymentScheduleProposal = z.infer<typeof QuotePaymentScheduleProposalSchema>;

export type QuotePaymentScheduleGenerationMeta = {
  isSimulated: boolean;
  canApply: boolean;
  applyBlockedReason?: string;
};

export type QuotePaymentScheduleGenerationResult = {
  proposal: QuotePaymentScheduleProposal;
  generation: QuotePaymentScheduleGenerationMeta;
};

/** Approved milestone sent to apply (subset of reviewed proposal). */
export const ApprovedPaymentScheduleMilestoneSchema = z.object({
  tempId: z.string(),
  title: z.string().min(1).max(200),
  percentage: z.string().optional().nullable(),
  amountCents: z.number().int().nonnegative().optional().nullable(),
  anchorType: PaymentScheduleAnchorTypeSchema,
  anchorStageId: z.string().optional().nullable(),
});

export const ApplyQuotePaymentScheduleInputSchema = z.object({
  selectedMilestoneTempIds: z.array(z.string()).min(1),
  replaceConfirmed: z.boolean().default(false),
});

export type ApprovedPaymentScheduleMilestone = z.infer<
  typeof ApprovedPaymentScheduleMilestoneSchema
>;
export type ApplyQuotePaymentScheduleInput = z.infer<
  typeof ApplyQuotePaymentScheduleInputSchema
>;
