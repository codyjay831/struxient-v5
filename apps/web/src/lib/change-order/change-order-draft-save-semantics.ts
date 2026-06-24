import type { ChangeOrderExecutionDeltaProposal } from "@/lib/change-order/execution-delta-schema";
import { changeOrderExecutionDeltaToJson } from "@/lib/change-order/execution-delta-schema";
import type { ChangeOrderLineDraft } from "@/lib/change-order-flow";
import type { ChangeOrderLifecycleReadiness } from "@/lib/change-order/change-order-execution-projection";

export const MIXED_DRAFT_SAVE_BLOCKED_MESSAGE =
  "Commercial scope and work impact both changed. Save commercial changes first, then save execution impact.";

export const UNSAVED_EXECUTION_IMPACT_BANNER =
  "You have unsaved work impact changes. Save execution impact before sending or leaving this page.";

export function getUnsavedDraftChangesReason(input: {
  commercialChanged: boolean;
  executionChanged: boolean;
}): string | null {
  if (input.commercialChanged && input.executionChanged) {
    return MIXED_DRAFT_SAVE_BLOCKED_MESSAGE;
  }
  if (input.commercialChanged) {
    return "Save commercial changes before sending.";
  }
  if (input.executionChanged) {
    return "Save execution impact before sending.";
  }
  return null;
}

export type DraftUpdateSaveIntent =
  | { kind: "blocked_mixed"; message: string }
  | { kind: "commercial_only" }
  | { kind: "execution_only" }
  | { kind: "unchanged" };

function normalizeLine(line: ChangeOrderLineDraft): ChangeOrderLineDraft {
  return {
    operation: line.operation,
    sourceJobScopeItemId: line.sourceJobScopeItemId ?? null,
    description: line.description.trim(),
    quantity: line.quantity.trim(),
    unitPriceCents: line.unitPriceCents ?? null,
    priceDeltaCents: line.priceDeltaCents ?? 0,
    executionRelevant: line.executionRelevant !== false,
  };
}

export function commercialDraftLinesEqual(
  left: ChangeOrderLineDraft[],
  right: ChangeOrderLineDraft[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((line, index) => {
    const a = normalizeLine(line);
    const b = normalizeLine(right[index]!);
    return JSON.stringify(a) === JSON.stringify(b);
  });
}

export function commercialDraftChanged(input: {
  baselineReasoning: string;
  baselineLines: ChangeOrderLineDraft[];
  reasoning: string;
  lines: ChangeOrderLineDraft[];
}): boolean {
  if (input.reasoning.trim() !== input.baselineReasoning.trim()) return true;
  return !commercialDraftLinesEqual(input.baselineLines, input.lines);
}

export function executionDeltaProposalsEqual(
  left: ChangeOrderExecutionDeltaProposal | null,
  right: ChangeOrderExecutionDeltaProposal | null,
): boolean {
  if (left == null && right == null) return true;
  if (left == null || right == null) return false;
  return (
    JSON.stringify(changeOrderExecutionDeltaToJson(left)) ===
    JSON.stringify(changeOrderExecutionDeltaToJson(right))
  );
}

export function executionDraftChanged(input: {
  baselineProposal: ChangeOrderExecutionDeltaProposal | null;
  proposal: ChangeOrderExecutionDeltaProposal | null;
}): boolean {
  return !executionDeltaProposalsEqual(input.baselineProposal, input.proposal);
}

export function resolveDraftUpdateSaveIntent(input: {
  commercialChanged: boolean;
  executionChanged: boolean;
}): DraftUpdateSaveIntent {
  if (input.commercialChanged && input.executionChanged) {
    return { kind: "blocked_mixed", message: MIXED_DRAFT_SAVE_BLOCKED_MESSAGE };
  }
  if (!input.commercialChanged && !input.executionChanged) {
    return { kind: "unchanged" };
  }
  if (input.commercialChanged) {
    return { kind: "commercial_only" };
  }
  return { kind: "execution_only" };
}

export function deriveChangeOrderOfficeNextStep(input: {
  lifecycleReadiness: ChangeOrderLifecycleReadiness;
  requiresCustomerApproval: boolean;
}): string {
  switch (input.lifecycleReadiness) {
    case "DRAFT_INCOMPLETE":
      return "Complete commercial scope lines and reason.";
    case "EXECUTION_NEEDS_REVIEW":
      return "Review work impact and confirm suggested tasks before sending.";
    case "READY_TO_SEND":
      return input.requiresCustomerApproval
        ? "Send to the customer for approval when commercial and work impact are saved."
        : "Send or mark accepted when commercial and work impact are saved.";
    case "SENT_WAITING":
      return "Wait for customer acceptance or record internal acceptance if allowed.";
    case "CUSTOMER_REQUESTED_CHANGES":
      return "Update commercial scope and work impact, then save each section separately.";
    case "ACCEPTED_READY_TO_APPLY":
      return "Apply to the job when work impact passes validation.";
    case "ACCEPTED_NEEDS_EXECUTION_REVIEW":
      return "The job plan changed — review work impact before applying.";
    case "APPLY_FAILED":
      return "Review the failure summary and work impact before retrying apply.";
    case "APPLIED":
      return "No action required — this Change Order is applied.";
  }
}

export function isChangeOrderCommercialEditable(status: import("@prisma/client").ChangeOrderStatus): boolean {
  return (
    status === "DRAFT" || status === "CUSTOMER_REQUESTED_CHANGES"
  );
}
