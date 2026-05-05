import Link from "next/link";
import {
  HandoffPanel,
  handoffMutedLinkClass,
  handoffPrimaryLinkClass,
} from "@/components/ui/handoff-panel";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { PlaceholderButton } from "@/components/ui/placeholder-button";
import { SignalCard } from "@/components/ui/signal-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Activity, CalendarDays, ClipboardList, FolderKanban } from "lucide-react";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default function WorkstationTodayLensPage() {
  return (
    <div className="space-y-6">
      <WorkspacePanel padding="compact">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          This surface
        </p>
        <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
          Workstation is the attention strip: what needs a decision, a follow-up, or a
          handoff—not where you browse every job row or calendar cell. Sales, Customers,
          Jobs, and Schedule stay the record and planning homes until you jump back here
          for signals.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge label="Attention feed" tone="neutral" />
          <span className="text-xs text-foreground-muted">
            No live aggregation in this build
          </span>
        </div>
      </WorkspacePanel>

      <WorkspacePanel className="border-border-strong shadow-md ring-1 ring-ring/30">
        <SectionHeading
          title="What needs attention"
          description="Cross-domain signals roll up here later: job risk, schedule slips, quote follow-ups, and customer callbacks. Not a flat task list—each item should carry an owner and a next step when persistence exists."
          actions={
            <PlaceholderButton title="No feed wiring in this build">
              Refresh feed (soon)
            </PlaceholderButton>
          }
        />
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SignalCard
            label="Jobs needing review"
            value="—"
            hint="Activation, holds, or readiness gaps."
          />
          <SignalCard
            label="Schedule conflicts"
            value="—"
            hint="Slips and double-books needing a human."
          />
          <SignalCard
            label="Quote follow-ups"
            value="—"
            hint="Sent, revised, or waiting on approval."
          />
          <SignalCard
            label="Payment holds"
            value="—"
            hint="Failed collection or overdue funds later."
          />
        </div>
        <EmptyState
          icon={Activity}
          title="No attention items yet"
          description="There is no prioritization engine, no fake queue, and no role matrix behind this screen—only layout proving where live signals will land."
        />
      </WorkspacePanel>

      <section>
        <SectionHeading
          title="Lenses"
          description="Each lens is a filtered slice of the same operational world—narrower than dumping everything into one list."
        />
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <WorkspacePanel padding="compact" className="flex flex-col">
            <div className="mb-2 flex items-center gap-2">
              <ClipboardList
                className="size-5 text-foreground-subtle opacity-80"
                strokeWidth={1.25}
                aria-hidden
              />
              <h3 className="text-sm font-semibold text-foreground">Tasks lens</h3>
            </div>
            <p className="mb-4 flex-1 text-xs leading-relaxed text-foreground-muted">
              Future home for assigned, blocked, and unclaimed action items across
              jobs—not a task engine yet, just the attention slice.
            </p>
            <Link href="/workstation/tasks" className={listLinkClass}>
              Open tasks lens
            </Link>
          </WorkspacePanel>
          <WorkspacePanel padding="compact" className="flex flex-col">
            <div className="mb-2 flex items-center gap-2">
              <FolderKanban
                className="size-5 text-foreground-subtle opacity-80"
                strokeWidth={1.25}
                aria-hidden
              />
              <h3 className="text-sm font-semibold text-foreground">Jobs lens</h3>
            </div>
            <p className="mb-4 flex-1 text-xs leading-relaxed text-foreground-muted">
              Job-centric risk and readiness—different from the full job directory under
              Work → Jobs.
            </p>
            <Link href="/workstation/jobs" className={listLinkClass}>
              Open jobs lens
            </Link>
          </WorkspacePanel>
          <WorkspacePanel padding="compact" className="flex flex-col">
            <div className="mb-2 flex items-center gap-2">
              <CalendarDays
                className="size-5 text-foreground-subtle opacity-80"
                strokeWidth={1.25}
                aria-hidden
              />
              <h3 className="text-sm font-semibold text-foreground">Schedule lens</h3>
            </div>
            <p className="mb-4 flex-1 text-xs leading-relaxed text-foreground-muted">
              Near-term schedule risk and decisions—not the planning calendar at Work →
              Schedule.
            </p>
            <Link href="/workstation/schedule" className={listLinkClass}>
              Open schedule lens
            </Link>
          </WorkspacePanel>
        </div>
      </section>

      <HandoffPanel
        title="Attention pulls from the rest of Struxient"
        description="Quotes and leads sit under Sales. Customer relationships sit under Relationships. Jobs and the planning calendar sit under Work. Payments live under Finance. Workstation watches all of it for what needs a human next."
      >
        <Link href="/quotes" className={handoffMutedLinkClass}>
          Quotes
        </Link>
        <Link href="/customers" className={handoffMutedLinkClass}>
          Customers
        </Link>
        <Link href="/jobs" className={handoffPrimaryLinkClass}>
          Job records
        </Link>
        <Link href="/schedule" className={handoffMutedLinkClass}>
          Schedule
        </Link>
        <Link href="/payments" className={handoffMutedLinkClass}>
          Payments
        </Link>
      </HandoffPanel>
    </div>
  );
}
