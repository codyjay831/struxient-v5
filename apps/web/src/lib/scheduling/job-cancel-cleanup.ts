import {
  JobScheduleEventKind,
  JobScheduleEventStatus,
  JobStatus,
  JobVisitStatus,
  LineItemTemplateTaskSource,
  TaskTemplateCategory,
  JobTaskStatus,
  JobActivityType,
} from "@prisma/client";
import { db, type ExtendedTransactionClient } from "@/lib/db";
import { recordJobActivity } from "@/lib/job-activity-helper";
import { cancelScheduleEvent } from "./event-service";

export const INTERNAL_SCHEDULE_EVENT_KINDS = [
  JobScheduleEventKind.CREW_WORK,
  JobScheduleEventKind.OFFICE_WORK,
] as const;

export const EXTERNAL_SCHEDULE_EVENT_KINDS = [
  JobScheduleEventKind.CUSTOMER_APPOINTMENT,
  JobScheduleEventKind.SITE_VISIT,
  JobScheduleEventKind.INSPECTION,
  JobScheduleEventKind.DELIVERY,
  JobScheduleEventKind.UTILITY_APPOINTMENT,
  JobScheduleEventKind.OTHER,
] as const;

export type ScheduleCleanupEventRow = {
  id: string;
  kind: JobScheduleEventKind;
  status: JobScheduleEventStatus;
  title: string | null;
  startAt: Date;
  endAt: Date;
  leadUserId: string | null;
  legacyVisitId: string | null;
};

export type ScheduleCleanupReviewItem = ScheduleCleanupEventRow & {
  preselected: boolean;
  requiresExplicitReview: boolean;
  kindLabel: string;
};

export type ScheduleCleanupSelection = {
  eventId: string;
  cancel: boolean;
  reason?: string;
  /** Client must set true when the user explicitly checked an external event. */
  explicitlySelected?: boolean;
};

export function isInternalScheduleEventKind(kind: JobScheduleEventKind): boolean {
  return (INTERNAL_SCHEDULE_EVENT_KINDS as readonly JobScheduleEventKind[]).includes(kind);
}

export function isPendingScheduleCleanupEvent(
  event: Pick<ScheduleCleanupEventRow, "status" | "endAt">,
  now: Date = new Date(),
): boolean {
  return (
    (event.status === JobScheduleEventStatus.TENTATIVE ||
      event.status === JobScheduleEventStatus.CONFIRMED) &&
    event.endAt.getTime() > now.getTime()
  );
}

export function deriveJobNeedsScheduleCleanup(input: {
  jobStatus: JobStatus;
  pendingEvents: ScheduleCleanupEventRow[];
  now?: Date;
}): boolean {
  if (input.jobStatus !== JobStatus.ARCHIVED) return false;
  const now = input.now ?? new Date();
  return input.pendingEvents.some((event) => isPendingScheduleCleanupEvent(event, now));
}

