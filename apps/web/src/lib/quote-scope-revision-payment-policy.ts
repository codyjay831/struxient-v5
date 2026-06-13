export type ScopeRevisionPaymentImpactStrategy = "ZERO_DOLLAR_ONLY";

/**
 * Gate 7 pre-implementation decision:
 * only zero-dollar scope revisions are allowed until payment-impact operations are implemented.
 */
export const GATE7_PAYMENT_IMPACT_STRATEGY: ScopeRevisionPaymentImpactStrategy =
  "ZERO_DOLLAR_ONLY";

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
  hasApprovedPaymentImpactOperationInTx: boolean;
}): ScopeRevisionPaymentImpactValidation {
  const { priceDeltaCents, hasApprovedPaymentImpactOperationInTx } = params;
  if (priceDeltaCents === 0) {
    return { ok: true };
  }
  if (hasApprovedPaymentImpactOperationInTx) {
    return { ok: true };
  }
  return {
    ok: false,
    error:
      "Scope revision changes job price. An approved payment-impact operation is required in the same transaction.",
  };
}

