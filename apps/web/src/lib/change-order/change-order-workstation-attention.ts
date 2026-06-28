import {
  ChangeOrderApplicationStatus,
  ChangeOrderStatus,
  ZeroDollarPolicyClass,
} from "@prisma/client";

export type ChangeOrderWorkstationAttention = {
  statusLabel: string;
  nextStep: string;
  priority: "critical" | "high";
  lens: "attention" | "waiting";
};

export function deriveChangeOrderWorkstationAttention(input: {
  status: ChangeOrderStatus;
  applicationStatus: ChangeOrderApplicationStatus;
  priceDeltaCents?: number;
  zeroDollarPolicyClass?: ZeroDollarPolicyClass | null;
}): ChangeOrderWorkstationAttention {
  if (input.applicationStatus === ChangeOrderApplicationStatus.APPLY_FAILED) {
    return {
      statusLabel: "Change Order apply failed",
      nextStep: "Review failed Change Order apply and execution impact.",
      priority: "critical",
      lens: "attention",
    };
  }

  if (input.applicationStatus === ChangeOrderApplicationStatus.NEEDS_EXECUTION_REVIEW) {
    return {
      statusLabel: "Change Order needs execution review",
      nextStep: "Review execution impact before applying Change Order.",
      priority: "critical",
      lens: "attention",
    };
  }

  if (input.status === ChangeOrderStatus.CUSTOMER_REQUESTED_CHANGES) {
    return {
      statusLabel: "Customer requested CO changes",
      nextStep: "Customer requested Change Order changes — revise draft.",
      priority: "high",
      lens: "attention",
    };
  }

  if (input.status === ChangeOrderStatus.SENT) {
    return {
      statusLabel: "Change Order SENT",
      nextStep: "Await customer acceptance.",
      priority: "high",
      lens: "waiting",
    };
  }

  if (input.status === ChangeOrderStatus.ACCEPTED) {
    return {
      statusLabel: "Change Order ACCEPTED",
      nextStep: "Apply accepted Change Order.",
      priority: "critical",
      lens: "attention",
    };
  }

  if (input.status === ChangeOrderStatus.DRAFT) {
    if (input.priceDeltaCents === 0 && !input.zeroDollarPolicyClass) {
      return {
        statusLabel: "Change Order DRAFT",
        nextStep: "Classify zero-dollar approval policy before sending, accepting, or applying.",
        priority: "high",
        lens: "attention",
      };
    }
    if (
      input.priceDeltaCents === 0 &&
      input.zeroDollarPolicyClass !== ZeroDollarPolicyClass.CUSTOMER_FACING_CHANGE
    ) {
      return {
        statusLabel: "Change Order DRAFT",
        nextStep: "Review internal zero-dollar Change Order before internal acceptance.",
        priority: "high",
        lens: "attention",
      };
    }
    return {
      statusLabel: "Change Order DRAFT",
      nextStep: "Send Change Order to customer.",
      priority: "high",
      lens: "waiting",
    };
  }

  return {
    statusLabel: `Change Order ${input.status}`,
    nextStep: "Review Change Order.",
    priority: "high",
    lens: "waiting",
  };
}
