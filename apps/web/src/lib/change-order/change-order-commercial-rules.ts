import { ChangeOrderStatus, ZeroDollarPolicyClass } from "@prisma/client";

const TERMINAL_COMMERCIAL_STATUSES = new Set<ChangeOrderStatus>([
  ChangeOrderStatus.ACCEPTED,
  ChangeOrderStatus.APPLIED,
  ChangeOrderStatus.REJECTED,
  ChangeOrderStatus.VOID,
  ChangeOrderStatus.SUPERSEDED,
]);

const EDITABLE_DRAFT_STATUSES = new Set<ChangeOrderStatus>([
  ChangeOrderStatus.DRAFT,
  ChangeOrderStatus.CUSTOMER_REQUESTED_CHANGES,
]);

export const ZERO_DOLLAR_POLICY_REQUIRED_MESSAGE =
  "Select zero-dollar policy classification before continuing.";
export const ZERO_DOLLAR_INTERNAL_CONFIRMATION_REQUIRED_MESSAGE =
  "Confirm no customer-facing change before accepting or applying.";
export const ZERO_DOLLAR_CUSTOMER_ACKNOWLEDGEMENT_REQUIRED_MESSAGE =
  "Customer-facing zero-dollar changes must be sent and accepted by the customer before apply.";
export const ZERO_DOLLAR_INTERNAL_SEND_BLOCKED_MESSAGE =
  "Internal zero-dollar Change Orders do not need to be sent to the customer.";

export type ZeroDollarPolicyInput = {
  priceDeltaCents: number;
  zeroDollarPolicyClass?: ZeroDollarPolicyClass | null;
  internalNoCustomerImpactConfirmedAt?: Date | string | null;
};

export function changeOrderRequiresCustomerPriceApproval(priceDeltaCents: number): boolean {
  return priceDeltaCents !== 0;
}

export function isZeroDollarChangeOrder(priceDeltaCents: number): boolean {
  return priceDeltaCents === 0;
}

export function zeroDollarRequiresCustomerAcknowledgement(
  input: ZeroDollarPolicyInput,
): boolean {
  return (
    input.priceDeltaCents === 0 &&
    input.zeroDollarPolicyClass === ZeroDollarPolicyClass.CUSTOMER_FACING_CHANGE
  );
}

export function zeroDollarInternalConfirmationSatisfied(
  input: ZeroDollarPolicyInput,
): boolean {
  return (
    input.priceDeltaCents !== 0 ||
    input.zeroDollarPolicyClass !== ZeroDollarPolicyClass.INTERNAL_EXECUTION_ONLY ||
    input.internalNoCustomerImpactConfirmedAt != null
  );
}

export function validateZeroDollarPolicyForSend(
  input: ZeroDollarPolicyInput,
): { ok: true } | { ok: false; error: string } {
  if (input.priceDeltaCents !== 0) return { ok: true };
  if (!input.zeroDollarPolicyClass) {
    return { ok: false, error: ZERO_DOLLAR_POLICY_REQUIRED_MESSAGE };
  }
  if (
    input.zeroDollarPolicyClass === ZeroDollarPolicyClass.INTERNAL_ADMIN ||
    input.zeroDollarPolicyClass === ZeroDollarPolicyClass.INTERNAL_EXECUTION_ONLY
  ) {
    return { ok: false, error: ZERO_DOLLAR_INTERNAL_SEND_BLOCKED_MESSAGE };
  }
  return { ok: true };
}

export function validateZeroDollarPolicyForStaffAccept(
  input: ZeroDollarPolicyInput,
): { ok: true } | { ok: false; error: string } {
  if (input.priceDeltaCents !== 0) return { ok: true };
  if (!input.zeroDollarPolicyClass) {
    return { ok: false, error: ZERO_DOLLAR_POLICY_REQUIRED_MESSAGE };
  }
  if (input.zeroDollarPolicyClass === ZeroDollarPolicyClass.CUSTOMER_FACING_CHANGE) {
    return { ok: false, error: ZERO_DOLLAR_CUSTOMER_ACKNOWLEDGEMENT_REQUIRED_MESSAGE };
  }
  if (!zeroDollarInternalConfirmationSatisfied(input)) {
    return { ok: false, error: ZERO_DOLLAR_INTERNAL_CONFIRMATION_REQUIRED_MESSAGE };
  }
  return { ok: true };
}

