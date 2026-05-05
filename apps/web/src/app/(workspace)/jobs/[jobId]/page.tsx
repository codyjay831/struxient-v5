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
        description="Post-approval work container—not a live task runner. Commercial truth stays on the quote; this shell only mirrors the route until persistence and activation exist."
        actions={
          <>
            <Link href="/jobs" className={listLinkClass}>
              ← Jobs list
            </Link>
            <Link href="/workstation/jobs" className={listLinkClass}>
              Workstation jobs lens
            </Link>
            <PlaceholderButton title="No job store in this build">
              Save job (soon)
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
            description="Display name, site address, crew assignment, and lifecycle state will live here. Nothing is evaluated yet—no activation, no schedule engine, no task graph."
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

        {/* Quote origin / approval */}
        <WorkspacePanel>
          <SectionHeading
            title="Quote origin & approval"
            description="Jobs are expected to come from approved or committed quotes later. Customer-facing terms and payment plan stay anchored on the quote—no silent rewrite after send or approval once that system exists."
          />
          <p className="mb-4 rounded-lg border border-border bg-foreground/[0.02] px-3 py-2 text-xs leading-relaxed text-foreground-muted">
            This shell does not fetch a quote. Line items and quote-level payment truth remain on
            Sales until linking and snapshots are built.
          </p>
          <EmptyState
            icon={FileText}
            title="No linked quote"
            description="Approved quote reference, revision, and snapshot pointers will show here—nothing is invented for this route."
          >
            <Link href="/quotes" className={listLinkClass}>
              Browse quotes
            </Link>
            <PlaceholderButton title="No quote linker in this build">
              Open linked quote (soon)
            </PlaceholderButton>
          </EmptyState>
        </WorkspacePanel>

        {/* Sold scope / execution bridge — primary */}
        <WorkspacePanel className="border-border-strong shadow-md ring-1 ring-ring/30">
          <SectionHeading
            title="Sold scope / execution bridge"
            description="The job turns approved commercial scope into something the field can execute. Line items and payment terms originate on the quote; activation review and progressive execution detail confirm how work actually starts."
            actions={
              <PlaceholderButton title="No scope viewer in this build">
                Review sold scope
              </PlaceholderButton>
            }
          />
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SignalCard
              label="Sold scope"
              value="—"
              hint="Rolls up from approved line items when linked."
            />
            <SignalCard
              label="Activation readiness"
              value="—"
              hint="Checklist and gates—not run in this shell."
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
            description="When wired, you will see how sold line items and quote-level payment terms feed the starting job plan. Tasks, dependencies, and runtime sequencing stay off this page until the execution engine ships."
          >
            <PlaceholderButton title="No activation prep in this build">
              Prepare activation review
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
            title="Activation review"
            description="A deliberate checkpoint before crews mobilize: confirm the starting plan matches what was sold, catch missing info, and align office and field. No activation logic, approvals, or auto-spawned tasks in this build."
          />
          <EmptyState
            icon={ShieldCheck}
            title="Activation not available"
            description="Readiness scoring, gates, and materialized task graphs are persistence work—this panel is copy and layout only."
          >
            <PlaceholderButton title="No activation flow in this build">
              Start activation review (soon)
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
            title="Issues & change events"
            description="Future home for interruptions, field corrections, construction issues, and change-order paths that keep sold truth honest—without replacing the approved quote snapshot except through proper CO flows."
          />
          <EmptyState
            icon={AlertTriangle}
            title="No issues or change events"
            description="No fabricated tickets—typed issues, spawned tasks, and CO diffs ship later."
          >
            <PlaceholderButton title="No issue tracker in this build">
              Log issue (soon)
            </PlaceholderButton>
          </EmptyState>
        </WorkspacePanel>

        {/* Finance / Payments */}
        <WorkspacePanel padding="compact">
          <SectionHeading
            title="Finance & Payments"
            description="Payment holds, collection status, and money-related blockers surface here later. Real-world money movement lives under Finance."
          />
          <EmptyState
            icon={CreditCard}
            title="No payment status"
            description="Job-level collection status and payment gates will show here once wired. Quote remains the source for agreed terms."
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
          description="Jobs sit after approved commercial work and before day-to-day coordination. Quotes live under Sales; the customer record lives under Relationships; Schedule and Workstation jobs under Work carry timing and attention."
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
