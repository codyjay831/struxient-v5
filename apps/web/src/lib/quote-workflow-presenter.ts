import { JobStatus, QuoteStatus } from "@prisma/client";
import {
  getQuoteReadiness,
  type QuoteReadiness,
  type QuoteReadinessAction,
  type QuoteReadinessInput,
} from "@/lib/quote-readiness";
import type {
  QuoteActivationBlockReason,
  QuoteJobActivationReadiness,
} from "@/lib/quote-job-activation-readiness";

/**
 * Workspace-facing quote lifecycle states for the commercial quote workspace.
 * Pure / deterministic — safe to unit test.
 */
export type QuoteWorkflowState =
  | "DRAFT"
  | "BLOCKED_FROM_SEND"
  | "READY_TO_SEND"
  | "SENT_PENDING_APPROVAL"
  | "APPROVED_EXECUTION_NEEDED"
  | "READY_FOR_JOB_ACTIVATION"
  | "JOB_ACTIVATED"
  | "ARCHIVED";

export type QuoteWorkflowReadinessItem = {
  label: string;
  satisfied: boolean;
  /** Optional tab or href hint for fixing unsatisfied items. */
  fixTab?: "scope" | "payments" | "context" | "sendaccept";
};

export type QuoteWorkflowBlocker = {
  message: string;
  fixTab?: "scope" | "payments" | "context" | "sendaccept";
};

export type QuoteWorkflowActivityItem = {
  kind: "send" | "approval";
  label: string;
  atIso: string;
  atLabel: string;
};

export type QuoteWorkflowPresentation = {
  workflowState: QuoteWorkflowState;
  statusLabel: string;
  primaryHeadline: string;
  primaryMessage: string;
  primaryAction: QuoteReadinessAction | null;
  secondaryActions: QuoteReadinessAction[];
  blockers: QuoteWorkflowBlocker[];
  readinessItems: QuoteWorkflowReadinessItem[];
  isCommercialLocked: boolean;
  canSend: boolean;
  canApprove: boolean;
  canBuildExecutionPlan: boolean;
  canActivateJob: boolean;
  activityItems: QuoteWorkflowActivityItem[];
  /** Underlying readiness for progress/badge tone compatibility. */
  readiness: QuoteReadiness;
};

export type QuoteWorkflowPresenterInput = {
  quote: QuoteReadinessInput["quote"] & {
    jobsiteMissing: boolean;
  };
  job: QuoteReadinessInput["job"];
  activationReadiness: QuoteJobActivationReadiness;
  isCommercialEditable: boolean;
  paymentScheduleItemCount: number;
  openScopeDecisionCount: number;
  latestSendAt?: Date | null;
  latestApprovalAt?: Date | null;
  revisionDriftSinceLastProof?: boolean;
  activityItems: QuoteWorkflowActivityItem[];
};

const STATE_LABEL: Record<QuoteWorkflowState, string> = {
  DRAFT: "Draft quote",
  BLOCKED_FROM_SEND: "Draft — not ready to send",
  READY_TO_SEND: "Ready to send",
  SENT_PENDING_APPROVAL: "Waiting for customer approval",
  APPROVED_EXECUTION_NEEDED: "Approved — execution plan needed",
  READY_FOR_JOB_ACTIVATION: "Ready to activate job",
  JOB_ACTIVATED: "Job activated",
  ARCHIVED: "Archived",
};

function draftSendBlockers(input: QuoteWorkflowPresenterInput): QuoteWorkflowBlocker[] {
  const blockers: QuoteWorkflowBlocker[] = [];
  if (input.quote.lineItemCount === 0) {
    blockers.push({ message: "Add at least one scope line item.", fixTab: "scope" });
  }
  if (input.quote.jobsiteMissing) {
    blockers.push({ message: "Add a jobsite address.", fixTab: "context" });
  }
  if (input.paymentScheduleItemCount === 0) {
    blockers.push({ message: "Define payment terms and milestones.", fixTab: "payments" });
  }
  if (input.openScopeDecisionCount > 0) {
    blockers.push({
      message: `Resolve ${input.openScopeDecisionCount} open scope ${input.openScopeDecisionCount === 1 ? "decision" : "decisions"}.`,
      fixTab: "scope",
    });
  }
  return blockers;
}

