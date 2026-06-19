import { StaffRole } from "@prisma/client";
import { canReadCommercial } from "@/lib/authz/capabilities";

export type LeadVisitAccessContext = {
  role: StaffRole;
  userId: string;
  assignedUserId?: string | null;
};

export type LeadVisitAccessResult = { ok: true } | { ok: false; error: string };

function isAssignedEstimator(ctx: LeadVisitAccessContext): boolean {
  return Boolean(ctx.assignedUserId && ctx.assignedUserId === ctx.userId);
}

function hasBroadCommercialAccess(role: StaffRole): boolean {
  return (
    role === StaffRole.OWNER ||
    role === StaffRole.ADMIN ||
    role === StaffRole.OFFICE
  );
}

export function canReadLeadVisit(ctx: LeadVisitAccessContext): boolean {
  if (ctx.role === StaffRole.SUBCONTRACTOR) return false;
  if (hasBroadCommercialAccess(ctx.role)) return true;
  if (ctx.role === StaffRole.VIEWER) return true;
  if (ctx.role === StaffRole.FIELD) return isAssignedEstimator(ctx);
  return false;
}

export function canViewLeadVisitAccessDetails(ctx: LeadVisitAccessContext): boolean {
  if (ctx.role === StaffRole.SUBCONTRACTOR || ctx.role === StaffRole.VIEWER) return false;
  if (hasBroadCommercialAccess(ctx.role)) return true;
  if (ctx.role === StaffRole.FIELD) return isAssignedEstimator(ctx);
  return false;
}

export function canMutateLeadVisitSchedule(ctx: LeadVisitAccessContext): boolean {
  if (ctx.role === StaffRole.SUBCONTRACTOR || ctx.role === StaffRole.VIEWER) return false;
  if (hasBroadCommercialAccess(ctx.role)) return true;
  if (ctx.role === StaffRole.FIELD) return isAssignedEstimator(ctx);
  return false;
}

export function canEditLeadVisitAccessDetails(ctx: LeadVisitAccessContext): boolean {
  return canMutateLeadVisitSchedule(ctx);
}

export function canCompleteLeadVisit(ctx: LeadVisitAccessContext): boolean {
  if (ctx.role === StaffRole.SUBCONTRACTOR || ctx.role === StaffRole.VIEWER) return false;
  if (hasBroadCommercialAccess(ctx.role)) return true;
  if (ctx.role === StaffRole.FIELD) return isAssignedEstimator(ctx);
  return false;
}

export function canCancelLeadVisit(ctx: LeadVisitAccessContext): boolean {
  if (ctx.role === StaffRole.SUBCONTRACTOR || ctx.role === StaffRole.VIEWER) return false;
  if (hasBroadCommercialAccess(ctx.role)) return true;
  return false;
}

export function assertCanReadLeadVisit(ctx: LeadVisitAccessContext): LeadVisitAccessResult {
  if (canReadLeadVisit(ctx)) return { ok: true };
  return { ok: false, error: "You do not have permission to view this sales site visit." };
}

export function assertCanViewLeadVisitAccessDetails(
  ctx: LeadVisitAccessContext,
): LeadVisitAccessResult {
  if (canViewLeadVisitAccessDetails(ctx)) return { ok: true };
  return { ok: false, error: "You do not have permission to view visit access details." };
}

export function assertCanMutateLeadVisitSchedule(
  ctx: LeadVisitAccessContext,
): LeadVisitAccessResult {
  if (canMutateLeadVisitSchedule(ctx)) return { ok: true };
  return { ok: false, error: "You do not have permission to schedule or reschedule this visit." };
}

export function assertCanCompleteLeadVisit(ctx: LeadVisitAccessContext): LeadVisitAccessResult {
  if (canCompleteLeadVisit(ctx)) return { ok: true };
  return { ok: false, error: "You do not have permission to complete this visit." };
}

export function assertCanCancelLeadVisit(ctx: LeadVisitAccessContext): LeadVisitAccessResult {
  if (canCancelLeadVisit(ctx)) return { ok: true };
  return { ok: false, error: "You do not have permission to cancel this visit." };
}

/** Whether schedule query should load all org lead visits vs assignment-scoped only. */
export function shouldLoadAllLeadVisitsForSchedule(role: StaffRole): boolean {
  return canReadCommercial(role);
}
