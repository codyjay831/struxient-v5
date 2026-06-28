import {
  ChangeOrderApplicationStatus,
  ChangeOrderCheckpointKind,
  ChangeOrderStatus,
  StaffRole,
} from "@prisma/client";
import { db } from "@/lib/db";
import {
  deriveChangeOrderReadiness,
  jobChangeOrdersPath,
  type ChangeOrderButtonState,
  type ChangeOrderRevisionSnapshot,
} from "@/lib/change-order-flow";
import {
  loadChangeOrderWorkspace,
  type LoadedChangeOrder,
  type LoadedChangeOrderWorkspace,
} from "@/lib/change-order-loader";
import { formatCents } from "@/lib/job-payment-display";

/** Canonical Workstation panel copy — matches full change-order workspace. */
export const CHANGE_ORDER_WORKSTATION_STAFF_ACCEPT_LABEL = "Mark internally accepted";

export type ChangeOrderWorkstationPanelPrimaryAction =
  | { kind: "send"; disabled: boolean; reason: string | null }
  | {
      kind: "apply";
      disabled: boolean;
      reason: string | null;
      expectedJobPlanVersion: number;
    }
  | { kind: "staff_accept"; disabled: boolean; reason: string | null }
  | { kind: "review_full"; label: string; href: string; reason?: string | null }
  | { kind: "open_full"; label: string; href: string };

export type ChangeOrderWorkstationPanelDto = {
  id: string;
  jobId: string;
  href: string;
  title: string;
  customerLabel: string | null;
  status: ChangeOrderStatus;
  applicationStatus: ChangeOrderApplicationStatus;
  lifecycleReadinessLabel: string | null;
  officeNextStep: string | null;
  priceDeltaCents: number;
  priceDeltaLabel: string;
  acceptedAt: string | null;
  approvedAt: string | null;
  lastSentEmailAt: string | null;
  appliedAt: string | null;
  pageBlocked: boolean;
  pageBlockedMessage: string | null;
  jobPlanVersion: number;
  expectedJobPlanVersion: number;
  send: ChangeOrderButtonState;
  apply: ChangeOrderButtonState;
  staffAccept: ChangeOrderButtonState;
  sendBlockers: {
    title: string;
    explanation: string;
    actionLabel: string | null;
  }[];
  applyErrorSummary: { classification: string | null; messages: string[] } | null;
  commercialStatusLabel: string;
  paymentPlanStatusLabel: string;
  workImpactStatusLabel: string;
  requiresCustomerApproval: boolean;
  customerRequestSummary: string | null;
  primaryAction: ChangeOrderWorkstationPanelPrimaryAction;
};

function extractCheckpointMessage(staffOnlyJson: unknown): string | null {
  if (!staffOnlyJson || typeof staffOnlyJson !== "object") return null;
  const message = (staffOnlyJson as { message?: unknown }).message;
  return typeof message === "string" && message.trim().length > 0 ? message.trim() : null;
}

export function resolveChangeOrderWorkstationPrimaryAction(input: {
  status: ChangeOrderStatus;
  applicationStatus: ChangeOrderApplicationStatus;
  send: ChangeOrderButtonState;
  apply: ChangeOrderButtonState;
  staffAccept: ChangeOrderButtonState;
  expectedJobPlanVersion: number;
  href: string;
}): ChangeOrderWorkstationPanelPrimaryAction {
  const { status, applicationStatus, send, apply, staffAccept, expectedJobPlanVersion, href } =
    input;

  if (
    applicationStatus === ChangeOrderApplicationStatus.APPLY_FAILED ||
    applicationStatus === ChangeOrderApplicationStatus.NEEDS_EXECUTION_REVIEW
  ) {
    return {
      kind: "review_full",
      label: "Review and apply",
      href,
      reason: apply.reason,
    };
  }

  if (status === ChangeOrderStatus.CUSTOMER_REQUESTED_CHANGES) {
    return {
      kind: "review_full",
      label: "Review customer request",
      href,
    };
  }

  if (status === ChangeOrderStatus.ACCEPTED) {
    if (!apply.disabled) {
      return {
        kind: "apply",
        disabled: false,
        reason: null,
        expectedJobPlanVersion,
      };
    }
    return {
      kind: "review_full",
      label: "Review and apply",
      href,
      reason: apply.reason,
    };
  }

  if (status === ChangeOrderStatus.SENT) {
    if (!staffAccept.disabled) {
      return {
        kind: "staff_accept",
        disabled: false,
        reason: null,
      };
    }
    return {
      kind: "open_full",
      label: "Open full change order",
      href,
    };
  }

  if (status === ChangeOrderStatus.DRAFT) {
    if (!send.disabled) {
      return {
        kind: "send",
        disabled: false,
        reason: null,
      };
    }
    return {
      kind: "review_full",
      label: "Open full change order",
      href,
      reason: send.reason,
    };
  }

  return {
    kind: "open_full",
    label: "Open full change order",
    href,
  };
}

