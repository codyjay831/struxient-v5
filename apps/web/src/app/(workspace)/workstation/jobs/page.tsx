import { WORKSTATION_COPY } from "@/lib/workstation-copy";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { queryWorkstationWorkItems } from "@/lib/workstation-query";
import { getJobVisibilityWhere } from "@/lib/authz/resource-access";
import {
  parseWorkstationUrlState,
  buildWorkstationUrl,
} from "@/lib/workstation/url-state";
import { WorkstationSelectionModal } from "@/components/workstation/workstation-selection-modal";
import { usesGenericPanel } from "@/lib/workstation/uses-generic-panel";
import { WorkstationJobPanel } from "@/components/workstation/workstation-job-panel";
import { JobTaskStatus, JobStatus } from "@prisma/client";
import { 
  WorkstationQueueItem, 
  WorkstationClearedState 
} from "@/components/workstation/workstation-ui";
import { ButtonLink } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function WorkstationJobsLensPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const ctx = await getRequestContextOrThrow();
  const sp = await searchParams;
  const urlState = parseWorkstationUrlState(sp);
  if (urlState.selected && urlState.selected.kind !== "job") {
    const cleared = buildWorkstationUrl(urlState, { selected: undefined });
    redirect(`/workstation/jobs${cleared}`);
  }
  const selectedId = urlState.selected?.id;

  const allItems = await queryWorkstationWorkItems(ctx.organizationId, ctx.role, ctx.userId);
  const jobItems = allItems.filter((i) => i.kind === "job");
  
  const activeJobs = await db.job.findMany({
    where: {
      organizationId: ctx.organizationId,
      status: JobStatus.ACTIVE,
      ...getJobVisibilityWhere(ctx.role, ctx.userId),
    },
    include: {
      customer: true,
      lead: true,
    }
  });

  const selectedItem = selectedId ? jobItems.find((i) => i.id === selectedId) : null;
  const selectedJob = selectedId?.startsWith("job-") ? activeJobs.find(j => `job-${j.id}` === selectedId) : null;

  const resolvedSelectedItem =
    selectedItem ??
    (selectedJob
      ? {
          id: `job-${selectedJob.id}`,
          kind: "job" as const,
          title: selectedJob.title,
          subtitle:
            selectedJob.customer?.displayName ||
            selectedJob.lead?.title ||
            undefined,
          status: selectedJob.status,
          priority: "medium" as const,
          group: "active" as const,
          lane: "due" as const,
          withinLaneRank: 0,
          lens: "today" as const,
          filterCategory: "jobs" as const,
          reason: "Active job in progress.",
          nextStep: "Review job status.",
          recordId: selectedJob.id,
          href: `/jobs/${selectedJob.id}`,
          updatedAt: selectedJob.updatedAt,
        }
      : null);
  if (selectedId && !resolvedSelectedItem) {
    const cleared = buildWorkstationUrl(urlState, { selected: undefined });
    redirect(`/workstation/jobs${cleared}`);
  }

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

      <WorkstationSelectionModal
        item={resolvedSelectedItem}
        genericContent={
          resolvedSelectedItem && usesGenericPanel(resolvedSelectedItem) ? (
            <JobDetailWrapper jobId={resolvedSelectedItem.recordId} />
          ) : undefined
        }
      />

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
                  parentLabel: job.customer?.displayName || job.lead?.title || undefined,
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
        <ButtonLink href="/workstation" variant="ghost" size="sm">
          {WORKSTATION_COPY.continuation.backToToday}
        </ButtonLink>
      </div>
    </div>
  );
}

async function JobDetailWrapper({ jobId }: { jobId: string }) {
  const ctx = await getRequestContextOrThrow();
  const job = await db.job.findFirst({
    where: {
      id: jobId,
      organizationId: ctx.organizationId,
      ...getJobVisibilityWhere(ctx.role, ctx.userId),
    },
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
      job: {
        organizationId: ctx.organizationId,
        ...getJobVisibilityWhere(ctx.role, ctx.userId),
      },
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
