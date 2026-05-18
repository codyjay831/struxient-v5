import { PaymentScheduleAnchorType, Prisma } from "@prisma/client";

export type PaymentScheduleItemForMaterialization = {
  id: string;
  title: string;
  anchorType: PaymentScheduleAnchorType;
  amountCents: number | null;
  percentage: Prisma.Decimal | string | null;
};

export type MaterializedPaymentScheduleItem = PaymentScheduleItemForMaterialization & {
  amountCents: number;
};

export type PaymentScheduleValidationErrorCode =
  | "PAYMENT_MILESTONE_MISSING_AMOUNT"
  | "PAYMENT_SCHEDULE_EXCEEDS_QUOTE_TOTAL"
  | "PAYMENT_MILESTONE_INVALID_PERCENTAGE";

export type PaymentScheduleValidationError = {
  code: PaymentScheduleValidationErrorCode;
  message: string;
  details?: string[];
};

function toDecimal(percentage: Prisma.Decimal | string): Prisma.Decimal | null {
  if (percentage instanceof Prisma.Decimal) {
    return percentage.isFinite() ? percentage : null;
  }
  try {
    const d = new Prisma.Decimal(percentage);
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
}

/**
 * Materializes percentage of quote total to integer cents (half-up).
 */
export function materializePercentageToCents(
  quoteTotalCents: number,
  percentage: Prisma.Decimal | string,
): { ok: true; amountCents: number } | { ok: false; error: PaymentScheduleValidationError } {
  const d = toDecimal(percentage);
  if (!d) {
    return {
      ok: false,
      error: {
        code: "PAYMENT_MILESTONE_INVALID_PERCENTAGE",
        message: "A payment milestone has an invalid percentage.",
      },
    };
  }
  if (d.lt(0) || d.gt(100)) {
    return {
      ok: false,
      error: {
        code: "PAYMENT_MILESTONE_INVALID_PERCENTAGE",
        message: "Payment milestone percentages must be between 0 and 100.",
      },
    };
  }

  const amountCents = new Prisma.Decimal(quoteTotalCents)
    .mul(d)
    .div(100)
    .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
    .toNumber();

  if (!Number.isSafeInteger(amountCents) || amountCents < 0) {
    return {
      ok: false,
      error: {
        code: "PAYMENT_MILESTONE_INVALID_PERCENTAGE",
        message: "A payment milestone percentage produced an invalid amount.",
      },
    };
  }

  return { ok: true, amountCents };
}

/**
 * Resolves a single non-FINAL_BALANCE schedule row to concrete cents.
 * Fixed amountCents wins when both amount and percentage are stored.
 */
export function resolveNonFinalScheduleItemCents(
  item: Pick<PaymentScheduleItemForMaterialization, "title" | "amountCents" | "percentage">,
  quoteTotalCents: number,
):
  | { ok: true; amountCents: number }
  | { ok: false; error: PaymentScheduleValidationError } {
  if (item.amountCents != null) {
    if (!Number.isSafeInteger(item.amountCents) || item.amountCents < 0) {
      return {
        ok: false,
        error: {
          code: "PAYMENT_MILESTONE_MISSING_AMOUNT",
          message: `Payment milestone "${item.title}" has an invalid fixed amount.`,
          details: [item.title],
        },
      };
    }
    return { ok: true, amountCents: item.amountCents };
  }

  if (item.percentage != null) {
    const materialized = materializePercentageToCents(quoteTotalCents, item.percentage);
    if (!materialized.ok) {
      return {
        ok: false,
        error: {
          ...materialized.error,
          details: [item.title],
        },
      };
    }
    return { ok: true, amountCents: materialized.amountCents };
  }

  return {
    ok: false,
    error: {
      code: "PAYMENT_MILESTONE_MISSING_AMOUNT",
      message:
        "Every payment milestone needs a dollar amount or percentage before activation.",
      details: [item.title],
    },
  };
}

/**
 * Validates payment schedule rows for activation (does not require FINAL_BALANCE).
 */
export function validatePaymentScheduleForActivation(
  schedule: PaymentScheduleItemForMaterialization[],
  quoteTotalCents: number,
): PaymentScheduleValidationError[] {
  if (!Number.isSafeInteger(quoteTotalCents) || quoteTotalCents < 0) {
    return [
      {
        code: "PAYMENT_MILESTONE_MISSING_AMOUNT",
        message: "Quote total is invalid for payment schedule activation.",
      },
    ];
  }

  const errors: PaymentScheduleValidationError[] = [];
  const missingTitles: string[] = [];
  let resolvedNonFinalSum = 0;

  for (const item of schedule) {
    if (item.anchorType === PaymentScheduleAnchorType.FINAL_BALANCE) {
      continue;
    }

    const resolved = resolveNonFinalScheduleItemCents(item, quoteTotalCents);
    if (!resolved.ok) {
      if (resolved.error.code === "PAYMENT_MILESTONE_MISSING_AMOUNT") {
        missingTitles.push(item.title);
      } else {
        errors.push({
          ...resolved.error,
          details: resolved.error.details ?? [item.title],
        });
      }
      continue;
    }

    resolvedNonFinalSum += resolved.amountCents;
  }

  if (missingTitles.length > 0) {
    errors.push({
      code: "PAYMENT_MILESTONE_MISSING_AMOUNT",
      message:
        "Every payment milestone needs a dollar amount or percentage before activation.",
      details: missingTitles,
    });
  }

  if (resolvedNonFinalSum > quoteTotalCents) {
    errors.push({
      code: "PAYMENT_SCHEDULE_EXCEEDS_QUOTE_TOTAL",
      message:
        "Scheduled payment milestones exceed the quote total—lower milestone amounts or add a final balance row.",
    });
  }

  return errors;
}

/**
 * Materializes all schedule rows to concrete cents for JobPaymentRequirement copy.
 * FINAL_BALANCE rows absorb quote total minus sum of resolved non-final amounts.
 */
export function materializePaymentScheduleForActivation(
  schedule: PaymentScheduleItemForMaterialization[],
  quoteTotalCents: number,
):
  | { ok: true; items: MaterializedPaymentScheduleItem[] }
  | { ok: false; errors: PaymentScheduleValidationError[] } {
  const errors = validatePaymentScheduleForActivation(schedule, quoteTotalCents);
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const materialized: MaterializedPaymentScheduleItem[] = [];
  let resolvedNonFinalSum = 0;

  for (const item of schedule) {
    if (item.anchorType === PaymentScheduleAnchorType.FINAL_BALANCE) {
      continue;
    }

    const resolved = resolveNonFinalScheduleItemCents(item, quoteTotalCents);
    if (!resolved.ok) {
      return { ok: false, errors: [resolved.error] };
    }

    resolvedNonFinalSum += resolved.amountCents;
    materialized.push({
      ...item,
      amountCents: resolved.amountCents,
    });
  }

  const finalRemainderCents = Math.max(0, quoteTotalCents - resolvedNonFinalSum);

  for (const item of schedule) {
    if (item.anchorType !== PaymentScheduleAnchorType.FINAL_BALANCE) {
      continue;
    }

    materialized.push({
      ...item,
      amountCents: finalRemainderCents,
    });
  }

  return { ok: true, items: materialized };
}