export function resolveBlockedPrimaryActionMessage(
  panel: Pick<ChangeOrderWorkstationPanelDto, "primaryAction" | "send" | "apply">,
): string | null {
  const { primaryAction, send, apply } = panel;

  if (
    primaryAction.kind === "send" ||
    primaryAction.kind === "apply" ||
    primaryAction.kind === "staff_accept"
  ) {
    return null;
  }

  if (primaryAction.kind === "review_full") {
    if (primaryAction.label === "Review customer request") {
      return null;
    }

    const reason =
      primaryAction.reason ??
      (primaryAction.label === "Review and apply" ? apply.reason : null) ??
      (primaryAction.label === "Open full change order" ? send.reason : null);

    if (!reason?.trim()) {
      return null;
    }

    const actionLabel =
      primaryAction.label === "Review and apply"
        ? "Apply"
        : primaryAction.label === "Open full change order" && send.disabled
          ? "Send"
          : "This action";

    return `${actionLabel} is not available yet: ${reason.trim()}`;
  }

  if (primaryAction.kind === "open_full") {
    if (apply.disabled && apply.reason?.trim()) {
      return `Apply is not available yet: ${apply.reason.trim()}`;
    }
    if (send.disabled && send.reason?.trim()) {
      return `Send is not available yet: ${send.reason.trim()}`;
    }
  }

  return null;
}

