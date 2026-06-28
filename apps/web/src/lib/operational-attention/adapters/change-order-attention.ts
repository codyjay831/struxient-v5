import {
  ChangeOrderApplicationStatus,
  ChangeOrderStatus,
  StaffRole,
  ZeroDollarPolicyClass,
} from "@prisma/client";
import {
  deriveChangeOrderWorkstationAttention,
} from "@/lib/change-order/change-order-workstation-attention";
import type { ChangeOrderSendBlocker } from "@/lib/change-order/change-order-send-readiness";
import type { OperationalAttentionItem, OperationalAttentionRank } from "../types";

export type ChangeOrderAttentionInput = {
  changeOrderId: string;
  number: number;
  title: string;
  jobId: string;
  jobTitle: string;
  customerLabel?: string | null;
  status: ChangeOrderStatus;
  applicationStatus: ChangeOrderApplicationStatus;
  priceDeltaCents?: number;
  zeroDollarPolicyClass?: ZeroDollarPolicyClass | null;
  updatedAt: Date;
  rank: OperationalAttentionRank;
  rankReason?: string;
  sendBlockers?: ChangeOrderSendBlocker[];
  applyBlockedReason?: string | null;
  visibility?: OperationalAttentionItem["visibility"];
};

function changeOrderTitle(input: ChangeOrderAttentionInput): string {
  return `CO-${String(input.number).padStart(3, "0")} · ${input.title}`;
}

function changeOrderGroup(input: ChangeOrderAttentionInput): OperationalAttentionRank["group"] {
  if (
    input.status === ChangeOrderStatus.ACCEPTED &&
    input.applicationStatus === ChangeOrderApplicationStatus.NOT_APPLIED
  ) {
    return "ready";
  }
  if (
    input.applicationStatus === ChangeOrderApplicationStatus.APPLY_FAILED ||
    input.applicationStatus === ChangeOrderApplicationStatus.NEEDS_EXECUTION_REVIEW
  ) {
    return "investigate";
  }
  return "waiting";
}

function changeOrderKind(input: ChangeOrderAttentionInput): OperationalAttentionItem["kind"] {
  if (
    input.status === ChangeOrderStatus.ACCEPTED ||
    input.applicationStatus === ChangeOrderApplicationStatus.APPLY_FAILED ||
    input.applicationStatus === ChangeOrderApplicationStatus.NEEDS_EXECUTION_REVIEW
  ) {
    return "change_order_apply";
  }
  return "change_order_send";
}

function changeOrderSeverity(input: ChangeOrderAttentionInput): OperationalAttentionItem["severity"] {
  if (
    input.status === ChangeOrderStatus.ACCEPTED ||
    input.applicationStatus === ChangeOrderApplicationStatus.APPLY_FAILED ||
    input.applicationStatus === ChangeOrderApplicationStatus.NEEDS_EXECUTION_REVIEW
  ) {
    return "critical";
  }
  if (input.sendBlockers && input.sendBlockers.length > 0) return "blocking";
  return "attention";
}

function canonicalReason(input: ChangeOrderAttentionInput, fallback: string): string {
  if (input.applyBlockedReason) return input.applyBlockedReason;
  const primaryBlocker = input.sendBlockers?.[0];
  if (primaryBlocker) return primaryBlocker.explanation;
  return fallback;
}

function safeNextAction(input: ChangeOrderAttentionInput, fallbackLabel: string) {
  const primaryBlocker = input.sendBlockers?.[0];
  if (primaryBlocker) {
    return {
      label: primaryBlocker.actionLabel ?? fallbackLabel,
      href: `/jobs/${input.jobId}/change-orders?focus=${input.changeOrderId}`,
      actionKind: primaryBlocker.code,
      disabledReason: primaryBlocker.explanation,
    };
  }
  return {
    label: fallbackLabel,
    href: `/jobs/${input.jobId}/change-orders?focus=${input.changeOrderId}`,
    actionKind:
      changeOrderKind(input) === "change_order_apply"
        ? "APPLY_OR_REVIEW_CHANGE_ORDER"
        : "SEND_OR_REVIEW_CHANGE_ORDER",
  };
}

export function buildChangeOrderOperationalAttentionItems(
  input: ChangeOrderAttentionInput,
): OperationalAttentionItem[] {
  const attention = deriveChangeOrderWorkstationAttention({
    status: input.status,
    applicationStatus: input.applicationStatus,
    priceDeltaCents: input.priceDeltaCents,
    zeroDollarPolicyClass: input.zeroDollarPolicyClass,
  });
  const currentWorkstationReason =
    input.rankReason ?? "Customer-facing scope and price amendment in progress.";

  return [
    {
      id: `${changeOrderKind(input)}:${input.changeOrderId}`,
      kind: changeOrderKind(input),
      severity: changeOrderSeverity(input),
      ownerRoles: [StaffRole.OWNER, StaffRole.ADMIN, StaffRole.OFFICE],
      sourceType: "ChangeOrder",
      sourceId: input.changeOrderId,
      changeOrderId: input.changeOrderId,
      jobId: input.jobId,
      title: changeOrderTitle(input),
      reason: canonicalReason(input, currentWorkstationReason),
      safeNextAction: safeNextAction(input, attention.nextStep),
      visibility: input.visibility ?? { canRead: true, canAct: true },
      updatedAt: input.updatedAt,
      rank: {
        ...input.rank,
        priority: attention.priority,
        group: changeOrderGroup(input),
        lens: attention.lens,
      },
      workstationCompat: {
        workstationId: `change-order-${input.changeOrderId}`,
        workstationKind: "change-order",
        filterCategory: "quotes",
        status: attention.statusLabel,
        reason: currentWorkstationReason,
        nextStep: attention.nextStep,
        subtitle: input.customerLabel ?? input.jobTitle,
        typeLabel: "Change Order",
        parentRecordId: input.jobId,
        parentLabel: input.customerLabel ?? undefined,
        href: `/jobs/${input.jobId}/change-orders?focus=${input.changeOrderId}`,
      },
    },
  ];
}
