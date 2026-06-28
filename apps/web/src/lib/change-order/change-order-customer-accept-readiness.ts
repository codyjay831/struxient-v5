import { ChangeOrderStatus, ZeroDollarPolicyClass } from "@prisma/client";
import { canCustomerAcceptChangeOrder } from "@/lib/change-order/change-order-commercial-rules";
import { ZERO_DOLLAR_POLICY_REQUIRED_MESSAGE } from "@/lib/change-order/change-order-commercial-rules";
import { executionDeltaHasUnreviewedGeneratedTasks } from "@/lib/change-order/change-order-execution-task-composer";
import { parseChangeOrderExecutionDelta } from "@/lib/change-order/execution-delta-schema";
import {
  validateChangeOrderExecutionDelta,
  type ExecutionDeltaScopeItem,
  type ExecutionDeltaTask,
} from "@/lib/change-order/execution-delta-validation";
import { assertPaymentImpactReadyForAccept } from "@/lib/change-order/payment-impact-gates";

export type ChangeOrderCustomerAcceptBlockerCode =
  | "NOT_SENT"
  | "ALREADY_ACCEPTED"
  | "PAYMENT_IMPACT"
  | "ZERO_DOLLAR_POLICY"
  | "UNREVIEWED_GENERATED_TASKS"
  | "EXECUTION_NOT_READY";

export type ChangeOrderCustomerAcceptBlocker = {
  code: ChangeOrderCustomerAcceptBlockerCode;
  customerMessage: string;
  staffMessage: string;
};

export type ChangeOrderCustomerAcceptReadinessInput = {
  status: ChangeOrderStatus;
  priceDeltaCents: number;
  zeroDollarPolicyClass?: ZeroDollarPolicyClass | null;
  paymentImpactJson: unknown;
  executionDeltaJson: unknown;
  baseJobPlanVersion: number;
  currentJobPlanVersion: number;
  scopeItems: ExecutionDeltaScopeItem[];
  tasks: ExecutionDeltaTask[];
  /** When false, skip SENT status requirement (used before send). */
  requireSentStatus?: boolean;
};

export type ChangeOrderCustomerAcceptReadiness = {
  canAccept: boolean;
  blockers: ChangeOrderCustomerAcceptBlocker[];
};

export const CHANGE_ORDER_CUSTOMER_ACCEPT_UNAVAILABLE_MESSAGE =
  "This Change Order is not ready for acceptance yet. Please contact the office.";

export const CHANGE_ORDER_CUSTOMER_ONLINE_APPROVAL_UNAVAILABLE_MESSAGE =
  "This Change Order is no longer ready for online approval. Please contact the office, or send a note below.";

export const CHANGE_ORDER_CUSTOMER_PAYMENT_UNAVAILABLE_MESSAGE =
  "This Change Order is missing payment terms. Please contact the company to resend an updated Change Order.";

function customerMessageForExecutionValidation(classification: string | undefined): string {
  if (classification === "STALE_PLAN" || classification === "CONFLICT") {
    return CHANGE_ORDER_CUSTOMER_ACCEPT_UNAVAILABLE_MESSAGE;
  }
  return CHANGE_ORDER_CUSTOMER_ACCEPT_UNAVAILABLE_MESSAGE;
}

/**
 * Authoritative readiness for customer acceptance — same rules as the portal accept action.
 * Also used before send so a CO cannot reach SENT unless it would pass customer accept checks.
 */
