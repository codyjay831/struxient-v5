import { StaffRole } from "@prisma/client";

export type SchedulePermission =
  | "create_tentative"
  | "confirm"
  | "reschedule_tentative"
  | "reschedule_confirmed"
  | "cancel"
  | "complete"
  | "correct_terminal_event"
  | "deadline_set_recalc"
  | "link_unlink_tasks";

const SCHEDULE_PERMISSION_MATRIX: Record<StaffRole, Set<SchedulePermission>> = {
  [StaffRole.OWNER]: new Set<SchedulePermission>([
    "create_tentative",
    "confirm",
    "reschedule_tentative",
    "reschedule_confirmed",
    "cancel",
    "complete",
    "correct_terminal_event",
    "deadline_set_recalc",
    "link_unlink_tasks",
  ]),
  [StaffRole.ADMIN]: new Set<SchedulePermission>([
    "create_tentative",
    "confirm",
    "reschedule_tentative",
    "reschedule_confirmed",
    "cancel",
    "complete",
    "correct_terminal_event",
    "deadline_set_recalc",
    "link_unlink_tasks",
  ]),
  [StaffRole.OFFICE]: new Set<SchedulePermission>([
    "create_tentative",
    "confirm",
    "reschedule_tentative",
    "reschedule_confirmed",
    "cancel",
    "complete",
    "deadline_set_recalc",
    "link_unlink_tasks",
  ]),
  [StaffRole.FIELD]: new Set<SchedulePermission>([
    "reschedule_tentative",
    "reschedule_confirmed",
    "complete",
    "deadline_set_recalc",
  ]),
  [StaffRole.VIEWER]: new Set<SchedulePermission>([]),
  [StaffRole.SUBCONTRACTOR]: new Set<SchedulePermission>([]),
};

export function canUseSchedulePermission(
  role: StaffRole,
  permission: SchedulePermission,
): boolean {
  return SCHEDULE_PERMISSION_MATRIX[role].has(permission);
}

export function assertSchedulePermission(
  role: StaffRole,
  permission: SchedulePermission,
): { ok: true } | { ok: false; error: string } {
  if (canUseSchedulePermission(role, permission)) return { ok: true };
  return { ok: false, error: "You do not have permission to perform this scheduling action." };
}
