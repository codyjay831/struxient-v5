import { StaffRole } from "@prisma/client";

export type ExecutionPlanPermission =
  | "accept_plan"
  | "approve_scope_revision"
  | "apply_scope_revision"
  | "override_execution_relevant"
  | "protect_unprotect_task"
  | "cancel_task"
  | "override_protected_or_human_edited"
  | "adjust_payments";

const EXECUTION_PLAN_PERMISSION_MATRIX: Record<StaffRole, Set<ExecutionPlanPermission>> = {
  [StaffRole.OWNER]: new Set<ExecutionPlanPermission>([
    "accept_plan",
    "approve_scope_revision",
    "apply_scope_revision",
    "override_execution_relevant",
    "protect_unprotect_task",
    "cancel_task",
    "override_protected_or_human_edited",
    "adjust_payments",
  ]),
  [StaffRole.ADMIN]: new Set<ExecutionPlanPermission>([
    "accept_plan",
    "approve_scope_revision",
    "apply_scope_revision",
    "override_execution_relevant",
    "protect_unprotect_task",
    "cancel_task",
    "override_protected_or_human_edited",
    "adjust_payments",
  ]),
  [StaffRole.OFFICE]: new Set<ExecutionPlanPermission>([
    "accept_plan",
    "approve_scope_revision",
    "apply_scope_revision",
    "override_execution_relevant",
    "protect_unprotect_task",
    "cancel_task",
    "adjust_payments",
  ]),
  [StaffRole.FIELD]: new Set<ExecutionPlanPermission>(["cancel_task"]),
  [StaffRole.VIEWER]: new Set<ExecutionPlanPermission>([]),
  [StaffRole.SUBCONTRACTOR]: new Set<ExecutionPlanPermission>([]),
};

const EXECUTION_PLAN_PERMISSION_ERROR_COPY: Record<ExecutionPlanPermission, string> = {
  accept_plan: "You do not have permission to accept execution plans.",
  approve_scope_revision: "You do not have permission to approve scope revisions.",
  apply_scope_revision: "You do not have permission to apply scope revisions.",
  override_execution_relevant:
    "You do not have permission to override execution relevance on scope.",
  protect_unprotect_task:
    "You do not have permission to protect or unprotect execution tasks.",
  cancel_task: "You do not have permission to cancel this task.",
  override_protected_or_human_edited:
    "You do not have permission to override protected or human-edited tasks.",
  adjust_payments: "You do not have permission to adjust payment requirements.",
};

export function canUseExecutionPlanPermission(
  role: StaffRole,
  permission: ExecutionPlanPermission,
): boolean {
  return EXECUTION_PLAN_PERMISSION_MATRIX[role].has(permission);
}

export function assertExecutionPlanPermission(
  role: StaffRole,
  permission: ExecutionPlanPermission,
): { ok: true } | { ok: false; error: string } {
  if (canUseExecutionPlanPermission(role, permission)) {
    return { ok: true };
  }
  return { ok: false, error: EXECUTION_PLAN_PERMISSION_ERROR_COPY[permission] };
}

