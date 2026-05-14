import Link from "next/link";
import { WORKSTATION_COPY } from "@/lib/workstation-copy";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { queryWorkstationWorkItems } from "@/lib/workstation-query";
import {
  parseWorkstationUrlState,
  buildWorkstationUrl,
} from "@/lib/workstation/url-state";
import { WorkstationWorkPanel } from "@/components/workstation/workstation-work-panel";
import { TaskWorkSurface } from "@/components/jobs/task-work-surface";
import { loadJobTaskExecutionPayload } from "@/lib/job-task-execution-loader";
import {
  WorkstationQueueItem,
  WorkstationClearedState,
} from "@/components/workstation/workstation-ui";

export const dynamic = "force-dynamic";

export default async function WorkstationTasksLensPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const ctx = await getRequestContextOrThrow();
  const sp = await searchParams;
  const urlState = parseWorkstationUrlState(sp);
  const selectedId = urlState.selected?.id;

  const allItems = await queryWorkstationWorkItems(ctx.organizationId, ctx.role);
  const taskItems = allItems.filter((i) => i.kind === "task");

  const selectedItem = selectedId ? taskItems.find((i) => i.id === selectedId) : null;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-foreground-subtle">
          Active Tasks
        </h2>
        <div className="flex items-center gap-4 text-xs font-medium text-foreground-muted">
          <span>{taskItems.length} total tasks</span>
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
                href: buildWorkstationUrl(urlState, {
                  selected: { id: item.id, kind: item.kind }
                })
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

  const { getLiveSignals } = await import("@/lib/signal-bus");
  const liveSignals = await getLiveSignals(payload.jobId);

  return <TaskWorkSurface {...payload} liveSignals={liveSignals} clearWorkstationSelectionOnComplete />;
}
