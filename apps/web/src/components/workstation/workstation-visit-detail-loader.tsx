import { getRequestContextOrThrow } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { JobScheduleEventsPanel } from "@/components/jobs/job-schedule-events-panel";
import { JobScheduleEventStatus } from "@prisma/client";

type WorkstationVisitDetailLoaderProps = {
  jobId: string;
  visitId?: string;
  mode: "focus-visit" | "schedule-new";
};

export async function WorkstationVisitDetailLoader({
  jobId,
  visitId: _visitId,
  mode: _mode,
}: WorkstationVisitDetailLoaderProps) {
  const ctx = await getRequestContextOrThrow();

  const job = await db.job.findFirst({
    where: { id: jobId, organizationId: ctx.organizationId },
    select: { id: true },
  });

  if (!job) return null;

  const scheduleEvents = await db.jobScheduleEvent.findMany({
    where: {
      jobId,
      organizationId: ctx.organizationId,
      status: {
        in: [
          JobScheduleEventStatus.TENTATIVE,
          JobScheduleEventStatus.CONFIRMED,
          JobScheduleEventStatus.COMPLETED,
          JobScheduleEventStatus.CANCELED,
        ],
      },
    },
    orderBy: { startAt: "desc" },
    select: {
      id: true,
      title: true,
      kind: true,
      status: true,
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
            },
          },
        },
      },
    },
  });
  const tasks = await db.jobTask.findMany({
    where: { jobId, job: { organizationId: ctx.organizationId } },
    select: { id: true, title: true, status: true },
    orderBy: [{ sortOrder: "asc" }],
  });

  return (
    <JobScheduleEventsPanel
      jobId={jobId}
      events={scheduleEvents}
      tasks={tasks}
    />
  );
}
