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
import { LEAD_PIPELINE_OPEN_STATUSES } from "@/lib/lead-display";
import { db, getDevOrganizationOrThrow } from "@/lib/db";
import { Activity, CalendarDays, ClipboardList, FolderKanban } from "lucide-react";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export const dynamic = "force-dynamic";

export default async function WorkstationTodayLensPage() {
  const org = await getDevOrganizationOrThrow();
  const [openPipelineLeads, unlinkedLeads, totalLeads] = await Promise.all([
    db.lead.count({
      where: {
        organizationId: org.id,
        status: { in: [...LEAD_PIPELINE_OPEN_STATUSES] },
      },
    }),
    db.lead.count({
      where: { organizationId: org.id, customerId: null },
    }),
    db.lead.count({ where: { organizationId: org.id } }),
  ]);

  return (
    <div className="space-y-6">
      <WorkspacePanel padding="compact">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          This surface
        </p>
        <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
          Workstation is a reserved command surface: layout for future cross-area signals,
          not a quote dashboard and not orchestrating runtime execution. Only the lead
          counts below read the database; everything else on this page is an honest
          placeholder until runtime execution records exist.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge label="Org-scoped lead counts" tone="neutral" />
          <span className="text-xs text-foreground-muted">
            Real counts for leads only; job, schedule, quote, and money rollups are not wired.
          </span>
        </div>
      </WorkspacePanel>

      <WorkspacePanel padding="compact" className="border-border-strong shadow-sm ring-1 ring-ring/20">
        <SectionHeading
          title="Sales intake (this organization)"
          description="Cheap counts only—no match scanning, no task engine, not a CRM dashboard. Open pipeline means status Open or Qualifying (manual)."
        />
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <SignalCard
            label="Open pipeline leads"
            value={String(openPipelineLeads)}
            hint="Statuses Open or Qualifying."
          />
          <SignalCard
            label="Unlinked leads"
            value={String(unlinkedLeads)}
            hint="No customer linked yet."
          />
          <SignalCard label="All leads" value={String(totalLeads)} hint="Intake rows in this org." />
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/leads" className={listLinkClass}>
            Open leads list
          </Link>
          <Link href="/customers" className={listLinkClass}>
            Open customers
          </Link>
        </div>
      </WorkspacePanel>

      <WorkspacePanel className="border-border-strong shadow-md ring-1 ring-ring/30">
        <SectionHeading
          title="Future attention feed (not wired)"
          description="Reserved for cross-domain signals after runtime execution and explicit quote-to-job handoffs exist. Not a task list, inbox, or routing surface in this build."
          actions={
            <PlaceholderButton title="No feed wiring in this build">
              Refresh feed (not wired)
            </PlaceholderButton>
          }
        />
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SignalCard
            label="Job attention (reserved)"
            value="—"
            hint="Future readiness and risk—no job store yet."
          />
          <SignalCard
            label="Timing attention (reserved)"
            value="—"
            hint="Future planning conflicts—no schedule engine yet."
          />
          <SignalCard
            label="Commercial follow-ups (reserved)"
            value="—"
            hint="Future staff reminders—separate from checkpoints."
          />
          <SignalCard
            label="Money attention (reserved)"
            value="—"
            hint="Future collection status—quote stays the terms anchor."
          />
        </div>
        <EmptyState
          icon={Activity}
          title="No attention feed yet"
          description="Intentionally empty—no fabricated queue, scores, or role filtering. This panel only reserves layout for when real signals exist."
        />
      </WorkspacePanel>

      <section>
        <SectionHeading
          title="Lenses (planning UI only)"
          description="Each lens is a reserved route with static copy—no shared query layer with Work → Jobs or Work → Schedule yet."
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
              Reserved for assigned and blocked work across quotes and jobs once a task
              model exists—not a task board or runtime graph in this build.
            </p>
            <Link href="/workstation/tasks" className={listLinkClass}>
              Open tasks lens (reserved)
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
              Reserved job-centric framing—authoritative placeholder routes stay under
              Work → Jobs.
            </p>
            <Link href="/workstation/jobs" className={listLinkClass}>
              Open jobs lens (reserved)
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
              Reserved timing-risk framing—not the planning surface at Work → Schedule.
            </p>
            <Link href="/workstation/schedule" className={listLinkClass}>
              Open schedule lens (reserved)
            </Link>
          </WorkspacePanel>
        </div>
      </section>

      <HandoffPanel
        title="Authoritative record routes"
        description="Quotes and leads sit under Sales; customer rows under Relationships; job and schedule placeholders under Work; the payments shell under Reserved. None of those routes are wired through Workstation yet—links below are normal navigation only."
      >
        <Link href="/quotes" className={handoffMutedLinkClass}>
          Quotes
        </Link>
        <Link href="/customers" className={handoffMutedLinkClass}>
          Customers
        </Link>
        <Link href="/jobs" className={handoffPrimaryLinkClass}>
          Job records (reserved)
        </Link>
        <Link href="/schedule" className={handoffMutedLinkClass}>
          Schedule (reserved)
        </Link>
        <Link href="/payments" className={handoffMutedLinkClass}>
          Payments (reserved)
        </Link>
      </HandoffPanel>
    </div>
  );
}
