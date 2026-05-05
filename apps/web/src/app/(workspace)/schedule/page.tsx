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
import { CalendarDays } from "lucide-react";

export default function ScheduleRecordPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[{ label: "Work" }, { label: "Schedule" }]}
      />
      <PageHeader
        eyebrow="Work"
        title="Schedule"
        description="Calendar and timeline for confirmed work—appointments, crew assignments, and machine-readable conflicts belong here as records mature."
        actions={
          <>
            <PlaceholderButton>New hold</PlaceholderButton>
            <PlaceholderButton>Subscribe (ICS)</PlaceholderButton>
          </>
        }
      />

      <HandoffPanel
        title="Work coordination"
        description="Schedule will align job records, customer availability, crew capacity, and what Workstation flags as at-risk or overdue—calendar behavior still waits on persisted dates."
      >
        <Link href="/jobs" className={handoffMutedLinkClass}>
          Go to Jobs
        </Link>
        <Link href="/workstation/schedule" className={handoffMutedLinkClass}>
          Open Workstation schedule lens
        </Link>
      </HandoffPanel>

      <WorkspacePanel className="mb-8" padding="compact">
        <p className="text-sm text-foreground-muted">
          <span className="font-medium text-foreground">Workstation vs this page:</span>{" "}
          <Link
            href="/workstation/schedule"
            className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
          >
            Workstation → Schedule lens
          </Link>{" "}
          stays focused on schedule risk and near-term attention. This route is
          for browsing and editing the schedule as a record surface.
        </p>
      </WorkspacePanel>

      <SectionHeading
        title="Calendar"
        description="Month / week / day layouts and drag-reschedule will ship with backed task and appointment entities—no calendar engine is wired yet."
      />

      <EmptyState
        icon={CalendarDays}
        title="No scheduled items yet"
        description="There is no local or mock calendar data. When tasks and jobs carry dates in the database, they will populate this view automatically."
      >
        <PlaceholderButton>Add appointment (soon)</PlaceholderButton>
      </EmptyState>
    </div>
  );
}
