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
import { FolderKanban } from "lucide-react";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default function WorkstationJobsLensPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[{ label: "Workstation", href: "/workstation" }, { label: "Jobs" }]}
      />
      <PageHeader
        title="Jobs"
        description="Reserved job-attention layout—no signals loaded. For the job directory placeholder and detail shell, use Work → Jobs."
      />

      <div className="space-y-6">
        <WorkspacePanel padding="compact">
          <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
          <span className="font-medium text-foreground">/workstation/jobs</span> surfaces
          what needs eyes on work in motion.{" "}
          <span className="font-medium text-foreground">/jobs</span> stays the browse and
          record directory; <span className="font-medium text-foreground">/jobs/[id]</span>{" "}
          is the job workspace shell.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge label="Attention slice" tone="neutral" />
          <span className="text-xs text-foreground-muted">
            No job signals loaded in this build
          </span>
        </div>
      </WorkspacePanel>

      <WorkspacePanel className="border-border-strong shadow-md ring-1 ring-ring/30">
        <SectionHeading
          title="Job attention signals"
          description="When wired, this lens could highlight execution handoffs, timing blockers, issue noise, and jobs ready for the next step—without replacing the job record."
          actions={
            <PlaceholderButton title="No signal query in this build">
              Tune lens (not wired)
            </PlaceholderButton>
          }
        />
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SignalCard
            label="Execution handoff (reserved)"
            value="—"
            hint="Future deliberate start checks—not run here."
          />
          <SignalCard
            label="Schedule blockers"
            value="—"
            hint="Conflicts, slips, or missing windows."
          />
          <SignalCard
            label="Issues / changes"
            value="—"
            hint="Field interruptions and CO noise later."
          />
          <SignalCard
            label="Ready for next step"
            value="—"
            hint="Green-light work that still needs assignment."
          />
        </div>
        <EmptyState
          icon={FolderKanban}
          title="No job attention signals"
          description="Counts stay at —; no fabricated jobs, priorities, or filters. When persistence exists, this lens queries differently than the /jobs directory."
        />
      </WorkspacePanel>

      <WorkspacePanel padding="compact">
        <SectionHeading
          title="Connections"
          description="Jump to record and planning surfaces—navigation only, no cross-route sync."
        />
        <div className="flex flex-wrap gap-2">
          <Link href="/jobs" className={handoffPrimaryLinkClass}>
            Job records (/jobs)
          </Link>
          <Link href="/schedule" className={listLinkClass}>
            Schedule planning
          </Link>
          <Link href="/quotes" className={listLinkClass}>
            Quotes
          </Link>
        </div>
      </WorkspacePanel>

      <HandoffPanel
        title="Job lens watches work in motion"
        description="Attention layout only; authoritative job rows stay on Work → Jobs. Schedule planning stays on Work → Schedule. Nothing here queries org data yet."
      >
        <Link href="/jobs" className={handoffMutedLinkClass}>
          Jobs list
        </Link>
        <Link href="/schedule" className={handoffMutedLinkClass}>
          Schedule
        </Link>
        <Link href="/quotes" className={handoffMutedLinkClass}>
          Quotes
        </Link>
        <Link href="/workstation" className={handoffPrimaryLinkClass}>
          Workstation home
        </Link>
      </HandoffPanel>
    </div>
    </div>
  );
}
