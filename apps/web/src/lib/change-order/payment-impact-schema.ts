import { JobPaymentRequirementStatus } from "@prisma/client";
import { z } from "zod";

export const CHANGE_ORDER_PAYMENT_IMPACT_SCHEMA_VERSION = 1;
export const CHANGE_ORDER_PAYMENT_IMPACT_SCHEMA_VERSION_V2 = 2;

/** v1 MVP strategies (unchanged). */
export const ChangeOrderPaymentStrategyV1Schema = z.enum([
  "DUE_BEFORE_ADDED_WORK",
  "ADD_TO_NEXT_UNPAID_PAYMENT",
  "ADD_TO_FINAL_PAYMENT",
  "CREDIT_REMAINING_BALANCE",
]);

export type ChangeOrderPaymentStrategyV1 = z.infer<typeof ChangeOrderPaymentStrategyV1Schema>;

/** All strategies including v2 payment-plan options. */
export const ChangeOrderPaymentStrategySchema = z.enum([
  "DUE_BEFORE_ADDED_WORK",
  "ADD_TO_NEXT_UNPAID_PAYMENT",
  "ADD_TO_FINAL_PAYMENT",
  "CREDIT_REMAINING_BALANCE",
  "DEPOSIT_NOW_REST_TO_FINAL",
  "SPLIT_ACROSS_REMAINING_PAYMENTS",
  "DEPOSIT_NOW_REST_SPLIT_ACROSS_REMAINING",
]);

export type ChangeOrderPaymentStrategy = z.infer<typeof ChangeOrderPaymentStrategySchema>;

export const ALLOCATION_STRATEGIES = [
  "SPLIT_ACROSS_REMAINING_PAYMENTS",
  "DEPOSIT_NOW_REST_TO_FINAL",
  "DEPOSIT_NOW_REST_SPLIT_ACROSS_REMAINING",
] as const satisfies readonly ChangeOrderPaymentStrategy[];

export type AllocationStrategy = (typeof ALLOCATION_STRATEGIES)[number];

export const DEPOSIT_STRATEGIES = [
  "DEPOSIT_NOW_REST_TO_FINAL",
  "DEPOSIT_NOW_REST_SPLIT_ACROSS_REMAINING",
] as const satisfies readonly ChangeOrderPaymentStrategy[];

export const ChangeOrderPaymentAllocationBasisSchema = z.enum([
  "ORIGINAL_PAYMENT_PERCENTAGES",
  "CURRENT_REMAINING_AMOUNTS",
  "EQUAL_SPLIT",
]);

export type ChangeOrderPaymentAllocationBasis = z.infer<
  typeof ChangeOrderPaymentAllocationBasisSchema
>;

export const ChangeOrderPaymentAllocationRowSchema = z.object({
  paymentRequirementId: z.string().min(1),
  title: z.string().min(1),
  statusAtApproval: z.nativeEnum(JobPaymentRequirementStatus),
  currentAmountCents: z.number().int().min(0),
  adjustmentCents: z.number().int(),
  newAmountCents: z.number().int().min(0),
  sourcePaymentScheduleItemId: z.string().nullable().optional(),
  schedulePercentage: z.number().nullable().optional(),
});

export type ChangeOrderPaymentAllocationRow = z.infer<
  typeof ChangeOrderPaymentAllocationRowSchema
>;

export const ChangeOrderPaymentInitialPaymentSchema = z.object({
  amountCents: z.number().int().positive(),
  title: z.string().min(1),
  dueTiming: z.literal("BEFORE_ADDED_WORK"),
  createsDueRequirement: z.literal(true),
});

export type ChangeOrderPaymentInitialPayment = z.infer<
  typeof ChangeOrderPaymentInitialPaymentSchema
>;

export const ChangeOrderPaymentAllocationLinePreviewSchema = z.object({
  title: z.string().min(1),
  currentAmountCents: z.number().int().min(0),
  adjustmentCents: z.number().int(),
  newAmountCents: z.number().int().min(0),
});

export type ChangeOrderPaymentAllocationLinePreview = z.infer<
  typeof ChangeOrderPaymentAllocationLinePreviewSchema
>;

export const ChangeOrderPaymentImpactResolvedPreviewSchema = z.object({
  strategyLabel: z.string().min(1),
  customerSummary: z.string().min(1),
  targetPaymentRequirementId: z.string().nullable().optional(),
  targetPaymentTitle: z.string().nullable().optional(),
  targetAmountBeforeCents: z.number().int().nullable().optional(),
  targetAmountAfterCents: z.number().int().nullable().optional(),
  dueTimingLabel: z.string().nullable().optional(),
  blocksAddedWork: z.boolean().optional(),
  adjustmentTotalCents: z.number().int().optional(),
  allocationLines: z.array(ChangeOrderPaymentAllocationLinePreviewSchema).optional(),
  depositAmountCents: z.number().int().nullable().optional(),
  depositDueLabel: z.string().nullable().optional(),
});

