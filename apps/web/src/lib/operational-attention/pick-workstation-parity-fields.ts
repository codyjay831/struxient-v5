import type { WorkstationWorkItem } from "@/lib/workstation-query";

/** Compare the full quote/CO Workstation DTO surface for integration parity tests. */
export function pickWorkstationParityFields(item: WorkstationWorkItem) {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    subtitle: item.subtitle,
    contextLine: item.contextLine,
    scopeLabel: item.scopeLabel,
    addressLine: item.addressLine,
    ageLabel: item.ageLabel,
    valueLabel: item.valueLabel,
    typeLabel: item.typeLabel,
    status: item.status,
    priority: item.priority,
    group: item.group,
    lens: item.lens,
    lane: item.lane,
    withinLaneRank: item.withinLaneRank,
    filterCategory: item.filterCategory,
    reason: item.reason,
    nextStep: item.nextStep,
    recordId: item.recordId,
    parentRecordId: item.parentRecordId,
    parentLabel: item.parentLabel,
    leadAnchorId: item.leadAnchorId,
    href: item.href,
    updatedAt: item.updatedAt.toISOString(),
    workflowNextActionType: item.workflow?.nextAction?.type,
    workflowNextActionLabel: item.workflow?.nextAction?.label,
    actionKind: item.actionKind,
    actionLabel: item.actionLabel,
    actionIssueId: item.actionIssueId,
    actionTaskId: item.actionTaskId,
  };
}
