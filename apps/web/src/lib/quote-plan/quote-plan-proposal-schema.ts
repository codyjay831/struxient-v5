import { ExecutionTaskOrigin, StaffRole, TaskTemplateCategory } from "@prisma/client";
import { z } from "zod";

export const QuotePlanProposalTaskSchema = z.object({
  taskId: z.string().min(1).optional(),
  title: z.string().min(1).max(255),
  category: z.nativeEnum(TaskTemplateCategory),
  stageId: z.string().nullable(),
  instructions: z.string().nullable().optional(),
  requiresSignals: z.array(z.string()).default([]),
  providesSignals: z.array(z.string()).default([]),
  hardSignal: z.boolean().default(false),
  requirementsJson: z.unknown().optional(),
  partsRequiredJson: z.unknown().optional(),
  assigneeRole: z.nativeEnum(StaffRole).nullable().optional(),
  sourceTaskTemplateId: z.string().nullable().optional(),
  sourceLineItemTemplateTaskId: z.string().nullable().optional(),
  sourceType: z.enum(["TASK_TEMPLATE", "CUSTOM"]).default("CUSTOM"),
  origin: z.nativeEnum(ExecutionTaskOrigin).default(ExecutionTaskOrigin.AI_PLAN),
  planningTags: z.array(z.string()).default([]),
  lineItemIds: z.array(z.string().min(1)).min(1),
  protected: z.boolean().optional(),
});

export const QuotePlanProposalOperationSchema = z.discriminatedUnion("type", [
  z.object({
    opId: z.string().min(1),
    type: z.literal("ADD_TASK"),
    task: QuotePlanProposalTaskSchema,
    reason: z.string().optional(),
  }),
  z.object({
    opId: z.string().min(1),
    type: z.literal("UPDATE_TASK"),
    taskId: z.string().min(1),
    task: QuotePlanProposalTaskSchema.partial(),
    reason: z.string().optional(),
  }),
  z.object({
    opId: z.string().min(1),
    type: z.literal("CANCEL_TASK"),
    taskId: z.string().min(1),
    reason: z.string().min(1),
  }),
  z.object({
    opId: z.string().min(1),
    type: z.literal("RELINK_TASK_SCOPE"),
    taskId: z.string().min(1),
    lineItemIds: z.array(z.string().min(1)).min(1),
    reason: z.string().optional(),
  }),
]);

export const QuotePlanProposalSchema = z.object({
  quoteId: z.string().min(1),
  schemaVersion: z.number().int().positive().default(1),
  plannerVersion: z.string().min(1),
  generatedAgainstInputHash: z.string().min(1),
  basePlanVersion: z.number().int().positive(),
  summary: z.string().default(""),
  assumptions: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  operations: z.array(QuotePlanProposalOperationSchema).default([]),
});

export type QuotePlanProposal = z.infer<typeof QuotePlanProposalSchema>;
export type QuotePlanProposalOperation = z.infer<typeof QuotePlanProposalOperationSchema>;

