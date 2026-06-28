import { ChangeOrderStatus } from "@prisma/client";
import type { ChangeOrderButtonState, ChangeOrderLineDraft, ChangeOrderPermissions, ChangeOrderRevisionSnapshot } from "@/lib/change-order-flow";
import {
  executionImpactHasGeneratedTaskSuggestions,
  type ChangeOrderExecutionImpactView,
} from "@/lib/change-order/change-order-execution-projection";
import type { ChangeOrderExecutionDeltaProposal } from "@/lib/change-order/execution-delta-schema";
import { parseNoWorkImpactConfirmed } from "@/lib/change-order/execution-delta-no-work-impact";
import { validateZeroDollarPolicyForSend } from "@/lib/change-order/change-order-commercial-rules";

export type ChangeOrderSendBlockerCode =
  | "PAGE_BLOCKED"
  | "PENDING"
  | "NO_REVISION"
  | "NOT_EDITABLE_STATUS"
  | "PERMISSION_DENIED"
  | "UNSAVED_DRAFT"
  | "EXECUTION_VALIDATION"
  | "GENERATED_TASKS"
  | "STALE_PLAN"
  | "PAYMENT_IMPACT"
  | "ZERO_DOLLAR_POLICY"
  | "CONFIRM_NO_WORK_IMPACT"
  | "WORK_IMPACT_REVIEW";

export type ChangeOrderSendBlockerActionTarget =
  | "commercial"
  | "execution"
  | "payment"
  | null;

export type ChangeOrderSendBlocker = {
  code: ChangeOrderSendBlockerCode;
  severity: "blocker";
  title: string;
  explanation: string;
  actionLabel: string | null;
  actionTarget: ChangeOrderSendBlockerActionTarget;
};

export type ChangeOrderSendReadinessInput = {
  permissions: ChangeOrderPermissions;
  pageBlocked: boolean;
  isPending: boolean;
  selectedRevision: ChangeOrderRevisionSnapshot | null;
  executionImpact: ChangeOrderExecutionImpactView | null;
  executionDeltaProposal?: ChangeOrderExecutionDeltaProposal | null;
  hasUnsavedDraftChanges: boolean;
  unsavedDraftChangesReason: string | null;
  paymentImpactReady: boolean;
  paymentImpactBlockReason: string | null;
  paymentImpactChanged?: boolean;
};

export function commercialLinesArePriceOnly(lines: ChangeOrderLineDraft[]): boolean {
  return lines.length > 0 && lines.every((line) => line.executionRelevant === false);
}

export function executionDeltaHasTaskOperations(
  proposal: ChangeOrderExecutionDeltaProposal | null | undefined,
): boolean {
  if (!proposal) return false;
  return proposal.operations.some(
    (operation) =>
      operation.type === "ADD_TASK" ||
      operation.type === "CANCEL_TASK" ||
      operation.type === "MODIFY_TASK",
  );
}

function resolveNoWorkImpactConfirmed(input: ChangeOrderSendReadinessInput): boolean {
  if (parseNoWorkImpactConfirmed(input.executionDeltaProposal?.meta)) {
    return true;
  }
  const storedDelta = input.selectedRevision?.executionImpact;
  if (storedDelta?.noWorkImpactConfirmed) {
    return true;
  }
  return false;
}

