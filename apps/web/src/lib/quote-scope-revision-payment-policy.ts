export type ScopeRevisionPaymentImpactStrategy = "ZERO_DOLLAR_ONLY";

/**
 * Gate 7 pre-implementation decision:
 * only zero-dollar scope revisions are allowed until payment-impact operations are implemented.
 */
export const GATE7_PAYMENT_IMPACT_STRATEGY: ScopeRevisionPaymentImpactStrategy = "ZERO_DOLLAR_ONLY";

export type ScopeRevisionPaymentImpactValidation = {
  ok: boolean;
  error?: string;
};

/**
 * Enforces the current payment-impact contract for scope revision apply.
 *
 * Current strategy:
 * - `priceDeltaCents === 0` is allowed.
 * - Non-zero deltas are blocked until an approved in-transaction payment-impact operation exists.
 */
export function validateScopeRevisionPaymentImpact(params: {
  priceDeltaCents: number;
  hasApprovedPaymentImpactOperationInTx?: boolean;
  hasValidPaymentImpactForApply?: boolean;
  skipPaymentImpactRequirement?: boolean;
}): ScopeRevisionPaymentImpactValidation {
  const {
    priceDeltaCents,
    hasApprovedPaymentImpactOperationInTx = false,
    hasValidPaymentImpactForApply = false,
    skipPaymentImpactRequirement = false,
  } = params;
  if (priceDeltaCents === 0 || skipPaymentImpactRequirement) {
    return { ok: true };
  }
  if (hasValidPaymentImpactForApply) {
    return { ok: true };
  }
  if (hasApprovedPaymentImpactOperationInTx) {
    return { ok: true };
  }
  return {
    ok: false,
    error:
      "Change Order modifies job price. Approved payment terms must be materialized in the same transaction.",
  };
}

