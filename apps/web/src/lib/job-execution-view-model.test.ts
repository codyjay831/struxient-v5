import assert from "node:assert/strict";
import test from "node:test";
import {
  JobIssueSeverity,
  JobIssueStatus,
  JobStatus,
  JobTaskStatus,
  TaskSchedulingRequirement,
} from "@prisma/client";
import {
  buildJobExecutionViewModel,
  parseJobExecutionViewMode,
  timelineBarLayout,
  type BuildJobExecutionViewModelInput,
} from "./job-execution-view-model";

function baseInput(
  overrides: Partial<BuildJobExecutionViewModelInput> = {},
): BuildJobExecutionViewModelInput {
  return {
    job: {
      id: "job-1",
      status: JobStatus.ACTIVE,
      stages: [
        {
          id: "stage-1",
          title: "Site Visit",
          sortOrder: 0,
          stageId: "org-1",
          issues: [],
          tasks: [
            {
              id: "task-site",
              title: "Conduct Site Survey",
              status: JobTaskStatus.TODO,
              completedAt: null,
              completionNote: null,
              completionRequirementsJson: {},
              dueAt: null,
              workPackageId: null,
              providesSignals: ["site_visit.complete"],
              requiresSignals: [],
              hardSignal: false,
              sortOrder: 0,
              recoveryFlowId: null,
              attachments: [],
              issues: [],
            },
          ],
        },
        {
          id: "stage-2",
          title: "Design & Permit",
          sortOrder: 1,
          stageId: "org-2",
          issues: [],
          tasks: [
            {
              id: "task-design",
              title: "Design Electrical Service Upgrade",
              status: JobTaskStatus.TODO,
              completedAt: null,
              completionNote: null,
              completionRequirementsJson: {},
              dueAt: null,
              workPackageId: null,
              providesSignals: [],
              requiresSignals: ["site_visit.complete"],
              hardSignal: false,
              sortOrder: 0,
              recoveryFlowId: null,
              attachments: [],
              issues: [],
            },
          ],
        },
      ],
      issues: [],
      paymentRequirements: [],
    },
    workPackages: [],
    scheduleEvents: [],
    liveSignals: [],
    paymentRequirements: [],
    ...overrides,
  };
}

test("parseJobExecutionViewMode defaults to work", () => {
  assert.equal(parseJobExecutionViewMode(undefined), "work");
  assert.equal(parseJobExecutionViewMode("flow"), "flow");
  assert.equal(parseJobExecutionViewMode("timeline"), "timeline");
});

test("buildJobExecutionViewModel: blocked-by-signal when upstream signal missing", () => {
  const model = buildJobExecutionViewModel(baseInput());
  const design = model.tasksById["task-design"];
  assert.equal(design?.derivedState, "BLOCKED_BY_SIGNAL");
  assert.deepEqual(design?.missingSignals, ["site_visit.complete"]);
  assert.equal(model.flow.edges.length, 1);
  assert.equal(model.flow.edges[0]?.satisfied, false);
});

test("buildJobExecutionViewModel: ready when upstream signal is live", () => {
  const model = buildJobExecutionViewModel(
    baseInput({ liveSignals: ["site_visit.complete"] }),
  );
  const design = model.tasksById["task-design"];
  assert.equal(design?.derivedState, "READY");
  assert.equal(model.flow.edges[0]?.satisfied, true);
});

test("buildJobExecutionViewModel: blocked-by-issue on task", () => {
  const model = buildJobExecutionViewModel(
    baseInput({
      job: {
        ...baseInput().job,
        stages: [
          {
            id: "stage-1",
            title: "Install",
            sortOrder: 0,
            stageId: "org-1",
            issues: [],
            tasks: [
              {
                id: "task-blocked",
                title: "Install panels",
                status: JobTaskStatus.TODO,
                completedAt: null,
                completionNote: null,
                completionRequirementsJson: {},
                dueAt: null,
                workPackageId: null,
                providesSignals: [],
                requiresSignals: [],
                hardSignal: false,
                sortOrder: 0,
                recoveryFlowId: null,
                attachments: [],
                issues: [
                  {
                    id: "issue-1",
                    status: JobIssueStatus.OPEN,
                    severity: JobIssueSeverity.BLOCKS_WORK,
                  },
                ],
              },
            ],
          },
        ],
      },
    }),
  );
  assert.equal(model.tasksById["task-blocked"]?.derivedState, "BLOCKED_BY_ISSUE");
  assert.equal(model.summary.blockedCount, 1);
});

