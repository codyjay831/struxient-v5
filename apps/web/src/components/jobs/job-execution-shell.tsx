"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SectionHeading } from "@/components/ui/section-heading";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { JobExecutionViewTabs } from "@/components/jobs/job-execution-view-tabs";
import { JobExecutionWorkPlanView } from "@/components/jobs/job-execution-work-plan-view";
import { JobExecutionFlowView } from "@/components/jobs/job-execution-flow-view";
import { JobExecutionTimelineView } from "@/components/jobs/job-execution-timeline-view";
import type { JobExecutionViewMode, JobExecutionViewModel } from "@/lib/job-execution-view-model";
import type { JobTaskExecutionTask } from "@/components/jobs/job-task-execution-types";
import type { TaskIssueRef } from "@/lib/task-readiness";
import type { TaskPaymentHold } from "@/lib/job-payment-readiness";

type StageRow = {
  id: string;
  title: string;
  issues: TaskIssueRef[];
  tasks: JobTaskExecutionTask[];
};

type JobIssueRow = {
  id: string;
  title: string;
  jobTask?: { title: string } | null;
  jobStage?: { title: string } | null;
  recoveryFlow?: {
    tasks: Array<{ id: string }>;
  } | null;
};

export function JobExecutionShell({
  initialView,
  viewModel,
  stages,
  jobIssues,
  liveSignals,
  totalTasks,
  firstAddableStageId,
  jobContextLabel,
  jobsiteAddressLine,
  customerId,
  leadEditHref,
  getPaymentHoldByStageId,
}: {
  initialView: JobExecutionViewMode;
  viewModel: JobExecutionViewModel;
  stages: StageRow[];
  jobIssues: JobIssueRow[];
  liveSignals: string[];
  totalTasks: number;
  firstAddableStageId: string | null;
  jobContextLabel: string;
  jobsiteAddressLine: string | null;
  customerId: string | null;
  leadEditHref: string | null;
  getPaymentHoldByStageId: Record<string, TaskPaymentHold>;
}) {
  const router = useRouter();
  const [activeView, setActiveView] = useState<JobExecutionViewMode>(initialView);

  const handleViewChange = useCallback(
    (view: JobExecutionViewMode) => {
      setActiveView(view);
      const url = new URL(window.location.href);
      if (view === "work") {
        url.searchParams.delete("executionView");
      } else {
        url.searchParams.set("executionView", view);
      }
      router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
    },
    [router],
  );

  const scrollToTask = useCallback((taskId: string) => {
    setActiveView("work");
    requestAnimationFrame(() => {
      document.getElementById(`task-${taskId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  const getPaymentHold = useMemo(
    () => (stageId: string) => getPaymentHoldByStageId[stageId] ?? null,
    [getPaymentHoldByStageId],
  );

  return (
    <WorkspacePanel className="mb-6">
      <SectionHeading
        title="Execution"
        description="Work plan, dependency flow, and timeline for this job. Add tasks and complete work from Work plan; use Flow and Timeline to understand blockers and schedule."
      />
      <JobExecutionViewTabs
        activeView={activeView}
        onViewChange={handleViewChange}
        summary={viewModel.summary}
      />

      {activeView === "work" ? (
        <JobExecutionWorkPlanView
          jobId={viewModel.jobId}
          stages={stages}
          jobIssues={jobIssues}
          liveSignals={liveSignals}
          totalTasks={totalTasks}
          firstAddableStageId={firstAddableStageId}
          jobContextLabel={jobContextLabel}
          jobsiteAddressLine={jobsiteAddressLine}
          customerId={customerId}
          leadEditHref={leadEditHref}
          getPaymentHold={getPaymentHold}
        />
      ) : null}

      {activeView === "flow" ? (
        <JobExecutionFlowView viewModel={viewModel} onSelectTask={scrollToTask} />
      ) : null}

      {activeView === "timeline" ? (
        <JobExecutionTimelineView viewModel={viewModel} onSelectTask={scrollToTask} />
      ) : null}
    </WorkspacePanel>
  );
}
