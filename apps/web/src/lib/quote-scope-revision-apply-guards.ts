import { JobScopeItemStatus, JobTaskStatus } from "@prisma/client";
import { validateScopeRevisionPaymentImpact } from "@/lib/quote-scope-revision-payment-policy";
import { normalizeSignalKey, toNormalizedSignalSet } from "@/lib/signal-key";

export type ScopeRevisionApplyScopeItem = {
  id: string;
  executionRelevant: boolean;
  status: JobScopeItemStatus;
};

export type ScopeRevisionApplyTask = {
  id: string;
  status: JobTaskStatus;
  hardSignal: boolean;
  requiresSignals: string[];
  providesSignals: string[];
  jobScopeItemIds: string[];
};

export type ScopeRevisionApplyGuardInput = {
  priceDeltaCents: number;
  hasApprovedPaymentImpactOperationInTx: boolean;
  scopeItems: ScopeRevisionApplyScopeItem[];
  tasks: ScopeRevisionApplyTask[];
};

export type ScopeRevisionApplyGuardResult = {
  ok: boolean;
  errors: string[];
};

/**
 * Shared invariant checks for post-activation scope-revision apply.
 */
export function validateScopeRevisionApplyGuards(
  input: ScopeRevisionApplyGuardInput,
): ScopeRevisionApplyGuardResult {
  const errors: string[] = [];

  const paymentCheck = validateScopeRevisionPaymentImpact({
    priceDeltaCents: input.priceDeltaCents,
    hasApprovedPaymentImpactOperationInTx: input.hasApprovedPaymentImpactOperationInTx,
  });
  if (!paymentCheck.ok && paymentCheck.error) {
    errors.push(paymentCheck.error);
  }

  const activeExecutionRelevantScopeIds = new Set(
    input.scopeItems
      .filter((item) => item.status === JobScopeItemStatus.ACTIVE && item.executionRelevant)
      .map((item) => item.id),
  );

  const coveredScopeIds = new Set<string>();
  for (const task of input.tasks) {
    if (task.status === JobTaskStatus.CANCELED) continue;
    for (const scopeId of task.jobScopeItemIds) {
      if (activeExecutionRelevantScopeIds.has(scopeId)) {
        coveredScopeIds.add(scopeId);
      }
    }
  }

  const uncoveredScopeIds = [...activeExecutionRelevantScopeIds].filter(
    (scopeId) => !coveredScopeIds.has(scopeId),
  );
  if (uncoveredScopeIds.length > 0) {
    errors.push(
      `Active execution-relevant scope items are not covered by non-canceled tasks: ${uncoveredScopeIds.join(", ")}`,
    );
  }

  const removedOrSupersededScopeIds = new Set(
    input.scopeItems
      .filter(
        (item) =>
          item.status === JobScopeItemStatus.REMOVED ||
          item.status === JobScopeItemStatus.SUPERSEDED,
      )
      .map((item) => item.id),
  );
  const invalidFutureTasks = input.tasks.filter((task) => {
    if (task.status === JobTaskStatus.DONE || task.status === JobTaskStatus.CANCELED) return false;
    return (
      task.jobScopeItemIds.length > 0 &&
      task.jobScopeItemIds.every((scopeId) => removedOrSupersededScopeIds.has(scopeId))
    );
  });
  if (invalidFutureTasks.length > 0) {
    errors.push(
      `Future tasks must be canceled or relinked when all linked scope is removed/superseded: ${invalidFutureTasks
        .map((task) => task.id)
        .join(", ")}`,
    );
  }

  const activeTasks = input.tasks.filter((task) => task.status !== JobTaskStatus.CANCELED);
  const providedSignals = toNormalizedSignalSet(activeTasks.flatMap((task) => task.providesSignals));
  const hardSignalOrphans: string[] = [];
  for (const task of activeTasks) {
    if (!task.hardSignal) continue;
    for (const required of task.requiresSignals) {
      if (!providedSignals.has(normalizeSignalKey(required))) {
        hardSignalOrphans.push(`${task.id}:${required}`);
      }
    }
  }
  if (hardSignalOrphans.length > 0) {
    errors.push(
      `Cancels/relinks would orphan hard-signal dependencies for active tasks: ${hardSignalOrphans.join(", ")}`,
    );
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