test("buildJobExecutionViewModel: recovery task bypasses parent issue", () => {
  const model = buildJobExecutionViewModel(
    baseInput({
      job: {
        ...baseInput().job,
        stages: [
          {
            id: "stage-corrections",
            title: "Corrections",
            sortOrder: 99,
            stageId: "org-c",
            issues: [],
            tasks: [
              {
                id: "task-recovery",
                title: "Re-inspect roof access",
                status: JobTaskStatus.TODO,
                completedAt: null,
                completionNote: null,
                completionRequirementsJson: {},
                dueAt: null,
                workPackageId: null,
                providesSignals: [],
                requiresSignals: [],
                hardSignal: false,
                sortOrder: 0,
                recoveryFlowId: "flow-1",
                recoveryFlow: { jobIssueId: "issue-1" },
                attachments: [],
                issues: [],
              },
            ],
          },
        ],
        issues: [
          {
            id: "issue-1",
            title: "Weather delay",
            status: JobIssueStatus.OPEN,
            severity: JobIssueSeverity.BLOCKS_WORK,
            recoveryFlow: { id: "flow-1", status: "ACTIVE", tasks: [] },
          },
        ],
      },
    }),
  );
  assert.equal(model.tasksById["task-recovery"]?.derivedState, "READY");
  assert.equal(model.flow.nodes[0]?.isRecovery, true);
});

test("buildJobExecutionViewModel: completed task", () => {
  const model = buildJobExecutionViewModel(
    baseInput({
      job: {
        ...baseInput().job,
        stages: [
          {
            id: "stage-1",
            title: "Closeout",
            sortOrder: 0,
            stageId: "org-1",
            issues: [],
            tasks: [
              {
                id: "task-done",
                title: "Final walkthrough",
                status: JobTaskStatus.DONE,
                completedAt: new Date("2026-06-01T12:00:00Z"),
                completionNote: "Done",
                completionRequirementsJson: {},
                dueAt: null,
                workPackageId: null,
                providesSignals: [],
                requiresSignals: [],
                hardSignal: false,
                sortOrder: 0,
                recoveryFlowId: null,
                attachments: [],
                issues: [],
              },
            ],
          },
        ],
      },
    }),
  );
  assert.equal(model.tasksById["task-done"]?.derivedState, "COMPLETED");
  assert.equal(model.summary.completedCount, 1);
});

test("buildJobExecutionViewModel: timeline includes work package band and schedule event", () => {
  const model = buildJobExecutionViewModel(
    baseInput({
      workPackages: [
        {
          id: "wp-1",
          title: "Roof crew mobilization",
          workType: "INSTALL",
          plannedStartDate: new Date("2026-06-10T00:00:00Z"),
          plannedEndDate: new Date("2026-06-14T00:00:00Z"),
          tasks: [{ id: "task-site", status: JobTaskStatus.TODO }],
        },
      ],
      scheduleEvents: [
        {
          id: "evt-1",
          title: "Crew on site",
          kind: "CREW_WORK",
          status: "CONFIRMED",
          startAt: new Date("2026-06-12T08:00:00Z"),
          endAt: new Date("2026-06-12T17:00:00Z"),
          taskLinks: [{ jobTask: { id: "task-site", title: "Conduct Site Survey", status: JobTaskStatus.TODO } }],
        },
      ],
      job: {
        ...baseInput().job,
        stages: baseInput().job.stages.map((stage) => ({
          ...stage,
          tasks: stage.tasks.map((task) =>
            task.id === "task-site"
              ? {
                  ...task,
                  workPackageId: "wp-1",
                  dueAt: new Date("2026-06-15T00:00:00Z"),
                  schedulingRequirement: TaskSchedulingRequirement.REQUIRED,
                  scheduleEventLinks: [
                    {
                      jobScheduleEvent: {
                        id: "evt-1",
                        title: "Crew on site",
                        status: "CONFIRMED",
                        startAt: new Date("2026-06-12T08:00:00Z"),
                        endAt: new Date("2026-06-12T17:00:00Z"),
                      },
                    },
                  ],
                }
              : task,
          ),
        })),
      },
    }),
    new Date("2026-06-01T12:00:00Z"),
  );

  assert.equal(model.timeline.bars.length, 2);
  assert.equal(model.timeline.milestones.length, 1);
  assert.equal(model.timeline.milestones[0]?.taskId, "task-site");

  const siteRow = model.timeline.rows.find(
    (row) => row.type === "task" && row.taskId === "task-site",
  );
  assert.equal(siteRow?.type, "task");
  if (siteRow?.type === "task") {
    assert.ok(siteRow.segments.some((segment) => segment.kind === "schedule_event"));
    assert.ok(siteRow.segments.some((segment) => segment.kind === "work_package"));
    assert.equal(siteRow.dueAt, new Date("2026-06-15T00:00:00Z").toISOString());
  }

  const stageHeaders = model.timeline.rows.filter((row) => row.type === "stage");
  assert.equal(stageHeaders.length, 2);
});

