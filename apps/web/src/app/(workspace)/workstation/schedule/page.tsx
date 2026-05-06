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
import { CalendarDays } from "lucide-react";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default function WorkstationScheduleLensPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[{ label: "Workstation", href: "/workstation" }, { label: "Schedule" }]}
      />
      <PageHeader
        title="Schedule"
        description="Schedule-related attention: conflicts, slips, confirmations, and access risk—not a calendar grid, not dispatch, and not the planning surface. For browse and future calendar density, use Work → Schedule."
      />

      <div className="space-y-6">
        <WorkspacePanel padding="compact">
          <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
          <span className="font-medium text-foreground">/workstation/schedule</span> will
          surface what needs a human decision soon—double-books, missed confirmations,
          customer access problems, and risky changes.{" "}
          <span className="font-medium text-foreground">/schedule</span> stays the Work
          planning and record home as the engine matures. This lens is{" "}
          <span className="font-medium text-foreground">not</span> crew assignment, route
          optimization, reminders, or sync.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge label="Attention slice" tone="neutral" />
          <span className="text-xs text-foreground-muted">
            No schedule signals or queries in this build
          </span>
        </div>
      </WorkspacePanel>

      <WorkspacePanel className="border-border-strong shadow-md ring-1 ring-ring/30">
        <SectionHeading
          title="Schedule attention signals"
          description="Future roll-up of timing risk across jobs and customers—each item should name the conflict or slip and who owns the fix. No calendar engine, prioritization, or RBAC runs here yet."
          actions={
            <>
              <PlaceholderButton title="No lens config in this build">
                Tune schedule lens (not wired)
              </PlaceholderButton>
              <PlaceholderButton title="No feed wiring in this build">
                Refresh signals (not wired)
              </PlaceholderButton>
            </>
          }
        />
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SignalCard
            label="Conflicts"
            value="—"
            hint="Double-books, overlaps, impossible travel."
          />
          <SignalCard
            label="Confirmation needed"
            value="—"
            hint="Appointments waiting on a yes from customer or crew."
          />
          <SignalCard
            label="Customer access risk"
            value="—"
            hint="Windows, lockouts, or site access problems."
          />
          <SignalCard
            label="Schedule changes"
            value="—"
            hint="Slips, moves, and last-minute edits needing eyes."
          />
        </div>
        <EmptyState
          icon={CalendarDays}
          title="No schedule attention signals"
          description="No fabricated holds, conflicts, or counts—everything stays at — until persistence and a real scheduling layer exist. This page does not create or move appointments."
        />
      </WorkspacePanel>

      <WorkspacePanel padding="compact">
        <SectionHeading
          title="Connections"
          description="Jump to planning and records—navigation only."
        />
        <div className="flex flex-wrap gap-2">
          <Link href="/schedule" className={handoffPrimaryLinkClass}>
            Schedule planning (/schedule)
          </Link>
          <Link href="/jobs" className={listLinkClass}>
            Job records
          </Link>
          <Link href="/customers" className={listLinkClass}>
            Customers
          </Link>
          <Link href="/workstation" className={listLinkClass}>
            Workstation home
          </Link>
        </div>
      </WorkspacePanel>

      <HandoffPanel
        title="Schedule lens watches timing risk"
        description="Later, this feed pulls from jobs, customer availability and access, crew capacity assumptions, and change events—without replacing the planning calendar at /schedule or turning Workstation into dispatch."
      >
        <Link href="/schedule" className={handoffPrimaryLinkClass}>
          Work → Schedule
        </Link>
        <Link href="/jobs" className={handoffMutedLinkClass}>
          Jobs
        </Link>
        <Link href="/customers" className={handoffMutedLinkClass}>
          Customers
        </Link>
        <Link href="/workstation" className={handoffMutedLinkClass}>
          Workstation home
        </Link>
      </HandoffPanel>
    </div>
    </div>
  );
}
