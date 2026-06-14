import { JobScheduleEventStatus, StaffRole, type Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getJobVisibilityWhere } from "@/lib/authz/resource-access";

const ACTIVE_AND_HISTORY_STATUSES: JobScheduleEventStatus[] = [
  JobScheduleEventStatus.TENTATIVE,
  JobScheduleEventStatus.CONFIRMED,
  JobScheduleEventStatus.COMPLETED,
  JobScheduleEventStatus.CANCELED,
];

export async function queryOrganizationScheduleProjection(input: {
  organizationId: string;
  range: { startAt: Date; endAt: Date };
  role: StaffRole;
  userId: string;
}) {
  const jobVisibilityWhere = getJobVisibilityWhere(input.role, input.userId);

  return db.jobScheduleEvent.findMany({
    where: {
      organizationId: input.organizationId,
      status: { in: ACTIVE_AND_HISTORY_STATUSES },
      startAt: { lte: input.range.endAt },
      endAt: { gte: input.range.startAt },
      job: jobVisibilityWhere,
    },
    select: {
      id: true,
      legacyVisitId: true,
      kind: true,
      status: true,
      title: true,
      startAt: true,
      endAt: true,
      leadUserId: true,
      completionOutcome: true,
      leadUser: { select: { id: true, name: true, email: true } },
      job: { select: { id: true, title: true } },
      taskLinks: {
        select: {
          jobTask: {
            select: { id: true, title: true, status: true, workPackageId: true },
          },
        },
      },
    },
    orderBy: { startAt: "asc" },
  });
}

export async function queryJobScheduleProjection(input: {
  organizationId: string;
  jobId: string;
}) {
  return db.jobScheduleEvent.findMany({
    where: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      status: { in: ACTIVE_AND_HISTORY_STATUSES },
    },
    select: {
      id: true,
      kind: true,
      status: true,
      title: true,
      startAt: true,
      endAt: true,
      completionOutcome: true,
      taskLinks: {
        select: {
          jobTask: {
            select: {
              id: true,
              title: true,
              status: true,
              workPackageId: true,
            },
          },
        },
      },
    },
    orderBy: [{ startAt: "desc" }],
  });
}

export type OrganizationScheduleProjectionEvent = Prisma.PromiseReturnType<
  typeof queryOrganizationScheduleProjection
>[number];
