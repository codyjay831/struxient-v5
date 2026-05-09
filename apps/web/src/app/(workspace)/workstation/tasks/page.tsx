import Link from "next/link";
import { WORKSTATION_COPY } from "@/lib/workstation-copy";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { queryWorkstationWorkItems } from "@/lib/workstation-query";
import { buildWorkstationSelectHref } from "@/lib/workstation-return-href";
import { WorkstationWorkPanel } from "@/components/workstation/workstation-work-panel";
import { TaskWorkSurface } from "@/components/jobs/task-work-surface";
import { loadJobTaskExecutionPayload } from "@/lib/job-task-execution-loader";
import { JobTaskStatus } from "@prisma/client";
import { 
  WorkstationQueueItem, 
  WorkstationClearedState 
} from "@/components/workstation/workstation-ui";

export const dynamic = "force-dynamic";

export default async function WorkstationTasksLensPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const ctx = await getRequestContextOrThrow();
  const sp = await searchParams;
  const selectedId = typeof sp.selectedId === "string" ? sp.selectedId : undefined;

  const allItems = await queryWorkstationWorkItems(ctx.organizationId);
  const taskItems = allItems.filter((i) => i.kind === "task");

  const inProgressCount = taskItems.filter(i => i.status === JobTaskStatus.IN_PROGRESS).length;

  const selectedItem = selectedId ? taskItems.find((i) => i.id === selectedId) : null;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-foreground-subtle">
          Active Tasks
        </h2>
        <div className="flex items-center gap-4 text-xs font-medium text-foreground-muted">
          <span>{taskItems.length} total tasks</span>
          {inProgressCount > 0 && (
            <span className="flex items-center gap-1 text-accent">
              <span className="size-1.5 rounded-full bg-accent" />
              {inProgressCount} in progress
            </span>
          )}
        </div>
      </div>

      {selectedItem && (
        <div id="selected-item-panel" className="scroll-mt-6">
          <WorkstationWorkPanel item={selectedItem}>
            <TaskDetailWrapper taskId={selectedItem.recordId} />
          </WorkstationWorkPanel>
        </div>
      )}

      {taskItems.length > 0 ? (
        <div className="grid gap-2">
          {taskItems.map((item) => (
            <WorkstationQueueItem
              key={item.id}
              item={{
                ...item,
                href: buildWorkstationSelectHref(item.id, item.kind)
              }}
              isSelected={selectedId === item.id}
            />
          ))}
        </div>
      ) : (
        <WorkstationClearedState />
      )}

      <div className="mt-12 flex flex-wrap gap-4 border-t border-border pt-8">
        <Link href="/quotes" className="text-xs font-bold uppercase tracking-widest text-foreground-muted hover:text-foreground">
          {WORKSTATION_COPY.continuation.openQuotes}
        </Link>
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

async function TaskDetailWrapper({ taskId }: { taskId: string }) {
  const ctx = await getRequestContextOrThrow();
  const payload = await loadJobTaskExecutionPayload(taskId, ctx.organizationId);

  if (!payload) return null;

  return <TaskWorkSurface {...payload} clearWorkstationSelectionOnComplete />;
}
