import Link from "next/link";
import {
  HandoffPanel,
  handoffMutedLinkClass,
  handoffPrimaryLinkClass,
} from "@/components/ui/handoff-panel";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { PlaceholderButton } from "@/components/ui/placeholder-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { SignalCard } from "@/components/ui/signal-card";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  CalendarDays,
  CalendarRange,
  Gauge,
  Users,
  UserRound,
} from "lucide-react";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default function ScheduleRecordPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[{ label: "Work" }, { label: "Schedule" }]}
      />
      <PageHeader
        eyebrow="Work"
        title="Schedule"
        description="Work planning and browse surface for timing—not a live calendar yet. When data exists, this coordinates jobs, customer access windows, crew capacity, and what Workstation is asking people to look at next."
        actions={
          <>
            <PlaceholderButton title="No schedule store in this build">
              Add schedule item (soon)
            </PlaceholderButton>
            <PlaceholderButton title="No ICS feed in this build">
              Subscribe (ICS) (soon)
            </PlaceholderButton>
          </>
        }
      />

      {/* Schedule identity / page role */}
      <WorkspacePanel padding="compact" className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          This page&apos;s role
        </p>
        <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
          <span className="font-medium text-foreground">Work → Schedule</span> is the
          catalog and planning home for time-based work.{" "}
          <Link
            href="/workstation/schedule"
            className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
          >
            Workstation → Schedule
          </Link>{" "}
          stays the attention lens—near-term risk and items that need a decision—not a
          replacement for this route.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge label="Planning surface" tone="neutral" />
          <span className="text-xs text-foreground-muted">
            Shell only—no persisted events or engine
          </span>
        </div>
      </WorkspacePanel>

      <div className="space-y-6">
        {/* Primary: what this calendar coordinates */}
        <WorkspacePanel className="border-border-strong shadow-md ring-1 ring-ring/30">
          <SectionHeading
            title="What this calendar coordinates"
            description="One place to line up Jobs that need time, customer availability, how much crew capacity you have, and what Workstation is surfacing as schedule attention—once persistence and engines exist."
            actions={
              <PlaceholderButton title="No planner in this build">
                Plan schedule (soon)
              </PlaceholderButton>
            }
          />
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SignalCard
              label="Jobs needing time"
              value="—"
              hint="Work records that need holds or visits."
            />
            <SignalCard
              label="Customer availability"
              value="—"
              hint="Access windows and preferences later."
            />
            <SignalCard
              label="Crew capacity"
              value="—"
              hint="Rough load—not dispatch or payroll."
            />
            <SignalCard
              label="Workstation attention"
              value="—"
              hint="What needs a human decision soon."
            />
          </div>
          <p className="mb-4 rounded-lg border border-border bg-foreground/[0.02] px-3 py-2 text-xs leading-relaxed text-foreground-muted">
            Commercial terms and payment truth stay on{" "}
            <span className="font-medium text-foreground">Quotes</span> until approval;
            relationship and contact context stay on{" "}
            <span className="font-medium text-foreground">Customers</span>. Schedule only
            answers when and where work can happen.
          </p>
          <EmptyState
            icon={CalendarDays}
            title="No schedule rows yet"
            description="There is no calendar engine, no mock appointments, and no fake dates. After persistence, appointments, holds, and job-linked windows will render here."
          >
            <PlaceholderButton title="No editor in this build">
              Add schedule item (soon)
            </PlaceholderButton>
            <Link href="/jobs" className={listLinkClass}>
              Jobs
            </Link>
            <Link href="/workstation/schedule" className={listLinkClass}>
              Workstation schedule lens
            </Link>
          </EmptyState>
        </WorkspacePanel>

        {/* Schedule readiness / empty planning */}
        <WorkspacePanel>
          <SectionHeading
            title="Schedule readiness"
            description="Future schedule will coordinate job readiness, appointments, customer access windows, crew capacity, and reminders. None of that runs in this build."
          />
          <EmptyState
            icon={CalendarRange}
            title="No live calendar"
            description="No month/week/day grid, no drag-reschedule, no sync—only honest empty space until backed entities and a real calendar ship."
          >
            <PlaceholderButton title="No calendar in this build">
              Open calendar (soon)
            </PlaceholderButton>
          </EmptyState>
        </WorkspacePanel>

        {/* Customer availability */}
        <WorkspacePanel>
          <SectionHeading
            title="Customer availability"
            description="Later, access windows and preferences from the customer relationship can shape when you book work—without building a portal or intake forms in this pass."
          />
          <EmptyState
            icon={UserRound}
            title="No availability signals"
            description="No customer-facing availability capture yet; when it exists it feeds scheduling suggestions, not this empty shell."
          >
            <Link href="/customers" className={listLinkClass}>
              Customers
            </Link>
          </EmptyState>
        </WorkspacePanel>

        {/* Crew capacity */}
        <WorkspacePanel>
          <SectionHeading
            title="Crew capacity"
            description="Future view of how much field time you have—not employee files, payroll, roles, dispatch boards, or assignments. Those stay out of this shell."
          />
          <EmptyState
            icon={Users}
            title="No capacity model"
            description="Rough headcount or trade load may recommend windows later; nothing is calculated here."
          >
            <PlaceholderButton title="No capacity engine in this build">
              Set capacity (soon)
            </PlaceholderButton>
          </EmptyState>
        </WorkspacePanel>

        {/* Workstation attention */}
        <WorkspacePanel padding="compact">
          <SectionHeading
            title="Workstation attention"
            description="The Workstation Schedule lens lists items that need eyes soon—conflicts, slips, and near-term holds—not the full catalog you plan on this page."
          />
          <EmptyState
            icon={Gauge}
            title="Open the attention lens"
            description="Nothing aggregates here; jump to Workstation when you want the “what needs a decision” slice."
          >
            <Link href="/workstation/schedule" className={listLinkClass}>
              Workstation → Schedule
            </Link>
          </EmptyState>
        </WorkspacePanel>

        <HandoffPanel
          title="Schedule sits between records and the field"
          description="Schedule coordinates Work timing around Jobs. Quotes stay under Sales until approval. Customer context lives under Relationships. Workstation shows what needs attention—including schedule risk—without replacing this planning surface."
        >
          <Link href="/jobs" className={handoffMutedLinkClass}>
            Jobs
          </Link>
          <Link href="/quotes" className={handoffMutedLinkClass}>
            Quotes
          </Link>
          <Link href="/customers" className={handoffMutedLinkClass}>
            Customers
          </Link>
          <Link href="/workstation/schedule" className={handoffPrimaryLinkClass}>
            Workstation schedule
          </Link>
        </HandoffPanel>
      </div>
    </div>
  );
}
