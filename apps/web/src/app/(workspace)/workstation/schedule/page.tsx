import Link from "next/link";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { SignalCard } from "@/components/ui/signal-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { WORKSTATION_COPY } from "@/lib/workstation-copy";
import { CalendarDays } from "lucide-react";
import { getDevOrganizationOrThrow, db } from "@/lib/db";
import { JobStatus, JobTaskStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const continuationLinkClass =
  "inline-flex items-center rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default async function WorkstationScheduleLensPage() {
  const org = await getDevOrganizationOrThrow();

  // Count active jobs and tasks that would normally be scheduled
  const [activeJobsCount, todoTasksCount] = await Promise.all([
    db.job.count({ where: { organizationId: org.id, status: JobStatus.ACTIVE } }),
    db.jobTask.count({ where: { job: { organizationId: org.id }, status: JobTaskStatus.TODO } }),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[{ label: "Workstation", href: "/workstation" }, { label: "Schedule" }]}
      />
      <PageHeader
        title="Schedule"
        description="Monitor timing risk, conflicts, and upcoming commitments."
      />

      <div className="space-y-6">
        <WorkspacePanel padding="compact">
          <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
            The schedule lens surfaces timing-related signals. While the full calendar grid lives under Work → Schedule, 
            this view highlights what needs a human decision soon.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge label="Scheduling layer reserved" tone="neutral" />
            <span className="text-xs text-foreground-muted">
              Real jobs and tasks exist, but explicit schedule dates are not yet wired in the schema.
            </span>
          </div>
        </WorkspacePanel>

        <WorkspacePanel className="border-border-strong shadow-md ring-1 ring-ring/30">
          <SectionHeading
            title="Schedule attention signals"
            description="Timing risks across active jobs and tasks."
          />
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SignalCard
              label="Active jobs"
              value={String(activeJobsCount)}
              hint="Jobs that will need scheduling."
            />
            <SignalCard
              label="Ready tasks"
              value={String(todoTasksCount)}
              hint="Tasks waiting to be scheduled or started."
            />
            <SignalCard
              label="Conflicts"
              value="—"
              hint="Requires schedule date fields."
            />
            <SignalCard
              label="Missed windows"
              value="—"
              hint="Requires due date fields."
            />
          </div>
          <EmptyState
            icon={CalendarDays}
            title="No schedule signals yet"
            description={`You have ${activeJobsCount} active jobs and ${todoTasksCount} tasks, but explicit scheduling fields (dates/times) are not yet wired in this build. Struxient will surface conflicts and slips here once those fields are added.`}
          >
            <Link href="/schedule" className={continuationLinkClass}>
              {WORKSTATION_COPY.continuation.openSchedule}
            </Link>
            <Link href="/jobs" className={continuationLinkClass}>
              {WORKSTATION_COPY.continuation.openJobs}
            </Link>
            <Link href="/workstation" className={continuationLinkClass}>
              {WORKSTATION_COPY.continuation.backToToday}
            </Link>
          </EmptyState>
        </WorkspacePanel>
      </div>
    </div>
  );
}
