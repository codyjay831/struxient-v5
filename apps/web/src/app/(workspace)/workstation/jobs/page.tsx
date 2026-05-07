import Link from "next/link";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { SignalCard } from "@/components/ui/signal-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { WORKSTATION_COPY } from "@/lib/workstation-copy";
import { FolderKanban } from "lucide-react";
import { getDevOrganizationOrThrow, db } from "@/lib/db";
import { queryWorkstationWorkItems } from "@/lib/workstation-query";
import { AttentionCard } from "@/components/ui/attention-card";
import { buildWorkstationSelectHref } from "@/lib/workstation-return-href";
import { WorkstationWorkPanel } from "@/components/workstation/workstation-work-panel";
import { WorkstationJobPanel } from "@/components/workstation/workstation-job-panel";
import { JobTaskStatus, JobStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const continuationLinkClass =
  "inline-flex items-center rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default async function WorkstationJobsLensPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const org = await getDevOrganizationOrThrow();
  const sp = await searchParams;
  const selectedId = typeof sp.selectedId === "string" ? sp.selectedId : undefined;

  const allItems = await queryWorkstationWorkItems(org.id);
  const jobItems = allItems.filter((i) => i.kind === "job");
  
  // Also include tasks but grouped by job? For now let's just show jobs as the primary items here.
  // Actually, queryWorkstationWorkItems returns a "job" item if it has no tasks, 
  // but for this page we want to see all active jobs.
  
  const activeJobs = await db.job.findMany({
    where: { organizationId: org.id, status: JobStatus.ACTIVE },
    include: {
      customer: true,
      lead: true,
      _count: {
        select: { stages: true, tasks: true }
      }
    }
  });

  const selectedItem = selectedId ? jobItems.find((i) => i.id === selectedId) : null;
  // If not in jobItems (which only has jobs needing attention), check if it's a job at all
  const selectedJob = selectedId?.startsWith("job-") ? activeJobs.find(j => `job-${j.id}` === selectedId) : null;

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[{ label: "Workstation", href: "/workstation" }, { label: "Jobs" }]}
      />
      <PageHeader
        title="Jobs"
        description="Monitor all active jobs and identify those needing attention or next steps."
      />

      <div className="space-y-6">
        <WorkspacePanel padding="compact">
          <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
            This lens surfaces jobs in motion. Use it to track progress, identify blockers, 
            and ensure every job has a clear next step.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge label="Active job monitoring" tone="neutral" />
            <span className="text-xs text-foreground-muted">
              Real-time data from your organization&apos;s job records.
            </span>
          </div>
        </WorkspacePanel>

        {(selectedItem || selectedJob) && (
          <div id="selected-item-panel" className="scroll-mt-6">
            <WorkstationWorkPanel 
              item={selectedItem || {
                id: `job-${selectedJob!.id}`,
                kind: "job",
                title: selectedJob!.title,
                subtitle: selectedJob!.customer?.displayName || selectedJob!.lead?.title || undefined,
                status: selectedJob!.status,
                priority: "medium",
                group: "active",
                reason: "Active job in progress.",
                nextStep: "Review job status.",
                recordId: selectedJob!.id,
                href: `/jobs/${selectedJob!.id}`,
                updatedAt: selectedJob!.updatedAt,
              }}
            >
              <JobDetailWrapper jobId={(selectedItem?.recordId || selectedJob?.id)!} />
            </WorkstationWorkPanel>
          </div>
        )}

        <WorkspacePanel className="border-border-strong shadow-md ring-1 ring-ring/30">
          <SectionHeading
            title="Job attention signals"
            description="Active jobs and their current execution status."
          />
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SignalCard
              label="Active jobs"
              value={String(activeJobs.length)}
              hint="Jobs currently in motion."
            />
            <SignalCard
              label="Needs attention"
              value={String(jobItems.length)}
              hint="Jobs with no active tasks or issues."
            />
            <SignalCard
              label="Handoffs"
              value="0"
              hint="Handoff signals not wired yet."
            />
            <SignalCard
              label="Blocked"
              value="0"
              hint="Blocker signals not wired yet."
            />
          </div>

          {activeJobs.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {activeJobs.map((job) => {
                const attentionItem = jobItems.find(i => i.recordId === job.id);
                const itemId = `job-${job.id}`;
                return (
                  <AttentionCard
                    key={job.id}
                    title={job.title}
                    eyebrow="job"
                    recordLabel={job.customer?.displayName || job.lead?.title || "No linked record"}
                    severity={attentionItem ? (attentionItem.priority === "critical" ? "high" : attentionItem.priority) : "low"}
                    reason={attentionItem?.reason || "Job is active and in progress."}
                    suggestedAction={attentionItem?.nextStep || "Review job progress."}
                    href={buildWorkstationSelectHref(itemId, "job")}
                    secondaryHref={`/jobs/${job.id}`}
                    secondaryActionLabel="Open full record"
                    origin="derived"
                    isSelected={selectedId === itemId}
                  />
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={FolderKanban}
              title="No active jobs"
              description="There are no active jobs in your organization right now."
            >
              <Link href="/jobs" className={continuationLinkClass}>
                {WORKSTATION_COPY.continuation.openJobs}
              </Link>
              <Link href="/workstation" className={continuationLinkClass}>
                {WORKSTATION_COPY.continuation.backToToday}
              </Link>
            </EmptyState>
          )}
        </WorkspacePanel>
      </div>
    </div>
  );
}

async function JobDetailWrapper({ jobId }: { jobId: string }) {
  const job = await db.job.findUnique({
    where: { id: jobId },
    include: {
      stages: true,
      tasks: {
        where: { status: { in: [JobTaskStatus.TODO, JobTaskStatus.IN_PROGRESS] } },
        orderBy: { sortOrder: "asc" },
        take: 1,
      },
    },
  });

  if (!job) return null;

  const stageCount = job.stages.length;
  const activeTaskCount = await db.jobTask.count({
    where: { jobId: job.id, status: { in: [JobTaskStatus.TODO, JobTaskStatus.IN_PROGRESS] } },
  });

  return (
    <WorkstationJobPanel
      stageCount={stageCount}
      taskCount={activeTaskCount}
      nextTaskTitle={job.tasks[0]?.title}
    />
  );
}
