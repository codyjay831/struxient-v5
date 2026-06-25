import {
  CHANGE_ORDER_EXECUTION_DELTA_SCHEMA_VERSION,
  type ChangeOrderExecutionDeltaProposal,
} from "@/lib/change-order/execution-delta-schema";
import {
  buildDefaultExecutionDeltaFromChangeOrderLines,
  type ChangeOrderLineForExecutionDelta,
} from "@/lib/change-order/execution-delta-build";

export const NO_WORK_IMPACT_CONFIRMED_META_KEY = "noWorkImpactConfirmed";
export const NO_WORK_IMPACT_CONFIRMED_AT_META_KEY = "noWorkImpactConfirmedAt";

export function parseNoWorkImpactConfirmed(meta: unknown): boolean {
  if (!meta || typeof meta !== "object") return false;
  return (meta as Record<string, unknown>)[NO_WORK_IMPACT_CONFIRMED_META_KEY] === true;
}

export function buildNoWorkImpactExecutionDelta(params: {
  baseJobPlanVersion: number;
  changeOrderId?: string;
  number?: number;
  priceDeltaCents: number;
  reasoning: string;
  lines: ChangeOrderLineForExecutionDelta[];
  confirmedAt?: string;
}): ChangeOrderExecutionDeltaProposal {
  const confirmedAt = params.confirmedAt ?? new Date().toISOString();
  const lines = params.lines.map((line) => ({
    ...line,
    executionRelevant: false,
  }));
  const delta = buildDefaultExecutionDeltaFromChangeOrderLines({
    baseJobPlanVersion: params.baseJobPlanVersion,
    changeOrderId: params.changeOrderId,
    number: params.number,
    priceDeltaCents: params.priceDeltaCents,
    reasoning: params.reasoning,
    lines,
    skipLegacyPaymentOperation: true,
  });
  return {
    ...delta,
    summary: "Price-only Change Order — no job tasks will be added, changed, or canceled.",
    meta: {
      ...delta.meta,
      [NO_WORK_IMPACT_CONFIRMED_META_KEY]: true,
      [NO_WORK_IMPACT_CONFIRMED_AT_META_KEY]: confirmedAt,
    },
  };
}

export function clearNoWorkImpactConfirmation(
  proposal: ChangeOrderExecutionDeltaProposal,
): ChangeOrderExecutionDeltaProposal {
  if (!proposal.meta) return proposal;
  const nextMeta = { ...proposal.meta };
  delete nextMeta[NO_WORK_IMPACT_CONFIRMED_META_KEY];
  delete nextMeta[NO_WORK_IMPACT_CONFIRMED_AT_META_KEY];
  return {
    ...proposal,
    meta: Object.keys(nextMeta).length > 0 ? nextMeta : undefined,
  };
}
