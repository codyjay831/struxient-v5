import { getRequestContextOrThrow } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { JobVisitManager } from "@/components/jobs/job-visit-manager";

type WorkstationVisitDetailLoaderProps = {
  jobId: string;
  visitId?: string;
  mode: "focus-visit" | "schedule-new";
};

export async function WorkstationVisitDetailLoader({
  jobId,
  visitId,
  mode,
}: WorkstationVisitDetailLoaderProps) {
  const ctx = await getRequestContextOrThrow();

  const job = await db.job.findFirst({
    where: { id: jobId, organizationId: ctx.organizationId },
    select: { id: true },
  });

  if (!job) return null;

  if (mode === "focus-visit" && visitId) {
    const visit = await db.jobVisit.findFirst({
      where: { id: visitId, jobId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!visit) return null;
  }

  const visits = await db.jobVisit.findMany({
    where: { jobId, organizationId: ctx.organizationId },
    orderBy: { scheduledStartAt: "desc" },
    select: {
      id: true,
      scheduledStartAt: true,
      scheduledEndAt: true,
      assignedUserId: true,
      status: true,
      notes: true,
      assignedUser: {
        select: { name: true, email: true },
      },
    },
  });

  const members = await db.membership.findMany({
    where: { organizationId: ctx.organizationId },
    select: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <JobVisitManager
      jobId={jobId}
      initialVisits={visits}
      members={members.map((membership) => ({
        id: membership.user.id,
        label: membership.user.name || membership.user.email || "Unnamed user",
      }))}
      variant="embedded"
      focusId={mode === "focus-visit" ? visitId : undefined}
      initialShowScheduleForm={mode === "schedule-new"}
    />
  );
}