export function validateZeroDollarPolicyForApply(
  input: ZeroDollarPolicyInput & { hasCustomerAcceptanceCheckpoint?: boolean },
): { ok: true } | { ok: false; error: string } {
  if (input.priceDeltaCents !== 0) return { ok: true };
  if (!input.zeroDollarPolicyClass) {
    return { ok: false, error: ZERO_DOLLAR_POLICY_REQUIRED_MESSAGE };
  }
  if (
    input.zeroDollarPolicyClass === ZeroDollarPolicyClass.CUSTOMER_FACING_CHANGE &&
    !input.hasCustomerAcceptanceCheckpoint
  ) {
    return { ok: false, error: ZERO_DOLLAR_CUSTOMER_ACKNOWLEDGEMENT_REQUIRED_MESSAGE };
  }
  if (!zeroDollarInternalConfirmationSatisfied(input)) {
    return { ok: false, error: ZERO_DOLLAR_INTERNAL_CONFIRMATION_REQUIRED_MESSAGE };
  }
  return { ok: true };
}

export function shouldClearZeroDollarInternalConfirmationOnDraftEdit(input: {
  currentPriceDeltaCents: number;
  nextPriceDeltaCents: number;
  currentZeroDollarPolicyClass?: ZeroDollarPolicyClass | null;
  nextZeroDollarPolicyClass?: ZeroDollarPolicyClass | null;
  internalNoCustomerImpactConfirmedAt?: Date | string | null;
  linesChanged?: boolean;
  executionDeltaChanged?: boolean;
}): boolean {
  if (input.internalNoCustomerImpactConfirmedAt == null) return false;
  return (
    input.currentPriceDeltaCents !== input.nextPriceDeltaCents ||
    input.currentZeroDollarPolicyClass !== input.nextZeroDollarPolicyClass ||
    input.linesChanged === true ||
    input.executionDeltaChanged === true
  );
}

export function canStaffAcceptChangeOrder(params: {
  status: ChangeOrderStatus;
  priceDeltaCents: number;
  zeroDollarPolicyClass?: ZeroDollarPolicyClass | null;
  internalNoCustomerImpactConfirmedAt?: Date | string | null;
}): { ok: true } | { ok: false; error: string } {
  if (params.status === ChangeOrderStatus.APPLIED) {
    return { ok: false, error: "Applied Change Orders cannot be accepted again." };
  }
  if (
    params.status === ChangeOrderStatus.REJECTED ||
    params.status === ChangeOrderStatus.VOID ||
    params.status === ChangeOrderStatus.SUPERSEDED
  ) {
    return { ok: false, error: "This Change Order is no longer eligible for acceptance." };
  }
  if (params.status === ChangeOrderStatus.ACCEPTED) {
    return { ok: false, error: "This Change Order is already accepted." };
  }

  if (changeOrderRequiresCustomerPriceApproval(params.priceDeltaCents)) {
    if (params.status !== ChangeOrderStatus.SENT) {
      return {
        ok: false,
        error:
          "Price-impact Change Orders must be sent to the customer before staff can record acceptance.",
      };
    }
    return { ok: true };
  }

  const zeroDollarPolicy = validateZeroDollarPolicyForStaffAccept(params);
  if (!zeroDollarPolicy.ok) return zeroDollarPolicy;

  if (
    params.status !== ChangeOrderStatus.DRAFT &&
    params.status !== ChangeOrderStatus.SENT &&
    params.status !== ChangeOrderStatus.CUSTOMER_REQUESTED_CHANGES
  ) {
    return { ok: false, error: "This Change Order cannot be accepted in its current state." };
  }

  return { ok: true };
}

export function canCustomerAcceptChangeOrder(status: ChangeOrderStatus): { ok: true } | { ok: false; error: string } {
  if (status === ChangeOrderStatus.ACCEPTED || status === ChangeOrderStatus.APPLIED) {
    return { ok: false, error: "ALREADY_ACCEPTED" };
  }
  if (status !== ChangeOrderStatus.SENT) {
    return { ok: false, error: "CHANGE_ORDER_NOT_SENT" };
  }
  return { ok: true };
}

export function canEditChangeOrderDraft(status: ChangeOrderStatus): { ok: true } | { ok: false; error: string } {
  if (EDITABLE_DRAFT_STATUSES.has(status)) {
    return { ok: true };
  }
  if (status === ChangeOrderStatus.APPLIED) {
    return { ok: false, error: "Applied Change Orders cannot be edited." };
  }
  if (status === ChangeOrderStatus.ACCEPTED) {
    return { ok: false, error: "Accepted Change Orders cannot be edited. Revise or supersede instead." };
  }
  if (status === ChangeOrderStatus.SENT) {
    return { ok: false, error: "Sent Change Orders cannot be edited. Void or request changes first." };
  }
  return { ok: false, error: "This Change Order cannot be edited in its current state." };
}

export function isTerminalCommercialStatus(status: ChangeOrderStatus): boolean {
  return TERMINAL_COMMERCIAL_STATUSES.has(status);
}
