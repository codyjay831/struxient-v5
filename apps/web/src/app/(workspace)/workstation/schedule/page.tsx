import { WORKSTATION_COPY } from "@/lib/workstation-copy";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { JobStatus, JobTaskStatus } from "@prisma/client";
import { WorkstationClearedState } from "@/components/workstation/workstation-ui";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { CalendarDays } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function WorkstationScheduleLensPage() {
  const ctx = await getRequestContextOrThrow();

  // Count active jobs and tasks that would normally be scheduled
  const [activeJobsCount] = await Promise.all([
    db.job.count({ where: { organizationId: ctx.organizationId, status: JobStatus.ACTIVE } }),
    db.jobTask.count({ where: { job: { organizationId: ctx.organizationId }, status: JobTaskStatus.TODO } }),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <h2 className="text-sm font-semibold text-foreground">
          Scheduling attention
        </h2>
        <div className="flex items-center gap-4 text-sm text-foreground-muted">
          <span>{activeJobsCount} jobs to schedule</span>
        </div>
      </div>

      {activeJobsCount > 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No schedule blockers right now"
          description="Nothing needs immediate timing decisions. Check Work → Schedule to plan upcoming windows."
        />
      ) : (
        <WorkstationClearedState lens="upcoming" />
      )}

      <div className="mt-12 flex flex-wrap gap-4 border-t border-border pt-8">
        <ButtonLink href="/schedule" variant="ghost" size="sm">
          {WORKSTATION_COPY.continuation.openSchedule}
        </ButtonLink>
        <ButtonLink href="/workstation" variant="ghost" size="sm">
          {WORKSTATION_COPY.continuation.backToToday}
        </ButtonLink>
      </div>
    </div>
  );
}
