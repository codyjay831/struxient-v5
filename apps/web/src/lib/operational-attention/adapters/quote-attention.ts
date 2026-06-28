import { StaffRole } from "@prisma/client";
import {
  buildQuoteRecordActionState,
  toEmbeddedWorkflow,
  type WorkItemEmbeddedWorkflow,
} from "@/lib/record-workflow-surface";
import type { QuoteReadiness } from "@/lib/quote-readiness";
import type { OperationalAttentionItem, OperationalAttentionRank } from "../types";

/** Precomputed Workstation-facing copy from the query layer — preserves overlay priority. */
export type QuoteAttentionWorkstationCopy = {
  status: string;
  reason: string;
  nextStep: string;
};

export type QuoteAttentionChangeRequestInput = {
  requiresVisit: boolean;
  draftRevisionLineItemCount?: number | null;
};

export type QuoteAttentionInput = {
  quoteId: string;
  title: string;
  subtitle?: string;
  customerId: string | null;
  leadId: string | null;
  parentRecordId?: string;
  parentLabel?: string;
  href: string;
  updatedAt: Date;
  readiness: QuoteReadiness;
  rank: OperationalAttentionRank;
  status: string;
  reason?: string;
  contextLine?: string;
  scopeLabel?: string | null;
  addressLine?: string | null;
  ageLabel?: string | null;
  valueLabel?: string | null;
  isCustomerAccepted?: boolean;
  openChangeRequest?: QuoteAttentionChangeRequestInput | null;
  /** When provided, skips re-deriving workflow inside the adapter. */
  workflow?: WorkItemEmbeddedWorkflow;
  /** When provided, overrides adapter-derived status/reason/nextStep for exact queue parity. */
  workstationCopy?: QuoteAttentionWorkstationCopy;
  visibility?: OperationalAttentionItem["visibility"];
};

function quoteSeverity(input: QuoteAttentionInput): OperationalAttentionItem["severity"] {
  if (input.rank.priority === "critical") return "critical";
  if (
    input.readiness.state === "APPROVED_NEEDS_EXECUTION_REVIEW" ||
    input.readiness.showsRevisionDrift
  ) {
    return "blocking";
  }
  return "attention";
}

function quoteAttentionKind(input: QuoteAttentionInput): OperationalAttentionItem["kind"] {
  if (input.openChangeRequest || input.readiness.showsRevisionDrift) {
    return "quote_revision";
  }
  return "quote_activation";
}

function statusForQuote(input: QuoteAttentionInput): string {
  const changeRequest = input.openChangeRequest;
  if (!changeRequest) return input.status;
  if (changeRequest.draftRevisionLineItemCount != null) {
    return changeRequest.draftRevisionLineItemCount > 0
      ? "Revision ready to send"
      : "Revision draft in progress";
  }
  return "Customer requested changes";
}

function reasonForQuote(input: QuoteAttentionInput, workflowReason: string): string {
  const changeRequest = input.openChangeRequest;
  if (changeRequest) {
    return changeRequest.requiresVisit
      ? "Customer requested changes and follow-up visit may be required."
      : "Customer requested changes on this quote.";
  }
  if (
    input.readiness.state === "APPROVED_READY_TO_ACTIVATE" ||
    input.readiness.state === "APPROVED_NEEDS_EXECUTION_REVIEW"
  ) {
    return "Approved quote is waiting for job setup.";
  }
  if (input.isCustomerAccepted) {
    return "Accepted by customer via portal.";
  }
  return input.reason ?? workflowReason;
}

function nextStepForQuote(input: QuoteAttentionInput, workflowLabel: string | undefined): string {
  const changeRequest = input.openChangeRequest;
  if (changeRequest) {
    return changeRequest.draftRevisionLineItemCount != null
      ? "Continue revision draft."
      : "Create revision draft.";
  }
  return workflowLabel ?? "Review quote.";
}

export function buildQuoteOperationalAttentionItems(
  input: QuoteAttentionInput,
): OperationalAttentionItem[] {
  const workflow =
    input.workflow ??
    toEmbeddedWorkflow(
      buildQuoteRecordActionState({
        quoteId: input.quoteId,
        title: input.title,
        subtitle: input.subtitle,
        customerId: input.customerId,
        leadId: input.leadId,
        readiness: input.readiness,
      }),
    );
  const workstationStatus = input.workstationCopy?.status ?? statusForQuote(input);
  const workstationReason = input.workstationCopy?.reason ?? reasonForQuote(input, workflow.reason);
  const workstationNextStep =
    input.workstationCopy?.nextStep ?? nextStepForQuote(input, workflow.nextAction?.label);
  const reason = workstationReason;
  const nextStep = workstationNextStep;
  const safeNextAction = input.openChangeRequest
    ? {
        label: nextStep,
        href: input.href,
        actionKind:
          input.openChangeRequest.draftRevisionLineItemCount != null
            ? "CONTINUE_REVISION_DRAFT"
            : "CREATE_REVISION_DRAFT",
      }
    : {
        label: workflow.nextAction?.label ?? "Review quote.",
        href: workflow.nextAction?.href ?? input.href,
        actionKind: workflow.nextAction?.type,
        disabledReason: workflow.nextAction?.disabledReason,
      };

  return [
    {
      id: `${quoteAttentionKind(input)}:${input.quoteId}`,
      kind: quoteAttentionKind(input),
      severity: quoteSeverity(input),
      ownerRoles: [StaffRole.OWNER, StaffRole.ADMIN, StaffRole.OFFICE],
      sourceType: "Quote",
      sourceId: input.quoteId,
      quoteId: input.quoteId,
      customerId: input.customerId ?? undefined,
      title: input.title,
      reason,
      safeNextAction,
      visibility: input.visibility ?? { canRead: true, canAct: true },
      updatedAt: input.updatedAt,
      rank: input.rank,
      workstationCompat: {
        workstationId: `quote-${input.quoteId}`,
        workstationKind: "quote",
        filterCategory: "quotes",
        status: workstationStatus,
        reason: workstationReason,
        nextStep: workstationNextStep,
        subtitle: input.subtitle,
        contextLine: input.contextLine,
        scopeLabel: input.scopeLabel,
        addressLine: input.addressLine,
        ageLabel: input.ageLabel,
        valueLabel: input.valueLabel,
        typeLabel: "Quote",
        parentRecordId: input.parentRecordId,
        parentLabel: input.parentLabel,
        href: input.href,
        leadAnchorId: input.leadId,
        workflow,
      },
    },
  ];
}
