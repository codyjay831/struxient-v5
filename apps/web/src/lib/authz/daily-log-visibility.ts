import { StaffRole } from "@prisma/client";
import { canReadCommercial } from "@/lib/authz/capabilities";

/**
 * Office coordination notes on daily logs are not execution-facing.
 * VIEWER may read via `read.commercial` (org-wide read-only office visibility).
 * FIELD and SUBCONTRACTOR cannot read internal notes.
 */
export function canReadDailyLogInternalNotes(role: StaffRole): boolean {
  return canReadCommercial(role);
}

export function canWriteDailyLogInternalNotes(role: StaffRole): boolean {
  return (
    role === StaffRole.OWNER ||
    role === StaffRole.ADMIN ||
    role === StaffRole.OFFICE
  );
}

/** Review and void are office coordination actions (not field execution). */
export function canManageDailyLogCoordination(role: StaffRole): boolean {
  return canWriteDailyLogInternalNotes(role);
}

export const DAILY_JOB_LOG_BASE_SELECT = {
  id: true,
  logDate: true,
  summary: true,
  status: true,
  reviewedAt: true,
  reviewedByUser: { select: { name: true, email: true } },
} as const;

export function dailyJobLogSelectForRole(role: StaffRole) {
  return {
    ...DAILY_JOB_LOG_BASE_SELECT,
    ...(canReadDailyLogInternalNotes(role) ? { internalNotes: true as const } : {}),
  };
}

export function redactDailyLogInternalNotesForRole<
  T extends { internalNotes?: string | null },
>(log: T, role: StaffRole): Omit<T, "internalNotes"> & { internalNotes: string | null } {
  if (canReadDailyLogInternalNotes(role)) {
    return { ...log, internalNotes: log.internalNotes ?? null };
  }
  return { ...log, internalNotes: null };
}

export function redactDailyLogsForRole<T extends { internalNotes?: string | null }>(
  logs: T[],
  role: StaffRole,
): Array<Omit<T, "internalNotes"> & { internalNotes: string | null }> {
  return logs.map((log) => redactDailyLogInternalNotesForRole(log, role));
}
