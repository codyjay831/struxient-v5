import { z } from "zod";

export const CHANGE_ORDER_EXECUTION_DELTA_SCHEMA_VERSION = 1;

export const ChangeOrderExecutionDeltaOperationTypeSchema = z.enum([
  "ADD_SCOPE_ITEM",
  "REMOVE_SCOPE_ITEM",
  "MODIFY_SCOPE_ITEM",
  "ADD_TASK",
  "CANCEL_TASK",
  "MODIFY_TASK",
  "UPDATE_PAYMENT_REQUIREMENT",
]);

export const ChangeOrderExecutionDeltaTargetEntityTypeSchema = z.enum([
  "JobScopeItem",
  "JobTask",
  "JobPaymentRequirement",
  "ChangeOrderLine",
]);

export const ChangeOrderExecutionDeltaOperationSchema = z.object({
  opId: z.string().min(1),
  type: ChangeOrderExecutionDeltaOperationTypeSchema,
  targetEntityType: ChangeOrderExecutionDeltaTargetEntityTypeSchema,
  targetEntityId: z.string().nullable().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().min(1),
  customerLabel: z.string().optional(),
  internalNote: z.string().optional(),
  requiresCustomerApproval: z.boolean().optional(),
  linkedChangeOrderLineId: z.string().optional(),
});

export const ChangeOrderExecutionDeltaProposalSchema = z
  .object({
    schemaVersion: z.literal(CHANGE_ORDER_EXECUTION_DELTA_SCHEMA_VERSION),
    baseJobPlanVersion: z.number().int().positive(),
    summary: z.string().optional(),
    operations: z.array(ChangeOrderExecutionDeltaOperationSchema),
    meta: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((proposal, ctx) => {
    const seen = new Set<string>();
    for (const [index, operation] of proposal.operations.entries()) {
      if (seen.has(operation.opId)) {
        ctx.addIssue({
          code: "custom",
          path: ["operations", index, "opId"],
          message: `Duplicate operation id: ${operation.opId}`,
        });
      }
      seen.add(operation.opId);
    }
  });

export type ChangeOrderExecutionDeltaOperation = z.infer<
  typeof ChangeOrderExecutionDeltaOperationSchema
>;

export type ChangeOrderExecutionDeltaProposal = z.infer<
  typeof ChangeOrderExecutionDeltaProposalSchema
>;

export type ChangeOrderExecutionDeltaParseResult =
  | { ok: true; proposal: ChangeOrderExecutionDeltaProposal }
  | { ok: false; errors: string[] };

export function parseChangeOrderExecutionDelta(
  value: unknown,
): ChangeOrderExecutionDeltaParseResult {
  const parsed = ChangeOrderExecutionDeltaProposalSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
        return `${path}${issue.message}`;
      }),
    };
  }
  return { ok: true, proposal: parsed.data };
}

export function changeOrderExecutionDeltaToJson(
  proposal: ChangeOrderExecutionDeltaProposal,
): Record<string, unknown> {
  return proposal as unknown as Record<string, unknown>;
}
