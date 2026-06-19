import {
  LeadVisitRequestStatus,
  StaffRole,
  type LeadVisitRequest,
} from "@prisma/client";
import { db } from "@/lib/db";
import type { RequestContext } from "@/lib/auth-context";
import { canReadCommercial } from "@/lib/authz/capabilities";
import {
  canReadLeadVisit,
  type LeadVisitAccessContext,
} from "./lead-visit-access";
import { resolveLeadVisitScheduledStart } from "./lead-visit-schedule-service";
import {
  hasAccessSnapshotContent,
  LeadVisitAccessSnapshotSchema,
} from "./lead-visit-schemas";
import type {
  LeadWorkstationAttentionGroup,
  LeadWorkstationAttentionPriority,
} from "@/lib/workstation-lead-attention";
import type { WorkstationLens } from "@/lib/workstation-query";

export type LeadSurfaceAccessMode = "commercial" | "assigned_visit" | "denied";

export type LeadSurfaceAccessResult =
  | { mode: "commercial" }
  | { mode: "assigned_visit"; assignedVisitId: string }
  | { mode: "denied" };

/** Statuses where an assigned estimator may open the restricted lead visit context. */
export const ASSIGNED_LEAD_CONTEXT_VISIT_STATUSES: LeadVisitRequestStatus[] = [
  LeadVisitRequestStatus.PENDING,
  LeadVisitRequestStatus.CONFIRMED,
  LeadVisitRequestStatus.COMPLETED,
  LeadVisitRequestStatus.NO_SHOW,
];

export async function findUserAssignedVisitForLead(
  organizationId: string,
  leadId: string,
  userId: string,
): Promise<Pick<LeadVisitRequest, "id" | "assignedUserId" | "status"> | null> {
  return db.leadVisitRequest.findFirst({
    where: {
      organizationId,
      leadId,
      assignedUserId: userId,
      status: { in: ASSIGNED_LEAD_CONTEXT_VISIT_STATUSES },
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, assignedUserId: true, status: true },
  });
}

export async function resolveLeadSurfaceAccess(
  ctx: RequestContext,
  leadId: string,
): Promise<LeadSurfaceAccessResult> {
  if (canReadCommercial(ctx.role)) {
    return { mode: "commercial" };
  }

  const assignedVisit = await findUserAssignedVisitForLead(
    ctx.organizationId,
    leadId,
    ctx.userId,
  );
  if (
    assignedVisit &&
    canReadLeadVisit({
      role: ctx.role,
      userId: ctx.userId,
      assignedUserId: assignedVisit.assignedUserId,
    })
  ) {
    return { mode: "assigned_visit", assignedVisitId: assignedVisit.id };
  }

  return { mode: "denied" };
}

export function leadVisitAccessContextForUser(
  ctx: RequestContext,
  assignedUserId?: string | null,
): LeadVisitAccessContext {
  return {
    role: ctx.role,
    userId: ctx.userId,
    assignedUserId,
  };
}

function startOfLocalDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfLocalDay(date: Date): Date {
  const next = startOfLocalDay(date);
  next.setDate(next.getDate() + 1);
  return next;
}

export function isVisitScheduledTodayOrTomorrow(
  scheduledStart: Date | null,
  now: Date,
): boolean {
  if (!scheduledStart) return false;
  const todayStart = startOfLocalDay(now);
  const tomorrowEnd = endOfLocalDay(new Date(todayStart.getTime() + 24 * 60 * 60 * 1000));
  return scheduledStart >= todayStart && scheduledStart < tomorrowEnd;
}

export type AssignedVisitWorkstationAttention = {
  group: LeadWorkstationAttentionGroup;
  priority: LeadWorkstationAttentionPriority;
  lens: WorkstationLens;
  reason: string;
  nextStep: string;
  include: boolean;
};

export function classifyAssignedLeadVisitWorkstationAttention(input: {
  status: LeadVisitRequestStatus;
  scheduledStart: Date | null;
  hasMissingAccess: boolean;
  hasMissingOutcome: boolean;
  now: Date;
}): AssignedVisitWorkstationAttention {
  if (input.status === LeadVisitRequestStatus.NO_SHOW) {
    return {
      group: "investigate",
      priority: "critical",
      lens: "attention",
      reason: "Assigned sales visit no-show needs recovery.",
      nextStep: "Schedule or follow up",
      include: true,
    };
  }

  if (input.hasMissingOutcome) {
    return {
      group: "investigate",
      priority: "critical",
      lens: "attention",
      reason: "Assigned visit needs an outcome recorded.",
      nextStep: "Record visit outcome",
      include: true,
    };
  }

  if (input.status === LeadVisitRequestStatus.CONFIRMED && input.hasMissingAccess) {
    return {
      group: "investigate",
      priority: "high",
      lens: "attention",
      reason: "Assigned sales visit is missing access details.",
      nextStep: "Add access details",
      include: true,
    };
  }

  if (
    (input.status === LeadVisitRequestStatus.CONFIRMED ||
      input.status === LeadVisitRequestStatus.PENDING) &&
    isVisitScheduledTodayOrTomorrow(input.scheduledStart, input.now)
  ) {
    return {
      group: "investigate",
      priority: "high",
      lens: "attention",
      reason: "Assigned sales visit is due today or tomorrow.",
      nextStep:
        input.status === LeadVisitRequestStatus.CONFIRMED
          ? "Complete site visit"
          : "Confirm visit time",
      include: true,
    };
  }

  if (
    input.status === LeadVisitRequestStatus.COMPLETED ||
    (input.status === LeadVisitRequestStatus.CONFIRMED && input.hasMissingOutcome)
  ) {
    return {
      group: "scheduled",
      priority: "low",
      lens: "upcoming",
      reason: "Assigned sales visit completed.",
      nextStep: "Review visit",
      include: false,
    };
  }

  if (
    input.status === LeadVisitRequestStatus.PENDING ||
    input.status === LeadVisitRequestStatus.CONFIRMED
  ) {
    return {
      group: "scheduled",
      priority: "low",
      lens: "upcoming",
      reason: "Assigned sales visit scheduled.",
      nextStep:
        input.status === LeadVisitRequestStatus.CONFIRMED
          ? "Complete site visit"
          : "Schedule visit",
      include: true,
    };
  }

  return {
    group: "scheduled",
    priority: "low",
    lens: "upcoming",
    reason: "Assigned sales site visit.",
    nextStep: "Open visit",
    include: false,
  };
}

export function resolveLeadVisitWorkstationHref(leadId: string): string {
  return `/leads/${leadId}`;
}

export function canLoadLeadVisitSchedulerStaff(role: StaffRole): boolean {
  return (
    role === StaffRole.OWNER ||
    role === StaffRole.ADMIN ||
    role === StaffRole.OFFICE
  );
}

export function visitHasMissingOutcome(input: {
  status: LeadVisitRequestStatus;
  outcome: unknown;
  nextAction: unknown;
}): boolean {
  if (input.status !== LeadVisitRequestStatus.COMPLETED) return false;
  return input.outcome == null || input.nextAction == null;
}

export function visitHasMissingAccess(accessSnapshotJson: unknown): boolean {
  const parsed = LeadVisitAccessSnapshotSchema.safeParse(accessSnapshotJson);
  return !(parsed.success && hasAccessSnapshotContent(parsed.data));
}

export function resolveVisitScheduledStartFromRow(
  visit: Pick<
    LeadVisitRequest,
    "scheduledStartAt" | "confirmedDate" | "requestedDate"
  >,
): Date | null {
  return resolveLeadVisitScheduledStart(visit);
}
