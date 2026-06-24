import {
  isAllocationStrategy,
  isDepositStrategy,
  parseChangeOrderPaymentImpact,
  validatePaymentImpactAllocationSum,
  type ChangeOrderPaymentImpactAny,
} from "@/lib/change-order/payment-impact-schema";

export type ChangeOrderPaymentImpactGateResult =
  | { ok: true; impact: ChangeOrderPaymentImpactAny | null }
  | { ok: false; error: string; errors?: string[] };

/**
 * Validates stored payment impact against Change Order price delta.
 * Zero-dollar COs must not carry payment impact.
 */
export function validateChangeOrderPaymentImpactGate(params: {
  priceDeltaCents: number;
  paymentImpactJson: unknown;
}): ChangeOrderPaymentImpactGateResult {
  if (params.priceDeltaCents === 0) {
    if (params.paymentImpactJson != null) {
      return {
        ok: false,
        error: "Zero-dollar Change Orders must not include payment impact.",
      };
    }
    return { ok: true, impact: null };
  }

  if (params.paymentImpactJson == null) {
    return {
      ok: false,
      error:
        "Choose and save how the customer will pay for this change before sending or accepting.",
    };
  }

  const parsed = parseChangeOrderPaymentImpact(params.paymentImpactJson);
  if (!parsed.ok) {
    return {
      ok: false,
      error: "Change Order payment impact is invalid.",
      errors: parsed.errors,
    };
  }

  const impact = parsed.impact;

  if (params.priceDeltaCents < 0 && impact.strategy !== "CREDIT_REMAINING_BALANCE") {
    return {
      ok: false,
      error: "Negative Change Order amounts must use the credit remaining balance strategy.",
    };
  }

  if (params.priceDeltaCents > 0 && impact.strategy === "CREDIT_REMAINING_BALANCE") {
    return {
      ok: false,
      error: "Credit strategy cannot be used for positive Change Order amounts.",
    };
  }

  if (
    (impact.strategy === "ADD_TO_NEXT_UNPAID_PAYMENT" ||
      impact.strategy === "ADD_TO_FINAL_PAYMENT") &&
    !impact.targetPaymentRequirementId &&
    !("allocations" in impact && impact.allocations?.length)
  ) {
    return {
      ok: false,
      error: "Payment strategy requires a target payment requirement.",
    };
  }

  if (isAllocationStrategy(impact.strategy) || isDepositStrategy(impact.strategy)) {
    const sumErrors = validatePaymentImpactAllocationSum({
      priceDeltaCents: params.priceDeltaCents,
      impact,
    });
    if (sumErrors.length > 0) {
      return {
        ok: false,
        error: sumErrors[0] ?? "Payment allocation is invalid.",
        errors: sumErrors,
      };
    }
  }

  return { ok: true, impact };
}

export function assertPaymentImpactReadyForSend(params: {
  priceDeltaCents: number;
  paymentImpactJson: unknown;
}): ChangeOrderPaymentImpactGateResult {
  return validateChangeOrderPaymentImpactGate(params);
}

export function assertPaymentImpactReadyForAccept(params: {
  priceDeltaCents: number;
  paymentImpactJson: unknown;
}): ChangeOrderPaymentImpactGateResult {
  return validateChangeOrderPaymentImpactGate(params);
}