test("buildJobExecutionViewModel: timeline rows include all tasks even when unscheduled", () => {
  const model = buildJobExecutionViewModel(baseInput());
  const taskRows = model.timeline.rows.filter((row) => row.type === "task");
  assert.equal(taskRows.length, 2);
  assert.equal(model.timeline.unscheduledTaskCount, 2);
  const designRow = taskRows.find((row) => row.type === "task" && row.taskId === "task-design");
  assert.equal(designRow?.type, "task");
  if (designRow?.type === "task") {
    assert.equal(designRow.segments.length, 0);
    assert.equal(designRow.derivedState, "BLOCKED_BY_SIGNAL");
  }
});

test("timelineBarLayout returns visible width for same-day events", () => {
  const layout = timelineBarLayout(
    "2026-06-12T08:00:00.000Z",
    "2026-06-12T17:00:00.000Z",
    "2026-06-01T00:00:00.000Z",
    "2026-06-30T23:59:59.999Z",
  );
  assert.ok(layout.width >= 1.5);
  assert.ok(layout.left >= 0);
});

test("buildJobExecutionViewModel: permit chain scenario with payment-ready downstream", () => {
  const model = buildJobExecutionViewModel(
    baseInput({
      liveSignals: ["site_visit.complete", "permit.submitted"],
      job: {
        ...baseInput().job,
        stages: [
          {
            id: "stage-1",
            title: "Site Visit",
            sortOrder: 0,
            stageId: "org-1",
            issues: [],
            tasks: [
              {
                id: "task-survey",
                title: "Site survey",
                status: JobTaskStatus.DONE,
                completedAt: new Date("2026-06-01T00:00:00Z"),
                completionNote: null,
                completionRequirementsJson: {},
                dueAt: null,
                workPackageId: null,
                providesSignals: ["site_visit.complete"],
                requiresSignals: [],
                hardSignal: false,
                sortOrder: 0,
                recoveryFlowId: null,
                attachments: [],
                issues: [],
              },
            ],
          },
          {
            id: "stage-2",
            title: "Permitting",
            sortOrder: 1,
            stageId: "org-2",
            issues: [],
            tasks: [
              {
                id: "task-permit",
                title: "Obtain electrical permit",
                status: JobTaskStatus.TODO,
                completedAt: null,
                completionNote: null,
                completionRequirementsJson: {},
                dueAt: new Date("2026-06-20T00:00:00Z"),
                workPackageId: null,
                providesSignals: ["permit.approved"],
                requiresSignals: ["site_visit.complete"],
                hardSignal: true,
                sortOrder: 0,
                recoveryFlowId: null,
                attachments: [],
                issues: [],
              },
              {
                id: "task-install",
                title: "Install service upgrade",
                status: JobTaskStatus.TODO,
                completedAt: null,
                completionNote: null,
                completionRequirementsJson: {},
                dueAt: null,
                workPackageId: null,
                providesSignals: [],
                requiresSignals: ["permit.approved"],
                hardSignal: false,
                sortOrder: 1,
                recoveryFlowId: null,
                attachments: [],
                issues: [],
              },
            ],
          },
        ],
      },
    }),
  );

  assert.equal(model.tasksById["task-permit"]?.derivedState, "READY");
  assert.equal(model.tasksById["task-install"]?.derivedState, "BLOCKED_BY_SIGNAL");
  assert.equal(model.flow.edges.length, 2);
  assert.equal(model.summary.handshakeCount, 2);
});