export type ChangeOrderPaymentImpactResolvedPreview = z.infer<
  typeof ChangeOrderPaymentImpactResolvedPreviewSchema
>;

export const ChangeOrderPaymentImpactV1Schema = z
  .object({
    schemaVersion: z.literal(CHANGE_ORDER_PAYMENT_IMPACT_SCHEMA_VERSION),
    strategy: ChangeOrderPaymentStrategyV1Schema,
    targetPaymentRequirementId: z.string().nullable().optional(),
    customerTermsText: z.string().min(1),
    blocksAddedWork: z.boolean().optional(),
    resolvedPreview: ChangeOrderPaymentImpactResolvedPreviewSchema,
    resolvedAtSendJobPlanVersion: z.number().int().positive().optional(),
  })
  .superRefine((value, ctx) => {
    const needsTarget = (
      ["ADD_TO_NEXT_UNPAID_PAYMENT", "ADD_TO_FINAL_PAYMENT"] as ChangeOrderPaymentStrategyV1[]
    ).includes(value.strategy);
    if (needsTarget && !value.targetPaymentRequirementId) {
      ctx.addIssue({
        code: "custom",
        path: ["targetPaymentRequirementId"],
        message: "Target payment requirement is required for this strategy.",
      });
    }
  });

export type ChangeOrderPaymentImpactV1 = z.infer<typeof ChangeOrderPaymentImpactV1Schema>;

export const ChangeOrderPaymentImpactV2Schema = z
  .object({
    schemaVersion: z.literal(CHANGE_ORDER_PAYMENT_IMPACT_SCHEMA_VERSION_V2),
    strategy: ChangeOrderPaymentStrategySchema,
    targetPaymentRequirementId: z.string().nullable().optional(),
    customerTermsText: z.string().min(1),
    blocksAddedWork: z.boolean().optional(),
    allocationBasis: ChangeOrderPaymentAllocationBasisSchema.optional(),
    allocationBasisFallback: ChangeOrderPaymentAllocationBasisSchema.optional(),
    initialPayment: ChangeOrderPaymentInitialPaymentSchema.optional(),
    allocations: z.array(ChangeOrderPaymentAllocationRowSchema).optional(),
    resolvedPreview: ChangeOrderPaymentImpactResolvedPreviewSchema,
    resolvedAtSendJobPlanVersion: z.number().int().positive().optional(),
  })
  .superRefine((value, ctx) => {
    const needsTarget = (
      ["ADD_TO_NEXT_UNPAID_PAYMENT", "ADD_TO_FINAL_PAYMENT"] as ChangeOrderPaymentStrategy[]
    ).includes(value.strategy);
    if (needsTarget && !value.targetPaymentRequirementId && !value.allocations?.length) {
      ctx.addIssue({
        code: "custom",
        path: ["targetPaymentRequirementId"],
        message: "Target payment requirement is required for this strategy.",
      });
    }

    const needsAllocations = (
      [
        "SPLIT_ACROSS_REMAINING_PAYMENTS",
        "DEPOSIT_NOW_REST_TO_FINAL",
        "DEPOSIT_NOW_REST_SPLIT_ACROSS_REMAINING",
      ] as ChangeOrderPaymentStrategy[]
    ).includes(value.strategy);

    if (needsAllocations && (!value.allocations || value.allocations.length === 0)) {
      if (
        value.strategy !== "DEPOSIT_NOW_REST_TO_FINAL" ||
        !value.initialPayment ||
        value.initialPayment.amountCents <= 0
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["allocations"],
          message: "At least one payment allocation is required for this strategy.",
        });
      }
    }

    if (
      (value.strategy === "DEPOSIT_NOW_REST_TO_FINAL" ||
        value.strategy === "DEPOSIT_NOW_REST_SPLIT_ACROSS_REMAINING") &&
      !value.initialPayment
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["initialPayment"],
        message: "Deposit amount is required for deposit strategies.",
      });
    }

    if (value.allocations) {
      const ids = value.allocations.map((a) => a.paymentRequirementId);
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({
          code: "custom",
          path: ["allocations"],
          message: "Duplicate payment requirement targets are not allowed.",
        });
      }
      for (const row of value.allocations) {
        if (row.newAmountCents < 0) {
          ctx.addIssue({
            code: "custom",
            path: ["allocations"],
            message: `Payment "${row.title}" would have a negative amount.`,
          });
        }
      }
    }
  });

export type ChangeOrderPaymentImpactV2 = z.infer<typeof ChangeOrderPaymentImpactV2Schema>;

/** Backward-compatible alias for v1 shape. */
export type ChangeOrderPaymentImpact = ChangeOrderPaymentImpactV1;

export type ChangeOrderPaymentImpactAny = ChangeOrderPaymentImpactV1 | ChangeOrderPaymentImpactV2;

export type ChangeOrderPaymentImpactParseResult =
  | { ok: true; impact: ChangeOrderPaymentImpactAny }
  | { ok: false; errors: string[] };

