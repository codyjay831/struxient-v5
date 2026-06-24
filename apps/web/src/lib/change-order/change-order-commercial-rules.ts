import { ChangeOrderStatus } from "@prisma/client";

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

export function changeOrderRequiresCustomerPriceApproval(priceDeltaCents: number): boolean {
  return priceDeltaCents !== 0;
}

export function canStaffAcceptChangeOrder(params: {
  status: ChangeOrderStatus;
  priceDeltaCents: number;
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
