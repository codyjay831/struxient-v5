import { TaskTemplateCategory } from "@prisma/client";
import { z } from "zod";

/**
 * Zod schema for a single proposed task in Recovery Mode.
 */
export const AIRecoveryProposedTaskSchema = z.object({
  tempId: z.string(),
  title: z.string().min(1).max(255),
  category: z.nativeEnum(TaskTemplateCategory),
  instructions: z.string().optional().nullable(),
  providesSignals: z.array(z.string()),
  requiresSignals: z.array(z.string()),
  hardSignal: z.boolean().default(false),
  checklist: z.array(z.object({
    label: z.string().min(1),
  })),
  proofRequirements: z.object({
    noteRequired: z.boolean().default(false),
    photoRequired: z.boolean().default(false),
    attachmentRequired: z.boolean().default(false),
  }).optional(),
  classification: z.enum(["FIELD", "OFFICE", "CUSTOMER", "MATERIAL", "PERMIT", "INSPECTION"]).optional(),
  reasoning: z.string().optional(),
  confidence: z.number().min(0).max(1).default(1),
});

/**
 * Zod schema for the full AI proposal in Recovery Mode.
 */
export const AIRecoveryProposalSchema = z.object({
  issueId: z.string(),
  summary: z.string(),
  assumptions: z.array(z.string()),
  warnings: z.array(z.string()),
  tasks: z.array(AIRecoveryProposedTaskSchema),
});

export type AIRecoveryProposedTask = z.infer<typeof AIRecoveryProposedTaskSchema>;
export type AIRecoveryProposal = z.infer<typeof AIRecoveryProposalSchema>;