function mapWorkflowState(
  input: QuoteWorkflowPresenterInput,
  readiness: QuoteReadiness,
): QuoteWorkflowState {
  if (readiness.state === "ARCHIVED") return "ARCHIVED";
  if (readiness.state === "JOB_ACTIVE") return "JOB_ACTIVATED";
  if (readiness.state === "APPROVED_READY_TO_ACTIVATE") return "READY_FOR_JOB_ACTIVATION";
  if (readiness.state === "APPROVED_NEEDS_EXECUTION_REVIEW") {
    return "APPROVED_EXECUTION_NEEDED";
  }
  if (readiness.state === "SENT_AWAITING_CUSTOMER") return "SENT_PENDING_APPROVAL";

  if (
    readiness.state === "DRAFT_IN_PROGRESS" ||
    readiness.state === "EMPTY_DRAFT"
  ) {
    const blockers = draftSendBlockers(input);
    if (blockers.length > 0) return "BLOCKED_FROM_SEND";
    if (readiness.state === "EMPTY_DRAFT") return "BLOCKED_FROM_SEND";
    return "READY_TO_SEND";
  }

  return "DRAFT";
}

function buildReadinessItems(input: QuoteWorkflowPresenterInput): QuoteWorkflowReadinessItem[] {
  const items: QuoteWorkflowReadinessItem[] = [
    {
      label: "Scope line items",
      satisfied: input.quote.lineItemCount > 0,
      fixTab: "scope",
    },
    {
      label: "Jobsite address",
      satisfied: !input.quote.jobsiteMissing,
      fixTab: "context",
    },
    {
      label: "Payment schedule",
      satisfied: input.paymentScheduleItemCount > 0,
      fixTab: "payments",
    },
  ];

  if (input.latestSendAt) {
    items.push({ label: "Proposal sent", satisfied: true });
  }
  if (input.latestApprovalAt) {
    items.push({ label: "Customer approval recorded", satisfied: true });
  }

  const taskCount = input.activationReadiness.totalTasksToActivate;
  if (input.quote.status === QuoteStatus.APPROVED) {
    items.push({
      label: "Execution plan",
      satisfied: taskCount > 0 && input.activationReadiness.ready,
      fixTab: "scope",
    });
  }

  return items;
}

function buildHeadlineAndMessage(
  state: QuoteWorkflowState,
  input: QuoteWorkflowPresenterInput,
  readiness: QuoteReadiness,
): { primaryHeadline: string; primaryMessage: string } {
  switch (state) {
    case "ARCHIVED":
      return {
        primaryHeadline: STATE_LABEL.ARCHIVED,
        primaryMessage: readiness.description,
      };
    case "JOB_ACTIVATED":
      return {
        primaryHeadline: STATE_LABEL.JOB_ACTIVATED,
        primaryMessage: "Sold work is on the job board.",
      };
    case "READY_FOR_JOB_ACTIVATION":
      return {
        primaryHeadline: STATE_LABEL.READY_FOR_JOB_ACTIVATION,
        primaryMessage:
          "Commercial terms are approved and the work plan is ready. Activate the job to start scheduling work.",
      };
    case "APPROVED_EXECUTION_NEEDED":
      if (input.activationReadiness.totalTasksToActivate === 0) {
        return {
          primaryHeadline: "Execution plan needed",
          primaryMessage:
            "This quote is approved, but no work plan exists yet. Build the execution plan before activating the job.",
        };
      }
      return {
        primaryHeadline: STATE_LABEL.APPROVED_EXECUTION_NEEDED,
        primaryMessage:
          "The customer accepted the quote. Build and accept the work plan before activating the job.",
      };
    case "SENT_PENDING_APPROVAL":
      return {
        primaryHeadline: STATE_LABEL.SENT_PENDING_APPROVAL,
        primaryMessage: readiness.showsRevisionDrift
          ? readiness.description
          : "Waiting for customer approval. Share the proposal link or record approval when they agree.",
      };
    case "READY_TO_SEND":
      return {
        primaryHeadline: STATE_LABEL.READY_TO_SEND,
        primaryMessage: "Scope, price, and payment terms are complete. Send the proposal when ready.",
      };
    case "BLOCKED_FROM_SEND":
      return {
        primaryHeadline: "Finish before sending",
        primaryMessage:
          "Complete scope, pricing, jobsite, and payment terms before sending this proposal.",
      };
    case "DRAFT":
    default:
      return {
        primaryHeadline: readiness.label,
        primaryMessage: readiness.description,
      };
  }
}

