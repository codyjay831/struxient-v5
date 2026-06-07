/**
 * Scope Clarification — zod schemas for the answer payload crossing the
 * client → server boundary. Mirrors the types in `clarification-types.ts`.
 */

import { z } from "zod";

export const ClarificationInputTypeSchema = z.enum([
  "single_choice",
  "multi_choice",
  "yes_no_unknown",
  "short_text",
  "number",
  "notes",
]);

export const ClarificationAnswerValueSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("choice"),
    optionKeys: z.array(z.string().min(1).max(120)).max(50),
    otherText: z.string().max(500).optional().nullable(),
  }),
  z.object({
    kind: z.literal("text"),
    text: z.string().max(2000),
  }),
  z.object({
    kind: z.literal("number"),
    value: z.number().finite(),
    unit: z.string().max(40).optional().nullable(),
  }),
  z.object({
    kind: z.literal("unknown"),
  }),
]);

export const ClarificationAnswerSchema = z.object({
  questionSetKey: z.string().min(1).max(200),
  questionSetVersion: z.number().int().nonnegative(),
  questionKey: z.string().min(1).max(200),
  questionLabelSnapshot: z.string().min(1).max(300),
  inputType: ClarificationInputTypeSchema,
  value: ClarificationAnswerValueSchema,
  optionLabelSnapshots: z.record(z.string(), z.string().max(300)).optional(),
  customerFacing: z.boolean().optional(),
});

export const LineClarificationAnswersSchema = z.object({
  questionSetKey: z.string().min(1).max(200),
  questionSetVersion: z.number().int().nonnegative(),
  answers: z.array(ClarificationAnswerSchema).max(100),
});

export type LineClarificationAnswersInput = z.infer<typeof LineClarificationAnswersSchema>;
