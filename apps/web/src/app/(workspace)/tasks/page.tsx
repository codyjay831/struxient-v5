import Link from "next/link";
import {
  HandoffPanel,
  handoffMutedLinkClass,
  handoffPrimaryLinkClass,
} from "@/components/ui/handoff-panel";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { PlaceholderButton } from "@/components/ui/placeholder-button";
import { SignalCard } from "@/components/ui/signal-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ClipboardList } from "lucide-react";

/**
 * Standalone `/tasks` — conservative stub. No task catalog, engine, or CRUD.
 * Attention-shaped task signals live under Workstation → Tasks.
 */
export default function TasksDeferredPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb items={[{ label: "Work" }, { label: "Tasks" }]} />
      <PageHeader
        eyebrow="Work"
        title="Tasks"
        description="Runtime tasks and a task graph are intentionally deferred. This route is an honest stub—not a database, board, or engine. Quotes, customers, and reserved Work shells stay authoritative until execution persistence exists."
        actions={
          <PlaceholderButton title="No task system in this build">
            New task (not available)
          </PlaceholderButton>
        }
      />

      <WorkspacePanel padding="compact" className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          Current task-facing surface
        </p>
        <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
          Use{" "}
          <Link
            href="/workstation/tasks"
            className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
          >
            Workstation → Tasks
          </Link>{" "}
          for the attention lens (placeholders only today). This{" "}
          <span className="font-mono text-xs text-foreground-subtle">/tasks</span> page
          exists so old links do not imply a hidden task product—it explains the deferral
          instead.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge label="System deferred" tone="neutral" />
          <span className="text-xs text-foreground-muted">
            No records, no engine, no assignment
          </span>
        </div>
      </WorkspacePanel>

      <WorkspacePanel className="mb-6">
        <SectionHeading
          title="Task system deferred"
          description="When Struxient ships real tasks, they will span quote prep, job execution, and reviews—with ownership and blockers. None of that is wired in v5 shells yet."
        />
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SignalCard
            label="Assigned work"
            value="—"
            hint="Future cross-job queue."
          />
          <SignalCard
            label="Blocked work"
            value="—"
            hint="Future attributable stops."
          />
          <SignalCard
            label="Review needed"
            value="—"
            hint="Future evidence and sign-off flows."
          />
          <SignalCard
            label="Ready next"
            value="—"
            hint="Future unblocked next steps."
          />
        </div>
        <EmptyState
          icon={ClipboardList}
          title="No task records"
          description="No rows, no statuses, and no filters—only honest empty space until models and org-scoped queries exist."
        />
      </WorkspacePanel>

      <HandoffPanel
        title="Where to look meanwhile"
        description="Follow quotes under Sales, customers under Relationships, and reserved job/schedule shells under Work. Workstation remains a static attention layout until real signals exist."
      >
        <Link href="/workstation/tasks" className={handoffPrimaryLinkClass}>
          Workstation Tasks lens
        </Link>
        <Link href="/jobs" className={handoffMutedLinkClass}>
          Jobs
        </Link>
        <Link href="/sales?tab=proposals" className={handoffMutedLinkClass}>
          Quotes
        </Link>
      </HandoffPanel>
    </div>
  );
}