export function buildChangeOrderWorkstationPanelDto(input: {
  workspace: LoadedChangeOrderWorkspace;
  changeOrder: LoadedChangeOrder;
  customerLabel: string | null;
  customerRequestSummary: string | null;
  lastSentEmailAt: string | null;
  acceptedAt: string | null;
}): ChangeOrderWorkstationPanelDto {
  const { workspace, changeOrder } = input;
  const applicationStatus =
    changeOrder.applicationStatus ?? ChangeOrderApplicationStatus.NOT_APPLIED;
  const expectedJobPlanVersion = changeOrder.baseJobPlanVersion ?? workspace.jobPlanVersion;

  const selectedRevision: ChangeOrderRevisionSnapshot = {
    id: changeOrder.id,
    status: changeOrder.status,
    reasoning: changeOrder.reasoning,
    priceDeltaCents: changeOrder.priceDeltaCents,
    lines: changeOrder.lines,
    applicationStatus,
    baseJobPlanVersion: expectedJobPlanVersion,
    lastApplyErrorJson: changeOrder.lastApplyErrorJson,
    customerDocumentTitle: changeOrder.customerDocumentTitle,
    paymentImpactJson: changeOrder.paymentImpactJson,
    executionImpact: changeOrder.executionImpact,
    zeroDollarPolicyClass: changeOrder.zeroDollarPolicyClass,
    internalNoCustomerImpactConfirmedAt:
      changeOrder.internalNoCustomerImpactConfirmedAt,
    internalNoCustomerImpactConfirmedByUserId:
      changeOrder.internalNoCustomerImpactConfirmedByUserId,
    hasCustomerAcceptanceCheckpoint: changeOrder.hasCustomerAcceptanceCheckpoint,
  };

  const readiness = deriveChangeOrderReadiness({
    permissions: workspace.permissions,
    pageBlocked: workspace.pageBlocked,
    draftLines: [],
    reasoning: "",
    activeScopeItems: workspace.activeScopeItems,
    selectedRevision,
    jobPlanVersion: workspace.jobPlanVersion,
    expectedJobPlanVersion,
    isPending: false,
    paymentImpactJson: changeOrder.paymentImpactJson,
  });

  const href = `${jobChangeOrdersPath(workspace.jobId)}?focus=${changeOrder.id}`;

  return {
    id: changeOrder.id,
    jobId: workspace.jobId,
    href,
    title: `CO-${String(changeOrder.number).padStart(3, "0")} · ${changeOrder.title}`,
    customerLabel: input.customerLabel,
    status: changeOrder.status,
    applicationStatus,
    lifecycleReadinessLabel: readiness.lifecycleReadinessLabel,
    officeNextStep: readiness.officeNextStep,
    priceDeltaCents: changeOrder.priceDeltaCents,
    priceDeltaLabel: formatCents(changeOrder.priceDeltaCents),
    acceptedAt: input.acceptedAt,
    approvedAt: changeOrder.approvedAt,
    lastSentEmailAt: input.lastSentEmailAt,
    appliedAt: changeOrder.appliedAt,
    pageBlocked: workspace.pageBlocked,
    pageBlockedMessage: workspace.pageBlockedMessage,
    jobPlanVersion: readiness.jobPlanVersion,
    expectedJobPlanVersion: readiness.expectedJobPlanVersion,
    send: readiness.send,
    apply: readiness.apply,
    staffAccept: readiness.staffAccept,
    sendBlockers: readiness.sendBlockers.map((blocker) => ({
      title: blocker.title,
      explanation: blocker.explanation,
      actionLabel: blocker.actionLabel,
    })),
    applyErrorSummary: readiness.applyErrorSummary,
    commercialStatusLabel: readiness.commercialStatusLabel,
    paymentPlanStatusLabel: readiness.paymentPlanStatusLabel,
    workImpactStatusLabel: readiness.workImpactStatusLabel,
    requiresCustomerApproval: readiness.requiresCustomerApproval,
    customerRequestSummary: input.customerRequestSummary,
    primaryAction: resolveChangeOrderWorkstationPrimaryAction({
      status: changeOrder.status,
      applicationStatus,
      send: readiness.send,
      apply: readiness.apply,
      staffAccept: readiness.staffAccept,
      expectedJobPlanVersion: readiness.expectedJobPlanVersion,
      href,
    }),
  };
}

export async function loadChangeOrderWorkstationPanel(input: {
  organizationId: string;
  role: StaffRole;
  changeOrderId: string;
  jobId: string;
}): Promise<ChangeOrderWorkstationPanelDto | null> {
  const changeOrderId = input.changeOrderId.trim();
  const jobId = input.jobId.trim();
  if (!changeOrderId || !jobId) return null;

  const workspace = await loadChangeOrderWorkspace({
    organizationId: input.organizationId,
    jobId,
    role: input.role,
    focusChangeOrderId: changeOrderId,
  });
  if (!workspace) return null;

  const changeOrder = workspace.changeOrders.find((row) => row.id === changeOrderId);
  if (!changeOrder) return null;

  const meta = await db.changeOrder.findFirst({
    where: {
      id: changeOrderId,
      organizationId: input.organizationId,
      jobId,
    },
    select: {
      lastSentEmailAt: true,
      acceptedAt: true,
      quote: {
        select: {
          customer: { select: { displayName: true } },
          lead: { select: { title: true } },
        },
      },
      checkpoints: {
        where: { kind: ChangeOrderCheckpointKind.REQUEST_CHANGES },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { staffOnlyJson: true },
      },
    },
  });

  const customerLabel =
    meta?.quote.customer?.displayName ?? meta?.quote.lead?.title ?? null;

  return buildChangeOrderWorkstationPanelDto({
    workspace,
    changeOrder,
    customerLabel,
    customerRequestSummary: extractCheckpointMessage(meta?.checkpoints[0]?.staffOnlyJson),
    lastSentEmailAt: meta?.lastSentEmailAt?.toISOString() ?? null,
    acceptedAt: meta?.acceptedAt?.toISOString() ?? null,
  });
}
