import Link from "next/link";
import { WORKSTATION_COPY } from "@/lib/workstation-copy";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { JobStatus, JobTaskStatus } from "@prisma/client";
import { WorkstationClearedState } from "@/components/workstation/workstation-ui";

export const dynamic = "force-dynamic";

export default async function WorkstationScheduleLensPage() {
  const ctx = await getRequestContextOrThrow();

  // Count active jobs and tasks that would normally be scheduled
  const [activeJobsCount, todoTasksCount] = await Promise.all([
    db.job.count({ where: { organizationId: ctx.organizationId, status: JobStatus.ACTIVE } }),
    db.jobTask.count({ where: { job: { organizationId: ctx.organizationId }, status: JobTaskStatus.TODO } }),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-foreground-subtle">
          Schedule signals
        </h2>
        <div className="flex items-center gap-4 text-xs font-medium text-foreground-muted">
          <span>{activeJobsCount} jobs to schedule</span>
        </div>
      </div>

      <div className="rounded-xl border border-dashed border-border bg-foreground/[0.01] p-12 text-center">
        <p className="mx-auto max-w-md text-sm leading-relaxed text-foreground-muted">
          The schedule lens surfaces timing-related signals. While the full calendar grid lives under Work → Schedule, 
          this view highlights what needs a human decision soon.
        </p>
        <div className="mt-6 flex justify-center gap-4">
          <div className="rounded-lg bg-foreground/[0.03] px-3 py-1 text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle">
            Layer reserved
          </div>
        </div>
      </div>

      <WorkstationClearedState />

      <div className="mt-12 flex flex-wrap gap-4 border-t border-border pt-8">
        <Link href="/schedule" className="text-xs font-bold uppercase tracking-widest text-foreground-muted hover:text-foreground">
          {WORKSTATION_COPY.continuation.openSchedule}
        </Link>
        <Link href="/workstation" className="text-xs font-bold uppercase tracking-widest text-foreground-muted hover:text-foreground">
          {WORKSTATION_COPY.continuation.backToToday}
        </Link>
      </div>
    </div>
  );
}