function activationBlockersToWorkflowBlockers(
  reasons: QuoteActivationBlockReason[],
): QuoteWorkflowBlocker[] {
  return reasons
    .filter((r) => r.code !== "QUOTE_NOT_APPROVED")
    .map((r) => ({
      message: r.message,
      fixTab:
        r.code === "NO_EXECUTION_TASKS" ||
        r.code === "PLAN_NOT_ACCEPTED" ||
        r.code === "PLAN_STALE" ||
        r.code === "EXECUTION_SCOPE_NOT_COVERED"
          ? "scope"
          : r.code.startsWith("PAYMENT")
            ? "payments"
            : undefined,
    }));
}

/**
 * Central workspace presenter — composes canonical readiness + activation
 * readiness into one UI-facing lifecycle story.
 */
export function getQuoteWorkflowPresentation(
  input: QuoteWorkflowPresenterInput,
): QuoteWorkflowPresentation {
  const readiness = getQuoteReadiness({
    quote: input.quote,
    job: input.job,
    activationReadiness: {
      ready: input.activationReadiness.ready,
      totalTasksToActivate: input.activationReadiness.totalTasksToActivate,
      needsAttentionLineCount: 0,
      anomalyLineCount: 0,
    },
    latestSendAt: input.latestSendAt,
    latestApprovalAt: input.latestApprovalAt,
    revisionDriftSinceLastProof: input.revisionDriftSinceLastProof,
  });

  const workflowState = mapWorkflowState(input, readiness);
  const { primaryHeadline, primaryMessage } = buildHeadlineAndMessage(
    workflowState,
    input,
    readiness,
  );

  const draftBlockers = draftSendBlockers(input);
  const activationBlockers = activationBlockersToWorkflowBlockers(
    input.activationReadiness.blockReasons,
  );

  let blockers: QuoteWorkflowBlocker[] = [];
  if (workflowState === "BLOCKED_FROM_SEND") {
    blockers = draftBlockers;
  } else if (
    workflowState === "APPROVED_EXECUTION_NEEDED" &&
    !input.activationReadiness.ready
  ) {
    blockers = activationBlockers;
  }

  const secondaryActions: QuoteReadinessAction[] = [];
  if (readiness.secondaryAction) {
    secondaryActions.push(readiness.secondaryAction);
  }

  const isCommercialLocked = !input.isCommercialEditable;
  const canSend = readiness.primaryAction?.kind === "SEND_QUOTE";
  const canApprove = readiness.primaryAction?.kind === "MARK_APPROVED";
  const canBuildExecutionPlan =
    workflowState === "APPROVED_EXECUTION_NEEDED" ||
    readiness.primaryAction?.kind === "OPEN_EXECUTION_REVIEW" ||
    readiness.secondaryAction?.kind === "OPEN_EXECUTION_REVIEW";
  const canActivateJob =
    workflowState === "READY_FOR_JOB_ACTIVATION" ||
    readiness.primaryAction?.kind === "ACTIVATE_JOB";

  return {
    workflowState,
    statusLabel: STATE_LABEL[workflowState],
    primaryHeadline,
    primaryMessage,
    primaryAction: readiness.primaryAction,
    secondaryActions,
    blockers,
    readinessItems: buildReadinessItems(input),
    isCommercialLocked,
    canSend,
    canApprove,
    canBuildExecutionPlan,
    canActivateJob,
    activityItems: input.activityItems,
    readiness,
  };
}

/** True when an active job exists (convenience for loaders). */
export function quoteHasActiveJob(
  job: { id: string; status: JobStatus } | null,
): boolean {
  return Boolean(job && job.status === JobStatus.ACTIVE);
}