export function deriveChangeOrderSendBlockers(
  input: ChangeOrderSendReadinessInput,
): ChangeOrderSendBlocker[] {
  const blockers: ChangeOrderSendBlocker[] = [];

  if (input.pageBlocked) {
    blockers.push({
      code: "PAGE_BLOCKED",
      severity: "blocker",
      title: "Change Orders blocked",
      explanation: "Change Orders are blocked for this job.",
      actionLabel: null,
      actionTarget: null,
    });
    return blockers;
  }

  if (input.isPending) {
    blockers.push({
      code: "PENDING",
      severity: "blocker",
      title: "Update in progress",
      explanation: "Wait for the current save or send action to finish.",
      actionLabel: null,
      actionTarget: null,
    });
    return blockers;
  }

  if (!input.selectedRevision) {
    blockers.push({
      code: "NO_REVISION",
      severity: "blocker",
      title: "Select a Change Order",
      explanation: "Select a draft Change Order to send.",
      actionLabel: null,
      actionTarget: null,
    });
    return blockers;
  }

  if (
    input.selectedRevision.status !== ChangeOrderStatus.DRAFT &&
    input.selectedRevision.status !== ChangeOrderStatus.CUSTOMER_REQUESTED_CHANGES
  ) {
    blockers.push({
      code: "NOT_EDITABLE_STATUS",
      severity: "blocker",
      title: "Not sendable",
      explanation: "Only editable Change Orders can be sent.",
      actionLabel: null,
      actionTarget: null,
    });
    return blockers;
  }

  if (!input.permissions.canApprove) {
    blockers.push({
      code: "PERMISSION_DENIED",
      severity: "blocker",
      title: "Permission required",
      explanation:
        input.permissions.approveError ?? "You cannot send Change Orders.",
      actionLabel: null,
      actionTarget: null,
    });
    return blockers;
  }

  if (input.hasUnsavedDraftChanges) {
    const reason = input.unsavedDraftChangesReason ?? "Save draft changes before sending.";
    const isPayment = reason.includes("payment impact");
    const isExecution = reason.includes("execution impact");
    const isCommercial = reason.includes("commercial");
    blockers.push({
      code: "UNSAVED_DRAFT",
      severity: "blocker",
      title: isPayment
        ? "Save payment plan"
        : isExecution
          ? "Save work impact"
          : isCommercial
            ? "Save commercial changes"
            : "Save draft changes",
      explanation: reason,
      actionLabel: isPayment || isCommercial ? "Save commercial changes" : "Save execution impact",
      actionTarget: isExecution ? "execution" : "commercial",
    });
  }

  if (!input.paymentImpactReady && !input.paymentImpactChanged) {
    blockers.push({
      code: "PAYMENT_IMPACT",
      severity: "blocker",
      title: "Save payment plan",
      explanation:
        input.paymentImpactBlockReason ??
        "The customer payment terms changed and must be saved before sending.",
      actionLabel: "Save commercial changes",
      actionTarget: "commercial",
    });
  }

  const impact = input.executionImpact;
  const lines = input.selectedRevision.lines;
  const zeroDollarPolicy = validateZeroDollarPolicyForSend({
    priceDeltaCents: input.selectedRevision.priceDeltaCents,
    zeroDollarPolicyClass: input.selectedRevision.zeroDollarPolicyClass,
    internalNoCustomerImpactConfirmedAt:
      input.selectedRevision.internalNoCustomerImpactConfirmedAt,
  });
  if (!zeroDollarPolicy.ok) {
    blockers.push({
      code: "ZERO_DOLLAR_POLICY",
      severity: "blocker",
      title: "Zero-dollar policy required",
      explanation: zeroDollarPolicy.error,
      actionLabel: "Review zero-dollar policy",
      actionTarget: "commercial",
    });
  }

  const noWorkImpactConfirmed = resolveNoWorkImpactConfirmed(input);
  const priceOnlyCommercial = commercialLinesArePriceOnly(lines);
  const hasGeneratedTasks = impact
    ? executionImpactHasGeneratedTaskSuggestions(impact)
    : false;

  if (impact?.stalePlan) {
    blockers.push({
      code: "STALE_PLAN",
      severity: "blocker",
      title: "Review work impact",
      explanation:
        "The job plan changed since this Change Order was drafted. Review work impact before sending.",
      actionLabel: "Open work impact",
      actionTarget: "execution",
    });
  }

  if (impact && !impact.validationOk) {
    const primaryError = impact.validationErrors[0];
    const legacyConflict = impact.validationErrors.some((error) =>
      error.includes("Legacy UPDATE_PAYMENT_REQUIREMENT"),
    );
    blockers.push({
      code: "EXECUTION_VALIDATION",
      severity: "blocker",
      title: legacyConflict ? "Refresh work impact" : "Fix work impact errors",
      explanation:
        primaryError ??
        "Work impact must pass validation before sending.",
      actionLabel: legacyConflict ? "Save commercial changes" : "Open work impact",
      actionTarget: legacyConflict ? "commercial" : "execution",
    });
  }

  if (
    priceOnlyCommercial &&
    !noWorkImpactConfirmed &&
    !executionDeltaHasTaskOperations(input.executionDeltaProposal) &&
    !(impact && (impact.addedTasks.length + impact.modifiedTasks.length + impact.canceledTasks.length > 0))
  ) {
    blockers.push({
      code: "CONFIRM_NO_WORK_IMPACT",
      severity: "blocker",
      title: "Confirm no work impact",
      explanation:
        "This Change Order changes price only. Confirm it does not change the work plan before sending.",
      actionLabel: "Mark as price-only",
      actionTarget: "execution",
    });
  } else if (hasGeneratedTasks) {
    const generatedCount = impact?.addedTasks.filter((task) => task.isGenerated).length ?? 0;
    blockers.push({
      code: "GENERATED_TASKS",
      severity: "blocker",
      title: "Review generated task suggestions",
      explanation: `${generatedCount} generated task suggestion${generatedCount === 1 ? "" : "s"} must be reviewed or removed before sending.`,
      actionLabel: "Confirm generated tasks",
      actionTarget: "execution",
    });
  } else if (
    input.selectedRevision.priceDeltaCents !== 0 &&
    !noWorkImpactConfirmed &&
    !hasGeneratedTasks &&
    !(impact && !impact.validationOk) &&
    (priceOnlyCommercial ||
      (impact &&
        impact.addedTasks.length === 0 &&
        impact.modifiedTasks.length === 0 &&
        impact.canceledTasks.length === 0))
  ) {
    blockers.push({
      code: "CONFIRM_NO_WORK_IMPACT",
      severity: "blocker",
      title: "Confirm no work impact",
      explanation:
        "This Change Order changes price only. Confirm it does not change the work plan before sending.",
      actionLabel: "Mark as price-only",
      actionTarget: "execution",
    });
  }

  return blockers;
}

export function deriveChangeOrderSendReadiness(input: ChangeOrderSendReadinessInput): {
  blockers: ChangeOrderSendBlocker[];
  canSend: boolean;
  primaryBlocker: ChangeOrderSendBlocker | null;
} {
  const blockers = deriveChangeOrderSendBlockers(input);
  const primaryBlocker = blockers[0] ?? null;
  return {
    blockers,
    canSend: blockers.length === 0,
    primaryBlocker,
  };
}

export function getSendChangeOrderButtonStateFromBlockers(input: {
  blockers: ChangeOrderSendBlocker[];
}): ChangeOrderButtonState {
  const primary = input.blockers[0];
  if (!primary) {
    return { disabled: false, reason: null };
  }
  return {
    disabled: true,
    reason: `${primary.title}: ${primary.explanation}`,
  };
}
