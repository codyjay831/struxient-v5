import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { PlaceholderButton } from "@/components/ui/placeholder-button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { CalendarDays, ClipboardList, FileText, FolderKanban, ShieldCheck } from "lucide-react";

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
      <PageHeader
        eyebrow="Work"
        title="Job"
        description="Post-approval operational record—not the Workstation attention lens. Quote origin, activation review, and schedule live here once data exists."
        actions={
          <>
            <Link href="/jobs" className={listLinkClass}>
              ← Jobs list
            </Link>
            <Link
              href="/workstation/jobs"
              className="inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground"
            >
              Workstation jobs lens
            </Link>
          </>
        }
      />

      <WorkspacePanel padding="compact" className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          Placeholder identifier (from URL)
        </p>
        <p className="mt-1 break-all font-mono text-sm text-foreground">{jobId}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge label="Scheduled" tone="neutral" />
          <span className="text-xs text-foreground-muted">
            Illustrative status—not evaluated
          </span>
        </div>
      </WorkspacePanel>

      <div className="space-y-6">
        <WorkspacePanel>
          <SectionHeading
            title="Quote & approval origin"
            description="Which sold quote and payment plan authorized this job—immutable customer terms stay on the quote side."
          />
          <EmptyState
            icon={FileText}
            title="No linked quote"
            description="Linking to Sales records requires persistence. No sample quote id is invented."
          >
            <PlaceholderButton>Open quote (soon)</PlaceholderButton>
          </EmptyState>
        </WorkspacePanel>

        <WorkspacePanel>
          <SectionHeading
            title="Activation review"
            description="Confirm the starting job plan before crews mobilize—logic and checklists are not implemented in this shell."
          />
          <EmptyState
            icon={ShieldCheck}
            title="Activation not run"
            description="No readiness state machine, gates, or approvals execute here—layout only."
          >
            <PlaceholderButton>Start activation review</PlaceholderButton>
          </EmptyState>
        </WorkspacePanel>

        <WorkspacePanel>
          <SectionHeading
            title="Work plan"
            description="Phases, scope reminders, and crew-facing notes—progressive detail without a task engine."
          />
          <EmptyState
            icon={ClipboardList}
            title="No work plan rows"
            description="Tasks and execution tracking come later once the commercial path is settled—no mandatory execution enums in this build."
          />
        </WorkspacePanel>

        <div className="grid gap-6 lg:grid-cols-2">
          <WorkspacePanel>
            <SectionHeading
              title="Schedule & status"
              description="Dates, crew assignments, and slips sync from the schedule record surface."
            />
            <EmptyState
              icon={CalendarDays}
              title="No schedule rows"
              description="Calendar engine is out of scope—see Work → Schedule for the browse shell."
            />
          </WorkspacePanel>
          <WorkspacePanel>
            <SectionHeading
              title="Issues & change events"
              description="COs, punch items, weather holds—future operational feed."
            />
            <EmptyState
              icon={FolderKanban}
              title="No change events"
              description="Event stream is empty—no fabricated issues."
            />
          </WorkspacePanel>
        </div>
      </div>
    </div>
  );
}
