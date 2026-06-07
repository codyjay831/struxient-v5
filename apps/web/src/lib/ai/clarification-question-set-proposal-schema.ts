import { z } from "zod";

const ClarificationOptionProposalSchema = z.object({
  key: z.string().min(1).max(120),
  label: z.string().min(1).max(300),
  aliases: z.array(z.string().min(1).max(200)).default([]),
});

const ClarificationQuestionProposalSchema = z.object({
  key: z.string().min(1).max(160),
  label: z.string().min(1).max(300),
  inputType: z.enum([
    "single_choice",
    "multi_choice",
    "yes_no_unknown",
    "short_text",
    "number",
    "notes",
  ]),
  helpText: z.string().max(400).nullable().default(null),
  allowOther: z.boolean().default(false),
  unit: z.string().max(40).nullable().default(null),
  customerFacing: z.boolean().default(false),
  aliases: z.array(z.string().min(1).max(200)).default([]),
  options: z.array(ClarificationOptionProposalSchema).default([]),
});

export const ClarificationQuestionSetProposalSchema = z.object({
  key: z.string().min(1).max(160),
  label: z.string().min(1).max(300),
  description: z.string().max(400).nullable().default(null),
  aliases: z.array(z.string().min(1).max(200)).default([]),
  keywords: z.array(z.string().min(1).max(200)).default([]),
  suggestedTags: z.array(z.string().min(1).max(120)).default([]),
  questions: z.array(ClarificationQuestionProposalSchema).min(1),
  warnings: z.array(z.string().min(1).max(300)).default([]),
});

export type ClarificationQuestionSetProposal = z.infer<
  typeof ClarificationQuestionSetProposalSchema
>;

export type ClarificationQuestionSetGenerationResult = {
  proposal: ClarificationQuestionSetProposal;
  generation: {
    isSimulated: boolean;
    canApply: boolean;
    applyBlockedReason?: string;
  };
};
