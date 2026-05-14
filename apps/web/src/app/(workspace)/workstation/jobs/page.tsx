import Link from "next/link";
import { WORKSTATION_COPY } from "@/lib/workstation-copy";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { queryWorkstationWorkItems } from "@/lib/workstation-query";
import {
  parseWorkstationUrlState,
  buildWorkstationUrl,
} from "@/lib/workstation/url-state";
import { WorkstationWorkPanel } from "@/components/workstation/workstation-work-panel";
import { WorkstationJobPanel } from "@/components/workstation/workstation-job-panel";
import { JobTaskStatus, JobStatus } from "@prisma/client";
import { 
  WorkstationQueueItem, 
  WorkstationClearedState 
} from "@/components/workstation/workstation-ui";

export const dynamic = "force-dynamic";

export default async function WorkstationJobsLensPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const ctx = await getRequestContextOrThrow();
  const sp = await searchParams;
  const urlState = parseWorkstationUrlState(sp);
  const selectedId = urlState.selected?.id;

  const allItems = await queryWorkstationWorkItems(ctx.organizationId, ctx.role);
  const jobItems = allItems.filter((i) => i.kind === "job");
  
  const activeJobs = await db.job.findMany({
    where: { organizationId: ctx.organizationId, status: JobStatus.ACTIVE },
    include: {
      customer: true,
      lead: true,
    }
  });

  const selectedItem = selectedId ? jobItems.find((i) => i.id === selectedId) : null;
  const selectedJob = selectedId?.startsWith("job-") ? activeJobs.find(j => `job-${j.id}` === selectedId) : null;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-foreground-subtle">
          Active Jobs
        </h2>
        <div className="flex items-center gap-4 text-xs font-medium text-foreground-muted">
          <span>{activeJobs.length} active jobs</span>
          {jobItems.length > 0 && (
            <span className="flex items-center gap-1 text-danger">
              <span className="size-1.5 rounded-full bg-danger" />
              {jobItems.length} need attention
            </span>
          )}
        </div>
      </div>

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
              lane: "due",
              withinLaneRank: 0,
              lens: "today",
              filterCategory: "jobs",
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

      {activeJobs.length > 0 ? (
        <div className="grid gap-2">
          {activeJobs.map((job) => {
            const attentionItem = jobItems.find(i => i.recordId === job.id);
            const itemId = `job-${job.id}`;
            return (
              <WorkstationQueueItem
                key={job.id}
                item={{
                  id: itemId,
                  kind: "job",
                  title: job.title,
                  subtitle: job.customer?.displayName || job.lead?.title || "No linked record",
                  priority: attentionItem?.priority || "medium",
                  lane: attentionItem?.lane || "due",
                  withinLaneRank: attentionItem?.withinLaneRank || 0,
                  lens: attentionItem?.lens || "today",
                  filterCategory: "jobs",
                  reason: attentionItem?.reason || "Job is active and in progress.",
                  nextStep: attentionItem?.nextStep || "Review job progress.",
                  href: buildWorkstationUrl(urlState, {
                    selected: { id: itemId, kind: "job" }
                  }),
                  group: attentionItem?.group || "active",
                  recordId: job.id,
                  updatedAt: job.updatedAt,
                }}
                isSelected={selectedId === itemId}
              />
            );
          })}
        </div>
      ) : (
        <WorkstationClearedState />
      )}

      <div className="mt-12 flex flex-wrap gap-4 border-t border-border pt-8">
        <Link href="/jobs" className="text-xs font-bold uppercase tracking-widest text-foreground-muted hover:text-foreground">
          {WORKSTATION_COPY.continuation.openJobs}
        </Link>
        <Link href="/workstation" className="text-xs font-bold uppercase tracking-widest text-foreground-muted hover:text-foreground">
          {WORKSTATION_COPY.continuation.backToToday}
        </Link>
      </div>
    </div>
  );
}

async function JobDetailWrapper({ jobId }: { jobId: string }) {
  const ctx = await getRequestContextOrThrow();
  const job = await db.job.findFirst({
    where: { id: jobId, organizationId: ctx.organizationId },
    include: {
      stages: true,
      tasks: {
        where: { status: JobTaskStatus.TODO },
        orderBy: { sortOrder: "asc" },
        take: 1,
      },
    },
  });

  if (!job) return null;

  const stageCount = job.stages.length;
  const activeTaskCount = await db.jobTask.count({
    where: {
      jobId: job.id,
      status: JobTaskStatus.TODO,
      job: { organizationId: ctx.organizationId },
    },
  });

  return (
    <WorkstationJobPanel
      stageCount={stageCount}
      taskCount={activeTaskCount}
      nextTaskTitle={job.tasks[0]?.title}
    />
  );
}