export function isPaymentImpactV2(
  impact: ChangeOrderPaymentImpactAny,
): impact is ChangeOrderPaymentImpactV2 {
  return impact.schemaVersion === CHANGE_ORDER_PAYMENT_IMPACT_SCHEMA_VERSION_V2;
}

export function isAllocationStrategy(
  strategy: ChangeOrderPaymentStrategy,
): strategy is AllocationStrategy {
  return (ALLOCATION_STRATEGIES as readonly string[]).includes(strategy);
}

export function isDepositStrategy(strategy: ChangeOrderPaymentStrategy): boolean {
  return (DEPOSIT_STRATEGIES as readonly string[]).includes(strategy);
}

export function parseChangeOrderPaymentImpact(
  value: unknown,
): ChangeOrderPaymentImpactParseResult {
  if (value != null && typeof value === "object" && "schemaVersion" in value) {
    const version = (value as { schemaVersion: unknown }).schemaVersion;
    if (version === CHANGE_ORDER_PAYMENT_IMPACT_SCHEMA_VERSION_V2) {
      const parsed = ChangeOrderPaymentImpactV2Schema.safeParse(value);
      if (!parsed.success) {
        return formatParseErrors(parsed.error);
      }
      return { ok: true, impact: parsed.data };
    }
  }

  const parsed = ChangeOrderPaymentImpactV1Schema.safeParse(value);
  if (!parsed.success) {
    return formatParseErrors(parsed.error);
  }
  return { ok: true, impact: parsed.data };
}

function formatParseErrors(error: z.ZodError): ChangeOrderPaymentImpactParseResult {
  return {
    ok: false,
    errors: error.issues.map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    }),
  };
}

export function validatePaymentImpactAllocationSum(params: {
  priceDeltaCents: number;
  impact: ChangeOrderPaymentImpactAny;
}): string[] {
  const errors: string[] = [];
  const { priceDeltaCents, impact } = params;

  if (priceDeltaCents === 0) return errors;

  if (priceDeltaCents < 0 && impact.strategy !== "CREDIT_REMAINING_BALANCE") {
    errors.push("Negative Change Order amounts must use the credit remaining balance strategy.");
  }
  if (priceDeltaCents > 0 && impact.strategy === "CREDIT_REMAINING_BALANCE") {
    errors.push("Credit strategy requires a negative Change Order amount.");
  }

  const positiveSplitStrategies: ChangeOrderPaymentStrategy[] = [
    "SPLIT_ACROSS_REMAINING_PAYMENTS",
    "DEPOSIT_NOW_REST_TO_FINAL",
    "DEPOSIT_NOW_REST_SPLIT_ACROSS_REMAINING",
  ];
  if (positiveSplitStrategies.includes(impact.strategy) && priceDeltaCents <= 0) {
    errors.push("Split and deposit strategies require a positive Change Order amount.");
  }

  if (!isPaymentImpactV2(impact)) return errors;

  const depositCents = impact.initialPayment?.amountCents ?? 0;
  const allocationSum =
    impact.allocations?.reduce((sum, row) => sum + row.adjustmentCents, 0) ?? 0;

  if (isDepositStrategy(impact.strategy) || isAllocationStrategy(impact.strategy)) {
    if (depositCents + allocationSum !== priceDeltaCents) {
      errors.push(
        `Deposit (${depositCents} cents) plus allocations (${allocationSum} cents) must equal the Change Order amount (${priceDeltaCents} cents).`,
      );
    }
  }

  if (impact.strategy === "SPLIT_ACROSS_REMAINING_PAYMENTS" && allocationSum !== priceDeltaCents) {
    errors.push(
      `Allocation adjustments (${allocationSum} cents) must equal the Change Order amount (${priceDeltaCents} cents).`,
    );
  }

  return errors;
}

export function changeOrderPaymentImpactToJson(
  impact: ChangeOrderPaymentImpactAny,
): Record<string, unknown> {
  return impact as unknown as Record<string, unknown>;
}

export const CHANGE_ORDER_PAYMENT_STRATEGY_LABELS: Record<ChangeOrderPaymentStrategy, string> = {
  DUE_BEFORE_ADDED_WORK: "Collect before added work starts",
  ADD_TO_NEXT_UNPAID_PAYMENT: "Add to next unpaid payment",
  ADD_TO_FINAL_PAYMENT: "Add to final payment",
  CREDIT_REMAINING_BALANCE: "Credit remaining balance",
  DEPOSIT_NOW_REST_TO_FINAL: "Deposit now, rest to final payment",
  SPLIT_ACROSS_REMAINING_PAYMENTS: "Spread across remaining payments",
  DEPOSIT_NOW_REST_SPLIT_ACROSS_REMAINING: "Deposit now, spread remainder",
};

/** @deprecated Use ChangeOrderPaymentImpactV1Schema */
export const ChangeOrderPaymentImpactSchema = ChangeOrderPaymentImpactV1Schema;