export function formatScheduleEventKindLabel(kind: JobScheduleEventKind): string {
  return kind.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function buildScheduleCleanupReviewItems(
  events: ScheduleCleanupEventRow[],
  now: Date = new Date(),
): ScheduleCleanupReviewItem[] {
  return events
    .filter((event) => isPendingScheduleCleanupEvent(event, now))
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
    .map((event) => {
      const internal = isInternalScheduleEventKind(event.kind);
      return {
        ...event,
        preselected: internal,
        requiresExplicitReview: !internal,
        kindLabel: formatScheduleEventKindLabel(event.kind),
      };
    });
}

export function validateScheduleCleanupSelections(
  reviewItems: ScheduleCleanupReviewItem[],
  selections: ScheduleCleanupSelection[],
): { ok: true } | { ok: false; error: string } {
  const reviewById = new Map(reviewItems.map((item) => [item.id, item]));
  const selectedToCancel = selections.filter((selection) => selection.cancel);

  if (selectedToCancel.length === 0) {
    return { ok: false, error: "Select at least one event to cancel, or leave all unchecked to skip." };
  }

  for (const selection of selectedToCancel) {
    const item = reviewById.get(selection.eventId);
    if (!item) {
      return { ok: false, error: "Cleanup selection includes an unknown event." };
    }
    if (item.requiresExplicitReview && !selection.explicitlySelected) {
      return {
        ok: false,
        error: `External event "${item.title ?? item.kindLabel}" requires explicit review before cancellation.`,
      };
    }
    if (
      item.status === JobScheduleEventStatus.CONFIRMED &&
      !selection.reason?.trim()
    ) {
      return {
        ok: false,
        error: `A reason is required to cancel confirmed event "${item.title ?? item.kindLabel}".`,
      };
    }
  }

  return { ok: true };
}

export async function loadPendingScheduleCleanupEvents(
  jobId: string,
  organizationId: string,
  now: Date = new Date(),
): Promise<ScheduleCleanupEventRow[]> {
  const events = await db.jobScheduleEvent.findMany({
    where: {
      jobId,
      organizationId,
      status: {
        in: [JobScheduleEventStatus.TENTATIVE, JobScheduleEventStatus.CONFIRMED],
      },
      endAt: { gt: now },
    },
    select: {
      id: true,
      kind: true,
      status: true,
      title: true,
      startAt: true,
      endAt: true,
      leadUserId: true,
      legacyVisitId: true,
    },
    orderBy: { startAt: "asc" },
  });
  return events;
}

async function syncLegacyVisitCancel(
  legacyVisitId: string | null,
  organizationId: string,
  tx: ExtendedTransactionClient,
) {
  if (!legacyVisitId) return;
  await tx.jobVisit.updateMany({
    where: { id: legacyVisitId, organizationId, status: JobVisitStatus.SCHEDULED },
    data: { status: JobVisitStatus.CANCELED },
  });
}

function externalFollowUpTitle(kind: JobScheduleEventKind, title: string | null): string {
  const label = title?.trim() || formatScheduleEventKindLabel(kind);
  return `Confirm cancellation: ${label}`;
}

export async function executeScheduleCleanupBatch(
  input: {
    organizationId: string;
    jobId: string;
    actorUserId?: string;
    reviewReason: string;
    selections: ScheduleCleanupSelection[];
    spawnExternalFollowUpTasks?: boolean;
  },
  tx: ExtendedTransactionClient = db,
): Promise<{ success: true; canceledEventIds: string[] } | { error: string }> {
  const job = await tx.job.findFirst({
    where: { id: input.jobId, organizationId: input.organizationId },
    select: {
      id: true,
      status: true,
      stages: {
        orderBy: { sortOrder: "asc" },
        take: 1,
        select: { id: true },
      },
    },
  });

  if (!job) return { error: "Job not found or access denied." };
  if (job.status !== JobStatus.ARCHIVED) {
    return { error: "Schedule cleanup is only available for archived jobs." };
  }
  if (!input.reviewReason.trim()) {
    return { error: "A cleanup review reason is required." };
  }

  const pendingRows = await tx.jobScheduleEvent.findMany({
    where: {
      jobId: input.jobId,
      organizationId: input.organizationId,
      status: {
        in: [JobScheduleEventStatus.TENTATIVE, JobScheduleEventStatus.CONFIRMED],
      },
      endAt: { gt: new Date() },
    },
    select: {
      id: true,
      kind: true,
      status: true,
      title: true,
      startAt: true,
      endAt: true,
      leadUserId: true,
      legacyVisitId: true,
    },
  });
  const reviewItems = buildScheduleCleanupReviewItems(pendingRows);
  const validation = validateScheduleCleanupSelections(reviewItems, input.selections);
  if (!validation.ok) return { error: validation.error };

  const reviewById = new Map(reviewItems.map((item) => [item.id, item]));
  const canceledEventIds: string[] = [];

  for (const selection of input.selections) {
    if (!selection.cancel) continue;
    const item = reviewById.get(selection.eventId);
    if (!item) continue;

    const reason =
      selection.reason?.trim() ||
      (item.status === JobScheduleEventStatus.CONFIRMED
        ? input.reviewReason.trim()
        : "Job archived — schedule cleanup.");

    const result = await cancelScheduleEvent(
      {
        organizationId: input.organizationId,
        eventId: item.id,
        reason,
        actorUserId: input.actorUserId,
      },
      tx,
    );
    if ("error" in result) return result;

    await syncLegacyVisitCancel(item.legacyVisitId, input.organizationId, tx);
    canceledEventIds.push(item.id);

    if (
      input.spawnExternalFollowUpTasks &&
      item.requiresExplicitReview &&
      job.stages[0]
    ) {
      await tx.jobTask.create({
        data: {
          jobId: job.id,
          jobStageId: job.stages[0].id,
          sourceType: LineItemTemplateTaskSource.CUSTOM,
          title: externalFollowUpTitle(item.kind, item.title),
          instructions:
            "Confirm this external appointment was canceled with the customer, utility, inspector, or other party.",
          category: TaskTemplateCategory.SCHEDULING,
          status: JobTaskStatus.TODO,
          sortOrder: 0,
          completionRequirementsJson: {},
          providesSignals: [],
          requiresSignals: [],
          schedulingRequirement: "NONE",
        },
      });
    }
  }

  await recordJobActivity(
    {
      organizationId: input.organizationId,
      jobId: job.id,
      type: JobActivityType.JOB_SCHEDULE_CLEANUP_COMPLETED,
      title: "Schedule cleanup review completed",
      details: input.reviewReason.trim(),
      actorUserId: input.actorUserId,
      metadataJson: {
        canceledEventIds,
        spawnExternalFollowUpTasks: Boolean(input.spawnExternalFollowUpTasks),
      },
    },
    tx,
  );

  return { success: true, canceledEventIds };
}

export async function queryJobsNeedingScheduleCleanupAttention(
  organizationId: string,
  now: Date = new Date(),
): Promise<
  Array<{
    jobId: string;
    jobTitle: string;
    pendingCount: number;
    externalCount: number;
    updatedAt: Date;
  }>
> {
  const events = await db.jobScheduleEvent.findMany({
    where: {
      organizationId,
      status: {
        in: [JobScheduleEventStatus.TENTATIVE, JobScheduleEventStatus.CONFIRMED],
      },
      endAt: { gt: now },
      job: { status: JobStatus.ARCHIVED },
    },
    select: {
      id: true,
      kind: true,
      endAt: true,
      status: true,
      job: {
        select: {
          id: true,
          title: true,
          updatedAt: true,
        },
      },
    },
  });

  const byJob = new Map<
    string,
    {
      jobId: string;
      jobTitle: string;
      pendingCount: number;
      externalCount: number;
      updatedAt: Date;
    }
  >();

  for (const event of events) {
    if (!isPendingScheduleCleanupEvent(event, now)) continue;
    const existing = byJob.get(event.job.id);
    const external = !isInternalScheduleEventKind(event.kind) ? 1 : 0;
    if (existing) {
      existing.pendingCount += 1;
      existing.externalCount += external;
    } else {
      byJob.set(event.job.id, {
        jobId: event.job.id,
        jobTitle: event.job.title,
        pendingCount: 1,
        externalCount: external,
        updatedAt: event.job.updatedAt,
      });
    }
  }

  return [...byJob.values()].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
  );
}
