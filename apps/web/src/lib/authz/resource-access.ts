import { StaffRole } from "@prisma/client";
import { getActiveCollaboratorGrantWhere } from "@/lib/collaborators/job-collaborator-access";
import { getCrewLinkedAssigneeWhere } from "@/lib/crews/crew-access";

export function isAssignmentScopedRole(role: StaffRole): boolean {
  return role === StaffRole.FIELD || role === StaffRole.SUBCONTRACTOR;
}

export function getJobVisibilityWhere(role: StaffRole, userId: string) {
  if (role === StaffRole.SUBCONTRACTOR) {
    return getActiveCollaboratorGrantWhere(userId);
  }

  if (role !== StaffRole.FIELD) {
    return {};
  }

  const now = new Date();
  return {
    OR: [
      { tasks: { some: { assignedUserId: userId } } },
      { tasks: { some: getCrewLinkedAssigneeWhere(userId, now) } },
      { scheduleEvents: { some: { leadUserId: userId } } },
    ],
  };
}

export function getTaskVisibilityWhere(role: StaffRole, userId: string) {
  if (role === StaffRole.SUBCONTRACTOR) {
    return { assignedUserId: userId };
  }

  if (role !== StaffRole.FIELD) {
    return {};
  }

  return {
    OR: [{ assignedUserId: userId }, getCrewLinkedAssigneeWhere(userId)],
  };
}

/** Schedule event execution mutation scope — event lead only. */
export function getScheduleEventExecutionAssignmentWhere(role: StaffRole, userId: string) {
  if (role === StaffRole.SUBCONTRACTOR || role === StaffRole.FIELD) {
    return { leadUserId: userId };
  }

  return {};
}

/** Visit execution mutation scope — direct assignee or schedule lead for this visit. */
export function getVisitExecutionAssignmentWhere(
  role: StaffRole,
  userId: string,
  visitId: string,
) {
  if (role === StaffRole.SUBCONTRACTOR) {
    return { assignedUserId: userId };
  }

  if (role !== StaffRole.FIELD) {
    return {};
  }

  return {
    OR: [
      { assignedUserId: userId },
      {
        job: {
          scheduleEvents: {
            some: {
              leadUserId: userId,
              legacyVisitId: visitId,
            },
          },
        },
      },
    ],
  };
}
