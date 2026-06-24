import { z } from "zod";

export const CHANGE_ORDER_PAYMENT_IMPACT_SCHEMA_VERSION = 1;

export const ChangeOrderPaymentStrategySchema = z.enum([
  "DUE_BEFORE_ADDED_WORK",
  "ADD_TO_NEXT_UNPAID_PAYMENT",
  "ADD_TO_FINAL_PAYMENT",
  "CREDIT_REMAINING_BALANCE",
]);

export type ChangeOrderPaymentStrategy = z.infer<typeof ChangeOrderPaymentStrategySchema>;

export const ChangeOrderPaymentImpactResolvedPreviewSchema = z.object({
  strategyLabel: z.string().min(1),
  customerSummary: z.string().min(1),
  targetPaymentRequirementId: z.string().nullable().optional(),
  targetPaymentTitle: z.string().nullable().optional(),
  targetAmountBeforeCents: z.number().int().nullable().optional(),
  targetAmountAfterCents: z.number().int().nullable().optional(),
  dueTimingLabel: z.string().nullable().optional(),
  blocksAddedWork: z.boolean().optional(),
});

export type ChangeOrderPaymentImpactResolvedPreview = z.infer<
  typeof ChangeOrderPaymentImpactResolvedPreviewSchema
>;

export const ChangeOrderPaymentImpactSchema = z
  .object({
    schemaVersion: z.literal(CHANGE_ORDER_PAYMENT_IMPACT_SCHEMA_VERSION),
    strategy: ChangeOrderPaymentStrategySchema,
    targetPaymentRequirementId: z.string().nullable().optional(),
    customerTermsText: z.string().min(1),
    blocksAddedWork: z.boolean().optional(),
    resolvedPreview: ChangeOrderPaymentImpactResolvedPreviewSchema,
    resolvedAtSendJobPlanVersion: z.number().int().positive().optional(),
  })
  .superRefine((value, ctx) => {
    const needsTarget = (
      ["ADD_TO_NEXT_UNPAID_PAYMENT", "ADD_TO_FINAL_PAYMENT"] as ChangeOrderPaymentStrategy[]
    ).includes(value.strategy);
    if (needsTarget && !value.targetPaymentRequirementId) {
      ctx.addIssue({
        code: "custom",
        path: ["targetPaymentRequirementId"],
        message: "Target payment requirement is required for this strategy.",
      });
    }
  });

export type ChangeOrderPaymentImpact = z.infer<typeof ChangeOrderPaymentImpactSchema>;

export type ChangeOrderPaymentImpactParseResult =
  | { ok: true; impact: ChangeOrderPaymentImpact }
  | { ok: false; errors: string[] };

export function parseChangeOrderPaymentImpact(
  value: unknown,
): ChangeOrderPaymentImpactParseResult {
  const parsed = ChangeOrderPaymentImpactSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
        return `${path}${issue.message}`;
      }),
    };
  }
  return { ok: true, impact: parsed.data };
}

export function changeOrderPaymentImpactToJson(
  impact: ChangeOrderPaymentImpact,
): Record<string, unknown> {
  return impact as unknown as Record<string, unknown>;
}

export const CHANGE_ORDER_PAYMENT_STRATEGY_LABELS: Record<ChangeOrderPaymentStrategy, string> = {
  DUE_BEFORE_ADDED_WORK: "Collect before added work starts",
  ADD_TO_NEXT_UNPAID_PAYMENT: "Add to next unpaid payment",
  ADD_TO_FINAL_PAYMENT: "Add to final payment",
  CREDIT_REMAINING_BALANCE: "Credit remaining balance",
};
