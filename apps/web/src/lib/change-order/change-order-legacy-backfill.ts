import type { ChangeOrderApplicationStatus, ChangeOrderStatus } from "@prisma/client";
import { parseChangeOrderExecutionDelta } from "@/lib/change-order/execution-delta-schema";

export type LegacyAcceptedChangeOrderReviewInput = {
  status: ChangeOrderStatus;
  applicationStatus: ChangeOrderApplicationStatus;
  executionDeltaJson: unknown;
};

export type LegacyAcceptedChangeOrderReviewResult = {
  shouldFlagForReview: boolean;
  reason: string | null;
};

function getBooleanPayload(payload: Record<string, unknown> | undefined, key: string, fallback: boolean): boolean {
  const value = payload?.[key];
  return typeof value === "boolean" ? value : fallback;
}

export function classifyLegacyAcceptedChangeOrderForReview(
  input: LegacyAcceptedChangeOrderReviewInput,
): LegacyAcceptedChangeOrderReviewResult {
  if (input.status !== "ACCEPTED" || input.applicationStatus !== "NOT_APPLIED") {
    return { shouldFlagForReview: false, reason: null };
  }

  const parsed = parseChangeOrderExecutionDelta(input.executionDeltaJson);
  if (!parsed.ok) {
    return { shouldFlagForReview: false, reason: null };
  }

  const meta = parsed.proposal.meta;
  const isLegacyBackfill =
    meta?.source === "migration-backfill" || meta?.legacyScopeReconciliation === true;
  if (!isLegacyBackfill) {
    return { shouldFlagForReview: false, reason: null };
  }

  const hasExecutionRelevantAdd = parsed.proposal.operations.some(
    (operation) =>
      operation.type === "ADD_SCOPE_ITEM" &&
      getBooleanPayload(operation.payload, "executionRelevant", true),
  );
  const hasAddTask = parsed.proposal.operations.some((operation) => operation.type === "ADD_TASK");

  if (hasExecutionRelevantAdd && !hasAddTask) {
    return {
      shouldFlagForReview: true,
      reason:
        "Legacy accepted Change Order has execution-relevant scope without task coverage. Office review required before apply.",
    };
  }

  return { shouldFlagForReview: false, reason: null };
}

export function buildLegacyAcceptedReviewErrorJson(reason: string) {
  return {
    classification: "LEGACY_BACKFILL",
    errors: [reason],
    recordedAt: new Date().toISOString(),
  };
}
