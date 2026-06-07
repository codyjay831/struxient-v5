import { StaffRole, TaskTemplateCategory } from "@prisma/client";
import { z } from "zod";

const checklistItemSchema = z.object({
  label: z.string().min(1),
});

const resourceItemSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().optional(),
  isEquipment: z.boolean().default(false),
});

export const QuoteExecutionReviewProposedTaskSchema = z.object({
  title: z.string().min(1).max(255),
  category: z.nativeEnum(TaskTemplateCategory),
  stageId: z.string().min(1),
  instructions: z.string().optional().nullable(),
  providesSignals: z.array(z.string()).default([]),
  requiresSignals: z.array(z.string()).default([]),
  hardSignal: z.boolean().default(false),
  assigneeRole: z.nativeEnum(StaffRole).optional().nullable(),
  noteRequired: z.boolean().optional(),
  photoRequired: z.boolean().optional(),
  attachmentRequired: z.boolean().optional(),
  checklist: z.array(checklistItemSchema).default([]),
  resources: z.array(resourceItemSchema).default([]),
});

export const QuoteExecutionReviewAddTaskOperationSchema = z.object({
  opId: z.string().min(1),
  type: z.literal("add_task"),
  lineItemId: z.string().min(1),
  reason: z.string().optional(),
  task: QuoteExecutionReviewProposedTaskSchema,
});

export const QuoteExecutionReviewPatchSignalsOperationSchema = z.object({
  opId: z.string().min(1),
  type: z.literal("patch_task_signals"),
  taskId: z.string().min(1),
  reason: z.string().optional(),
  addProvides: z.array(z.string()).default([]),
  removeProvides: z.array(z.string()).default([]),
  addRequires: z.array(z.string()).default([]),
  removeRequires: z.array(z.string()).default([]),
});

export const QuoteExecutionReviewOperationSchema = z.discriminatedUnion("type", [
  QuoteExecutionReviewAddTaskOperationSchema,
  QuoteExecutionReviewPatchSignalsOperationSchema,
]);

export const QuoteExecutionReviewConsolidationHintSchema = z.object({
  hintId: z.string().min(1),
  title: z.string().min(1),
  taskIds: z.array(z.string()).min(1),
  recommendation: z.string().min(1),
});

export const QuoteExecutionReviewManualDecisionSchema = z.object({
  decisionId: z.string().min(1),
  title: z.string().min(1),
  detail: z.string().min(1),
  lineItemId: z.string().optional(),
  taskId: z.string().optional(),
});

export const QuoteExecutionReviewProposalSchema = z.object({
  quoteId: z.string().min(1),
  summary: z.string(),
  assumptions: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  missingContext: z.array(z.string()).default([]),
  operations: z.array(QuoteExecutionReviewOperationSchema).default([]),
  consolidationHints: z.array(QuoteExecutionReviewConsolidationHintSchema).default([]),
  manualDecisions: z.array(QuoteExecutionReviewManualDecisionSchema).default([]),
});

export type QuoteExecutionReviewProposedTask = z.infer<typeof QuoteExecutionReviewProposedTaskSchema>;
export type QuoteExecutionReviewOperation = z.infer<typeof QuoteExecutionReviewOperationSchema>;
export type QuoteExecutionReviewProposal = z.infer<typeof QuoteExecutionReviewProposalSchema>;
export type QuoteExecutionReviewConsolidationHint = z.infer<
  typeof QuoteExecutionReviewConsolidationHintSchema
>;
export type QuoteExecutionReviewManualDecision = z.infer<
  typeof QuoteExecutionReviewManualDecisionSchema
>;
