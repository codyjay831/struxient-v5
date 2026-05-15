import { TaskTemplateCategory } from "@prisma/client";
import { z } from "zod";

/**
 * Zod schema for a single proposed task in Library Mode.
 * Mirrors LineItemTemplateTask but includes AI-specific metadata.
 */
export const AILibraryProposedTaskSchema = z.object({
  tempId: z.string(), // Used for transient UI state and duplicate prevention
  sourceTaskTemplateId: z.string().optional().nullable(),
  title: z.string().min(1).max(255),
  category: z.nativeEnum(TaskTemplateCategory),
  instructions: z.string().optional().nullable(),
  stageName: z.string().optional().nullable(), // Proposed stage name (to be mapped to stageId)
  stageId: z.string().optional().nullable(), // Populated if matched to existing stage
  providesSignals: z.array(z.string()),
  requiresSignals: z.array(z.string()),
  hardSignal: z.boolean().default(false),
  checklist: z.array(z.object({
    label: z.string().min(1),
  })),
  resources: z.array(z.object({
    name: z.string().min(1),
    quantity: z.number().positive(),
    unit: z.string().optional(),
    isEquipment: z.boolean().default(false),
  })),
  // AI Metadata
  reasoning: z.string().optional(),
  stagePlacementReason: z.string().optional(),
  confidence: z.number().min(0).max(1).default(1),
});

/**
 * Zod schema for the full AI proposal in Library Mode.
 */
export const AILibraryProposalSchema = z.object({
  templateId: z.string(),
  sourceContext: z.string(), // Description of the line item template
  assumptions: z.array(z.string()),
  warnings: z.array(z.string()),
  tasks: z.array(AILibraryProposedTaskSchema),
});

export type AILibraryProposedTask = z.infer<typeof AILibraryProposedTaskSchema>;
export type AILibraryProposal = z.infer<typeof AILibraryProposalSchema>;
