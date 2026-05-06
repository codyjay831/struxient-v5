import Link from "next/link";
import {
  HandoffPanel,
  handoffMutedLinkClass,
} from "@/components/ui/handoff-panel";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { PlaceholderButton } from "@/components/ui/placeholder-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { FolderKanban } from "lucide-react";

export default function JobsRecordPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[{ label: "Work" }, { label: "Jobs" }]}
      />
      <PageHeader
        eyebrow="Work"
        title="Jobs"
        description="Reserved workspace for future job records—filters, columns, and detail routes are not wired. This is the Work planning shell, not the Workstation attention strip and not automatically linked from quotes yet."
        actions={
          <>
            <PlaceholderButton title="No job store in this build">
              New job (not wired)
            </PlaceholderButton>
            <PlaceholderButton title="No import pipeline in this build">
              Import (not wired)
            </PlaceholderButton>
          </>
        }
      />

      <HandoffPanel
        title="Work connection"
        description="Jobs are expected to become execution records once persistence and explicit quote-to-job handoffs exist—not created from this placeholder. Schedule, issues, and Workstation feeds are likewise deferred. This page is only the reserved catalog shell."
      >
        <Link href="/schedule" className={handoffMutedLinkClass}>
          Go to Schedule
        </Link>
        <Link href="/workstation/jobs" className={handoffMutedLinkClass}>
          Open Workstation jobs lens
        </Link>
        <Link href="/payments" className={handoffMutedLinkClass}>
          Payments (reserved)
        </Link>
      </HandoffPanel>

      <WorkspacePanel className="mb-8" padding="compact">
        <p className="text-sm text-foreground-muted">
          <span className="font-medium text-foreground">Workstation vs this page:</span>{" "}
          Use{" "}
          <Link
            href="/workstation/jobs"
            className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
          >
            Workstation → Jobs lens
          </Link>{" "}
          for a reserved “job attention” slice (static today). Use this route when you
          want the job catalog placeholder.
        </p>
      </WorkspacePanel>

      <SectionHeading
        title="All jobs"
        description="Search, saved views, and pagination will map to org-scoped queries. Row actions will open `/jobs/{id}` for the Work record shell—not the Workstation lens."
      />

      <EmptyState
        icon={FolderKanban}
        title="No jobs to show yet"
        description="When a real job store exists, this grid will list org-scoped rows. Until then, nothing is fabricated; `/jobs/[id]` is a static shell from the URL only."
      >
        <PlaceholderButton>Open first job (not wired)</PlaceholderButton>
      </EmptyState>
    </div>
  );
}