export function deriveChangeOrderCustomerAcceptReadiness(
  input: ChangeOrderCustomerAcceptReadinessInput,
): ChangeOrderCustomerAcceptReadiness {
  const blockers: ChangeOrderCustomerAcceptBlocker[] = [];
  const requireSentStatus = input.requireSentStatus ?? true;

  if (requireSentStatus) {
    const statusGate = canCustomerAcceptChangeOrder(input.status);
    if (!statusGate.ok) {
      if (statusGate.error === "ALREADY_ACCEPTED") {
        blockers.push({
          code: "ALREADY_ACCEPTED",
          customerMessage: "This Change Order has already been accepted.",
          staffMessage: "This Change Order is already accepted.",
        });
      } else {
        blockers.push({
          code: "NOT_SENT",
          customerMessage: CHANGE_ORDER_CUSTOMER_ACCEPT_UNAVAILABLE_MESSAGE,
          staffMessage: "Change Order must be sent before the customer can accept.",
        });
      }
      return { canAccept: false, blockers };
    }
  }

  if (input.priceDeltaCents === 0) {
    if (!input.zeroDollarPolicyClass) {
      blockers.push({
        code: "ZERO_DOLLAR_POLICY",
        customerMessage: CHANGE_ORDER_CUSTOMER_ACCEPT_UNAVAILABLE_MESSAGE,
        staffMessage: ZERO_DOLLAR_POLICY_REQUIRED_MESSAGE,
      });
    } else if (input.zeroDollarPolicyClass !== ZeroDollarPolicyClass.CUSTOMER_FACING_CHANGE) {
      blockers.push({
        code: "ZERO_DOLLAR_POLICY",
        customerMessage: CHANGE_ORDER_CUSTOMER_ACCEPT_UNAVAILABLE_MESSAGE,
        staffMessage: "Internal zero-dollar Change Orders are not customer-acceptance eligible.",
      });
    }
  }

  const paymentGate = assertPaymentImpactReadyForAccept({
    priceDeltaCents: input.priceDeltaCents,
    paymentImpactJson: input.paymentImpactJson,
  });
  if (!paymentGate.ok) {
    blockers.push({
      code: "PAYMENT_IMPACT",
      customerMessage: CHANGE_ORDER_CUSTOMER_PAYMENT_UNAVAILABLE_MESSAGE,
      staffMessage:
        paymentGate.error ??
        "Choose and save payment terms in the commercial column before sending this Change Order.",
    });
  }

  const parsedDelta = parseChangeOrderExecutionDelta(input.executionDeltaJson);
  if (parsedDelta.ok && executionDeltaHasUnreviewedGeneratedTasks(parsedDelta.proposal)) {
    blockers.push({
      code: "UNREVIEWED_GENERATED_TASKS",
      customerMessage: CHANGE_ORDER_CUSTOMER_ACCEPT_UNAVAILABLE_MESSAGE,
      staffMessage:
        "Confirm all generated task suggestions in work impact before sending this Change Order.",
    });
  }

  const deltaValidation = validateChangeOrderExecutionDelta({
    rawDelta: input.executionDeltaJson,
    baseJobPlanVersion: input.baseJobPlanVersion,
    currentJobPlanVersion: input.currentJobPlanVersion,
    priceDeltaCents: input.priceDeltaCents,
    paymentImpactJson: input.paymentImpactJson,
    scopeItems: input.scopeItems,
    tasks: input.tasks,
  });
  if (!deltaValidation.ok) {
    const staffMessage =
      deltaValidation.errors[0] ??
      "Work impact must pass acceptance validation before sending this Change Order.";
    blockers.push({
      code: "EXECUTION_NOT_READY",
      customerMessage: customerMessageForExecutionValidation(deltaValidation.classification),
      staffMessage,
    });
  }

  return {
    canAccept: blockers.length === 0,
    blockers,
  };
}

export function getPrimaryCustomerAcceptBlocker(
  readiness: ChangeOrderCustomerAcceptReadiness,
): ChangeOrderCustomerAcceptBlocker | null {
  return readiness.blockers[0] ?? null;
}

export function assertChangeOrderCustomerAcceptReadyOrThrow(
  input: ChangeOrderCustomerAcceptReadinessInput,
): void {
  const readiness = deriveChangeOrderCustomerAcceptReadiness(input);
  if (readiness.canAccept) return;
  const primary = getPrimaryCustomerAcceptBlocker(readiness);
  switch (primary?.code) {
    case "ZERO_DOLLAR_POLICY":
      throw new Error("CHANGE_ORDER_ZERO_DOLLAR_POLICY_REQUIRED");
    case "PAYMENT_IMPACT":
      throw new Error("CHANGE_ORDER_PAYMENT_IMPACT_REQUIRED");
    case "UNREVIEWED_GENERATED_TASKS":
      throw new Error("CHANGE_ORDER_UNREVIEWED_GENERATED_TASKS");
    default:
      throw new Error("CHANGE_ORDER_CUSTOMER_ACCEPT_NOT_READY");
  }
}

export type ChangeOrderCustomerPortalActions = {
  canAccept: boolean;
  canRequestChanges: boolean;
  canSendOfficeNote: boolean;
};

/** Customer-facing response affordances on the public Change Order page. */
export function deriveChangeOrderCustomerPortalActions(input: {
  status: ChangeOrderStatus;
  acceptReadiness: ChangeOrderCustomerAcceptReadiness;
}): ChangeOrderCustomerPortalActions {
  const isSent = input.status === ChangeOrderStatus.SENT;
  const canAccept = isSent && input.acceptReadiness.canAccept;
  return {
    canAccept,
    canRequestChanges: canAccept,
    canSendOfficeNote: isSent && !input.acceptReadiness.canAccept,
  };
}
