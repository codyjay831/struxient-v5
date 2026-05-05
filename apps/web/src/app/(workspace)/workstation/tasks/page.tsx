import Link from "next/link";
import {
  HandoffPanel,
  handoffMutedLinkClass,
  handoffPrimaryLinkClass,
} from "@/components/ui/handoff-panel";
import { SectionHeader } from "@/components/shell/section-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { PlaceholderButton } from "@/components/ui/placeholder-button";
import { SignalCard } from "@/components/ui/signal-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ClipboardList } from "lucide-react";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default function WorkstationTasksLensPage() {
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Workstation · Tasks lens"
        title="Tasks"
        description="Cross-cutting attention for action items—not where you author tasks, run the execution engine, or browse a flat catalog. When tasks exist, this lens answers what needs doing next across quotes, jobs, and field work."
      />

      <WorkspacePanel padding="compact">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          Tasks lens vs authoring and engines
        </p>
        <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
          <span className="font-medium text-foreground">/workstation/tasks</span> will
          highlight assigned, blocked, review-needed, and ready-next items. It is{" "}
          <span className="font-medium text-foreground">not</span> quote or job authoring,
          not runtime sequencing, and not a replacement for record pages under Sales,
          Relationships, or Work.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge label="Attention slice" tone="neutral" />
          <span className="text-xs text-foreground-muted">
            No task signals or queries in this build
          </span>
        </div>
      </WorkspacePanel>

      <WorkspacePanel className="border-border-strong shadow-md ring-1 ring-ring/30">
        <SectionHeading
          title="Task attention signals"
          description="Future aggregation across quote prep, job execution, reviews, and issues—each row should carry ownership and a clear next step. No prioritization engine or RBAC filtering runs here yet."
          actions={
            <>
              <PlaceholderButton title="No lens config in this build">
                Tune task lens (soon)
              </PlaceholderButton>
              <PlaceholderButton title="No feed wiring in this build">
                Refresh signals (soon)
              </PlaceholderButton>
            </>
          }
        />
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SignalCard
            label="Assigned action items"
            value="—"
            hint="Work with your name on it across jobs."
          />
          <SignalCard
            label="Blocked work"
            value="—"
            hint="Waiting on customer, parts, permit, or payment."
          />
          <SignalCard
            label="Review needed"
            value="—"
            hint="Photos, completions, quotes, or COs awaiting eyes."
          />
          <SignalCard
            label="Ready for next step"
            value="—"
            hint="Unblocked work that still needs a decision or dispatch."
          />
        </div>
        <EmptyState
          icon={ClipboardList}
          title="No task attention signals"
          description="No fabricated tasks, blockers, or priorities—counts stay at — until persistence and a real task model exist. This page does not create or mutate work."
        />
      </WorkspacePanel>

      <WorkspacePanel padding="compact">
        <SectionHeading
          title="Connections"
          description="Jump to where records and planning live—navigation only."
        />
        <div className="flex flex-wrap gap-2">
          <Link href="/workstation" className={handoffPrimaryLinkClass}>
            Workstation home
          </Link>
          <Link href="/jobs" className={listLinkClass}>
            Job records
          </Link>
          <Link href="/quotes" className={listLinkClass}>
            Quotes
          </Link>
          <Link href="/schedule" className={listLinkClass}>
            Schedule
          </Link>
        </div>
      </WorkspacePanel>

      <HandoffPanel
        title="Tasks lens pulls attention from everywhere"
        description="Later, quote prep, active jobs, schedule pressure, reviews, and issues will all surface actionable items here. Authoritative rows still live under Sales, Relationships, and Work—this strip only aggregates what needs a human."
      >
        <Link href="/workstation" className={handoffPrimaryLinkClass}>
          Workstation home
        </Link>
        <Link href="/jobs" className={handoffMutedLinkClass}>
          Jobs
        </Link>
        <Link href="/quotes" className={handoffMutedLinkClass}>
          Quotes
        </Link>
        <Link href="/schedule" className={handoffMutedLinkClass}>
          Schedule
        </Link>
      </HandoffPanel>
    </div>
  );
}
