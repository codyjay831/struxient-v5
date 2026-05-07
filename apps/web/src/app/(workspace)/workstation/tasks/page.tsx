import Link from "next/link";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { SignalCard } from "@/components/ui/signal-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { WORKSTATION_COPY } from "@/lib/workstation-copy";
import { ClipboardList } from "lucide-react";
import { getDevOrganizationOrThrow, db } from "@/lib/db";
import { queryWorkstationWorkItems } from "@/lib/workstation-query";
import { AttentionCard } from "@/components/ui/attention-card";
import { buildWorkstationSelectHref } from "@/lib/workstation-return-href";
import { WorkstationWorkPanel } from "@/components/workstation/workstation-work-panel";
import { WorkstationTaskPanel } from "@/components/workstation/workstation-task-panel";
import { JobTaskStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const continuationLinkClass =
  "inline-flex items-center rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default async function WorkstationTasksLensPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const org = await getDevOrganizationOrThrow();
  const sp = await searchParams;
  const selectedId = typeof sp.selectedId === "string" ? sp.selectedId : undefined;

  const allItems = await queryWorkstationWorkItems(org.id);
  const taskItems = allItems.filter((i) => i.kind === "task");

  const inProgressCount = taskItems.filter(i => i.status === JobTaskStatus.IN_PROGRESS).length;
  const todoCount = taskItems.filter(i => i.status === JobTaskStatus.TODO).length;

  const selectedItem = selectedId ? taskItems.find((i) => i.id === selectedId) : null;

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[{ label: "Workstation", href: "/workstation" }, { label: "Tasks" }]}
      />
      <PageHeader
        title="Tasks"
        description="Focused view of all active tasks across your organization's jobs."
      />

      <div className="space-y-6">
        <WorkspacePanel padding="compact">
          <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
            This lens highlights tasks that are ready to start or currently in progress.
            Use this to work through your daily task list without leaving the Workstation context.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge label="Real-time task data" tone="neutral" />
            <span className="text-xs text-foreground-muted">
              Derived from active job records in this organization.
            </span>
          </div>
        </WorkspacePanel>

        {selectedItem && (
          <div id="selected-item-panel" className="scroll-mt-6">
            <WorkstationWorkPanel item={selectedItem}>
              <TaskDetailWrapper taskId={selectedItem.recordId} />
            </WorkstationWorkPanel>
          </div>
        )}

        <WorkspacePanel className="border-border-strong shadow-md ring-1 ring-ring/30">
          <SectionHeading
            title="Task attention signals"
            description="Active work items grouped by their current status and priority."
          />
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SignalCard
              label="In progress"
              value={String(inProgressCount)}
              hint="Tasks currently being worked on."
            />
            <SignalCard
              label="Ready to start"
              value={String(todoCount)}
              hint="Tasks waiting for action."
            />
            <SignalCard
              label="Blocked work"
              value="0"
              hint="No explicit blockers in this build."
            />
            <SignalCard
              label="Review needed"
              value="0"
              hint="No review signals in this build."
            />
          </div>

          {taskItems.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {taskItems.map((item) => (
                <AttentionCard
                  key={item.id}
                  title={item.title}
                  eyebrow={item.kind}
                  recordLabel={item.subtitle || ""}
                  severity={item.priority === "critical" ? "high" : item.priority}
                  reason={item.reason}
                  suggestedAction={item.nextStep}
                  href={buildWorkstationSelectHref(item.id, item.kind)}
                  secondaryHref={item.href}
                  secondaryActionLabel="Open full record"
                  origin="derived"
                  isSelected={selectedId === item.id}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={ClipboardList}
              title="No active tasks"
              description="There are no TODO or IN_PROGRESS tasks across your active jobs right now."
            >
              <Link href="/quotes" className={continuationLinkClass}>
                {WORKSTATION_COPY.continuation.openQuotes}
              </Link>
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

async function TaskDetailWrapper({ taskId }: { taskId: string }) {
  const task = await db.jobTask.findUnique({
    where: { id: taskId },
    select: { id: true, status: true, instructions: true },
  });

  if (!task) return null;

  return (
    <WorkstationTaskPanel
      taskId={task.id}
      initialStatus={task.status}
      instructions={task.instructions}
    />
  );
}
