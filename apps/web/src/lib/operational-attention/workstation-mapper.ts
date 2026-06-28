import type { WorkstationWorkItem } from "@/lib/workstation-query";
import type { OperationalAttentionItem } from "./types";

export type OperationalAttentionWorkstationMappingResult =
  | { ok: true; item: WorkstationWorkItem }
  | { ok: false; reason: "UNREADABLE" | "MISSING_WORKSTATION_COMPAT" | "MISSING_RANK" };

export function mapAttentionItemToWorkstationWorkItem(
  item: OperationalAttentionItem,
): WorkstationWorkItem | null {
  const result = mapAttentionItemToWorkstationWorkItemResult(item);
  return result.ok ? result.item : null;
}

export function mapAttentionItemToWorkstationWorkItemResult(
  item: OperationalAttentionItem,
): OperationalAttentionWorkstationMappingResult {
  if (!item.visibility.canRead) {
    return { ok: false, reason: "UNREADABLE" };
  }

  if (!item.workstationCompat) {
    return { ok: false, reason: "MISSING_WORKSTATION_COMPAT" };
  }

  if (!item.rank) {
    return { ok: false, reason: "MISSING_RANK" };
  }

  const compat = item.workstationCompat;
  const isRedacted = item.visibility.redacted === true;

  return {
    ok: true,
    item: {
      id: compat.workstationId ?? item.id,
      kind: compat.workstationKind,
      title: item.title,
      subtitle: compat.subtitle,
      contextLine: compat.contextLine,
      scopeLabel: compat.scopeLabel,
      addressLine: compat.addressLine,
      ageLabel: compat.ageLabel,
      valueLabel: isRedacted ? undefined : compat.valueLabel,
      typeLabel: compat.typeLabel,
      status: compat.status,
      priority: item.rank.priority,
      group: item.rank.group,
      lens: item.rank.lens,
      lane: item.rank.lane,
      withinLaneRank: item.rank.withinLaneRank,
      filterCategory: compat.filterCategory,
      reason: compat.reason ?? item.reason,
      nextStep: compat.nextStep ?? item.safeNextAction.label,
      recordId: item.sourceId,
      parentRecordId: compat.parentRecordId,
      parentLabel: compat.parentLabel,
      href: compat.href ?? item.safeNextAction.href,
      leadAnchorId: compat.leadAnchorId,
      updatedAt: item.updatedAt,
      assignedUserId: compat.assignedUserId,
      dueAt: compat.dueAt ?? item.dueAt,
      scheduledStartAt: compat.scheduledStartAt,
      isBlocked: compat.isBlocked,
      isWaitingOnSignals: compat.isWaitingOnSignals,
      missingSignals: compat.missingSignals,
      signalId: compat.signalId,
      workflow: compat.workflow,
      executionHealthState: compat.executionHealthState,
      executionHealthHeadline: compat.executionHealthHeadline,
      paymentHoldLabel: isRedacted ? undefined : compat.paymentHoldLabel,
      actionKind: compat.actionKind,
      actionLabel: compat.actionLabel,
      actionIssueId: compat.actionIssueId,
      actionTaskId: compat.actionTaskId,
    },
  };
}
