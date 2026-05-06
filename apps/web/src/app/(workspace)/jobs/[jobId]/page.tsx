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
import { PlaceholderButton } from "@/components/ui/placeholder-button";
import { EmptyState } from "@/components/ui/empty-state";
import { SignalCard } from "@/components/ui/signal-card";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  AlertTriangle,
  Briefcase,
  CalendarDays,
  CreditCard,
  FileText,
  ListOrdered,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Work" },
          { label: "Jobs", href: "/jobs" },
          { label: `Job ${jobId}` },
        ]}
      />
      <PageHeader
        eyebrow="Work"
        title="Job"
        description="Reserved execution-record shell from the URL only—not a live task runner. The working quote remains the commercial record; this page is not wired to checkpoints or quote-to-job handoffs."
        actions={
          <>
            <Link href="/jobs" className={listLinkClass}>
              ← Jobs list
            </Link>
            <Link href="/workstation/jobs" className={listLinkClass}>
              Workstation jobs lens
            </Link>
            <PlaceholderButton title="No job store in this build">
              Save job (not wired)
            </PlaceholderButton>
          </>
        }
      />

      <WorkspacePanel padding="compact" className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          Placeholder identifier (from URL)
        </p>
        <p className="mt-1 break-all font-mono text-sm text-foreground">{jobId}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge label="Work record shell" tone="neutral" />
          <span className="text-xs text-foreground-muted">
            Visual only—not loaded from a database
          </span>
        </div>
      </WorkspacePanel>

      <div className="space-y-6">
        {/* Job identity */}
        <WorkspacePanel>
          <SectionHeading
            title="Job identity & work status"
            description="Display name, site address, field assignment, and lifecycle state could live here later. Nothing is evaluated yet—no schedule engine, no task graph, no runtime execution."
          />
          <div className="rounded-lg border border-dashed border-border bg-foreground/[0.02] px-4 py-10 text-center">
            <Briefcase
              className="mx-auto mb-3 size-10 text-foreground-subtle opacity-70"
              strokeWidth={1.25}
              aria-hidden
            />
            <p className="text-sm font-medium text-foreground">Future job profile</p>
            <p className="mt-2 text-xs text-foreground-muted">
              Internal work record for a future real job. The URL id is the only input this page
              receives.
            </p>
          </div>
        </WorkspacePanel>

        {/* Quote origin (future link) */}
        <WorkspacePanel>
          <SectionHeading
            title="Commercial anchor on the quote"
            description="Future jobs should reference the working quote and recorded send checkpoints—not this placeholder. Agreed scope and money language stay on Sales until an explicit execution link exists."
          />
          <p className="mb-4 rounded-lg border border-border bg-foreground/[0.02] px-3 py-2 text-xs leading-relaxed text-foreground-muted">
            This shell does not fetch a quote. Line items and totals remain on the quote
            workspace; nothing here duplicates or replaces that record.
          </p>
          <EmptyState
            icon={FileText}
            title="No linked quote"
            description="Future linking would show the quote id here—nothing is invented for this route."
          >
            <Link href="/quotes" className={listLinkClass}>
              Browse quotes
            </Link>
            <PlaceholderButton title="No quote linker in this build">
              Open linked quote (not wired)
            </PlaceholderButton>
          </EmptyState>
        </WorkspacePanel>

        {/* Sold scope / execution bridge — primary */}
        <WorkspacePanel className="border-border-strong shadow-md ring-1 ring-ring/30">
          <SectionHeading
            title="Sold scope / execution bridge (reserved)"
            description="Reserved for how agreed scope on the quote could map to field execution later. Line items and totals stay on the quote today; nothing here starts work or mutates records."
            actions={
              <PlaceholderButton title="No scope viewer in this build">
                Review sold scope (not wired)
              </PlaceholderButton>
            }
          />
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SignalCard
              label="Sold scope"
              value="—"
              hint="Would roll up from linked quote lines later."
            />
            <SignalCard
              label="Execution readiness (reserved)"
              value="—"
              hint="Future checklist surface—nothing evaluated here."
            />
            <SignalCard
              label="Schedule context"
              value="—"
              hint="Holds, visits, and slips attach later."
            />
            <SignalCard
              label="Workstation attention"
              value="—"
              hint="Next actions surface in Workstation, not here."
            />
          </div>
          <EmptyState
            icon={ListOrdered}
            title="No execution bridge yet"
            description="When wired, this area would summarize how quote scope could feed a job plan. Runtime tasks, dependencies, and sequencing are out of scope for this shell."
          >
            <PlaceholderButton title="No execution prep in this build">
              Prepare execution handoff (not wired)
            </PlaceholderButton>
            <Link href="/quotes" className={listLinkClass}>
              Quotes
            </Link>
            <Link href="/schedule" className={listLinkClass}>
              Schedule
            </Link>
            <Link href="/workstation/jobs" className={listLinkClass}>
              Workstation jobs
            </Link>
          </EmptyState>
        </WorkspacePanel>

        {/* Activation review */}
        <WorkspacePanel>
          <SectionHeading
            title="Execution handoff (reserved)"
            description="Reserved for a future deliberate handoff before field work—office/field alignment, not wired here. No readiness scoring, gates, or spawned tasks in this build."
          />
          <EmptyState
            icon={ShieldCheck}
            title="Handoff not available"
            description="No scoring, gates, or task graphs—layout only until execution persistence exists."
          >
            <PlaceholderButton title="No handoff flow in this build">
              Start handoff review (not wired)
            </PlaceholderButton>
          </EmptyState>
        </WorkspacePanel>

        {/* Schedule context */}
        <WorkspacePanel>
          <SectionHeading
            title="Schedule context"
            description="Coordinates job timing with customer availability, crew capacity, and what Workstation is asking people to do next. No date picking, assignments, or calendar sync here."
          />
          <EmptyState
            icon={CalendarDays}
            title="No schedule data"
            description="Calendar and routing live under Work → Schedule; this job will subscribe to holds and visits when the engine exists."
          >
            <Link href="/schedule" className={listLinkClass}>
              Open Schedule
            </Link>
          </EmptyState>
        </WorkspacePanel>

        {/* Issues / change events */}
        <WorkspacePanel>
          <SectionHeading
            title="Issues & corrections (reserved)"
            description="Future home for interruptions and field corrections logged against the job—always anchored back to the quote record, not silent rewrites of commercial truth."
          />
          <EmptyState
            icon={AlertTriangle}
            title="No issues or corrections"
            description="No fabricated tickets—typed issues and follow-on activity ship with future persistence."
          >
            <PlaceholderButton title="No issue tracker in this build">
              Log issue (not wired)
            </PlaceholderButton>
          </EmptyState>
        </WorkspacePanel>

        {/* Money on job (reserved) */}
        <WorkspacePanel padding="compact">
          <SectionHeading
            title="Money on the job (reserved)"
            description="Reserved for collection status and money-related blockers tied to work—no ledger or processor here. Quote remains the anchor for agreed terms."
          />
          <EmptyState
            icon={CreditCard}
            title="No payment status"
            description="Job-level money views are not wired. The quote record holds commercial totals and wording today."
          >
            <Link href="/payments" className={listLinkClass}>
              Open Payments
            </Link>
          </EmptyState>
        </WorkspacePanel>

        {/* Notes & activity */}
        <WorkspacePanel padding="compact">
          <SectionHeading
            title="Notes & activity"
            description="Job chatter, photos, and audit trail attach here when logging exists—internal record, not the Workstation inbox."
          />
          <EmptyState
            icon={MessageSquare}
            title="No activity yet"
            description="No fabricated events or timeline rows."
          />
        </WorkspacePanel>

        <HandoffPanel
          title="Between quote and field"
          description="This route is a reserved execution shell—not live coordination. Quotes live under Sales; customers under Relationships; schedule and job placeholders under Work; Workstation is a separate reserved attention surface."
        >
          <Link href="/jobs" className={handoffMutedLinkClass}>
            Jobs list
          </Link>
          <Link href="/quotes" className={handoffMutedLinkClass}>
            Quotes
          </Link>
          <Link href="/customers" className={handoffMutedLinkClass}>
            Customers
          </Link>
          <Link href="/schedule" className={handoffMutedLinkClass}>
            Schedule
          </Link>
          <Link href="/payments" className={handoffMutedLinkClass}>
            Payments
          </Link>
          <Link href="/workstation/jobs" className={handoffPrimaryLinkClass}>
            Workstation jobs
          </Link>
        </HandoffPanel>
      </div>
    </div>
  );
}
