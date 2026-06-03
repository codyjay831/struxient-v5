import { ButtonLink } from "@/components/ui/button";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { CalendarDays, FolderKanban, Gauge } from "lucide-react";

export default function ScheduleRecordPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb items={[{ label: "Work" }, { label: "Schedule" }]} />
      <PageHeader
        title="Schedule"
        description="Plan field time, job windows, and crew capacity — all in one place when scheduling launches."
      />

      <WorkspacePanel className="border-brand/20 bg-brand-muted/30">
        <EmptyState
          icon={CalendarDays}
          title="Scheduling is on the way"
          description="You'll be able to line up jobs, customer access windows, and field capacity here. For now, track active work from Jobs or check what needs attention in Workstation."
        >
          <ButtonLink href="/jobs" variant="primary" size="sm">
            <FolderKanban className="size-3.5" />
            View jobs
          </ButtonLink>
          <ButtonLink href="/workstation/schedule" variant="muted" size="sm">
            <Gauge className="size-3.5" />
            Workstation schedule
          </ButtonLink>
        </EmptyState>
      </WorkspacePanel>
    </div>
  );
}
