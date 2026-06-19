import type { LeadVisitRequest } from "@prisma/client";
import type { LeadVisitRequestPayload } from "@/lib/lead-display";
import {
  hasAccessSnapshotContent,
  LeadVisitAccessSnapshotSchema,
  LeadVisitSiteContactSnapshotSchema,
} from "./lead-visit-schemas";

type LeadVisitRequestRow = Pick<
  LeadVisitRequest,
  | "id"
  | "requestedDate"
  | "requestedWindow"
  | "confirmedDate"
  | "scheduledStartAt"
  | "scheduledEndAt"
  | "estimatedDurationMinutes"
  | "arrivalWindowStartAt"
  | "arrivalWindowEndAt"
  | "arrivalWindowLabel"
  | "assignedUserId"
  | "accessSnapshotJson"
  | "siteContactSnapshotJson"
  | "outcome"
  | "nextAction"
  | "completedAt"
  | "status"
  | "purpose"
  | "notes"
  | "createdAt"
  | "updatedAt"
> & {
  assignedUser?: { name: string | null; email: string | null } | null;
};

export function serializeLeadVisitRequest(
  visit: LeadVisitRequestRow,
  options: { canViewAccessDetails: boolean; canEditAccessDetails?: boolean },
): LeadVisitRequestPayload {
  const accessParsed = LeadVisitAccessSnapshotSchema.safeParse(visit.accessSnapshotJson);
  const siteParsed = LeadVisitSiteContactSnapshotSchema.safeParse(visit.siteContactSnapshotJson);
  const accessSnapshot =
    options.canViewAccessDetails && accessParsed.success ? accessParsed.data : null;
  const siteContactSnapshot =
    options.canViewAccessDetails && siteParsed.success ? siteParsed.data : null;

  return {
    id: visit.id,
    requestedDate: visit.requestedDate,
    requestedWindow: visit.requestedWindow,
    confirmedDate: visit.confirmedDate,
    scheduledStartAt: visit.scheduledStartAt,
    scheduledEndAt: visit.scheduledEndAt,
    estimatedDurationMinutes: visit.estimatedDurationMinutes,
    arrivalWindowStartAt: visit.arrivalWindowStartAt,
    arrivalWindowEndAt: visit.arrivalWindowEndAt,
    arrivalWindowLabel: visit.arrivalWindowLabel,
    assignedUserId: visit.assignedUserId,
    assignedUserLabel: visit.assignedUser?.name ?? visit.assignedUser?.email ?? null,
    accessSnapshot,
    siteContactSnapshot,
    hasAccessDetails: accessParsed.success && hasAccessSnapshotContent(accessParsed.data),
    outcome: visit.outcome,
    nextAction: visit.nextAction,
    completedAt: visit.completedAt,
    status: visit.status,
    purpose: visit.purpose,
    notes: visit.notes,
    createdAt: visit.createdAt,
    updatedAt: visit.updatedAt,
    canEditAccessDetails: options.canEditAccessDetails ?? false,
  };
}

export function toOpportunityFlowVisitInput(
  visit: LeadVisitRequestRow & { hasAccessDetails?: boolean },
) {
  const accessParsed = LeadVisitAccessSnapshotSchema.safeParse(visit.accessSnapshotJson);
  return {
    id: visit.id,
    status: visit.status,
    requestedDate: visit.requestedDate,
    requestedWindow: visit.requestedWindow,
    confirmedDate: visit.confirmedDate,
    scheduledStartAt: visit.scheduledStartAt,
    scheduledEndAt: visit.scheduledEndAt,
    assignedUserId: visit.assignedUserId,
    completedAt: visit.completedAt,
    outcome: visit.outcome,
    nextAction: visit.nextAction,
    hasAccessDetails:
      visit.hasAccessDetails ??
      (accessParsed.success && hasAccessSnapshotContent(accessParsed.data)),
    createdAt: visit.createdAt,
  };
}
