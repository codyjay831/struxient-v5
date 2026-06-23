import { JobActivityType, StaffRole } from "@prisma/client";
import type { ExecutionHealthResult } from "@/lib/job-execution-health";
import type { TaskPaymentHold } from "@/lib/job-payment-readiness";
import { canReadCommercial } from "@/lib/authz/capabilities";

/** Office and viewer commercial-read roles may see payment amounts, notes, and portal links. */
export function canReadPaymentDetails(role: StaffRole): boolean {
  return canReadCommercial(role);
}

export const EXECUTION_PAYMENT_HOLD_LABEL = "Payment hold";

export const FIELD_PAYMENT_HOLD_REASON =
  "Work is blocked until office clears a payment requirement. Contact office if you need to continue.";

const PAYMENT_ACTIVITY_TYPES = new Set<JobActivityType>([
  JobActivityType.PAYMENT_REQUIREMENT_CREATED,
  JobActivityType.PAYMENT_REQUIREMENT_PAID,
  JobActivityType.PAYMENT_REQUIREMENT_WAIVED,
  JobActivityType.PAYMENT_REQUIREMENT_CANCELED,
]);

export function sanitizeTaskPaymentHoldForRole(
  hold: TaskPaymentHold,
  role: StaffRole,
): TaskPaymentHold {
  if (!hold || canReadPaymentDetails(role)) {
    return hold;
  }

  return {
    requirementId: hold.requirementId,
    title: "",
    reason: FIELD_PAYMENT_HOLD_REASON,
  };
}

export function getWorkstationPaymentHoldLabel(
  holdTitle: string | undefined,
  role: StaffRole,
): string | undefined {
  if (!holdTitle) return undefined;
  return canReadPaymentDetails(role) ? holdTitle : EXECUTION_PAYMENT_HOLD_LABEL;
}

export function sanitizeExecutionHealthForRole(
  health: ExecutionHealthResult,
  role: StaffRole,
): ExecutionHealthResult {
  if (canReadPaymentDetails(role) || health.primaryState !== "BLOCKED_BY_PAYMENT") {
    return health;
  }

  return {
    ...health,
    headline: "Work blocked by payment",
    detail: FIELD_PAYMENT_HOLD_REASON,
    recommendedNextAction: { type: "none", label: "" },
    blockers: health.blockers.map((blocker) =>
      blocker.kind === "payment"
        ? {
            ...blocker,
            label: EXECUTION_PAYMENT_HOLD_LABEL,
            nextActionLabel: "Contact office",
          }
        : blocker,
    ),
  };
}

function redactPaymentActivityTitle(type: JobActivityType): string {
  switch (type) {
    case JobActivityType.PAYMENT_REQUIREMENT_CREATED:
      return "Payment requirement updated";
    case JobActivityType.PAYMENT_REQUIREMENT_PAID:
      return "Payment recorded";
    case JobActivityType.PAYMENT_REQUIREMENT_WAIVED:
      return "Payment waived";
    case JobActivityType.PAYMENT_REQUIREMENT_CANCELED:
      return "Payment canceled";
    default:
      return "Payment activity";
  }
}

export function redactPaymentActivityForRole<
  T extends { type: JobActivityType; title: string; details: string | null },
>(activity: T, role: StaffRole): T {
  if (canReadPaymentDetails(role) || !PAYMENT_ACTIVITY_TYPES.has(activity.type)) {
    return activity;
  }

  return {
    ...activity,
    title: redactPaymentActivityTitle(activity.type),
    details: null,
  };
}

export function formatPaymentHoldMessage(hold: NonNullable<TaskPaymentHold>): string {
  if (hold.title && hold.reason !== hold.title) {
    return `${hold.reason}: ${hold.title}`;
  }
  return hold.reason || hold.title;
}
