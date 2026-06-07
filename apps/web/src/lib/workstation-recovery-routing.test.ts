import assert from "node:assert/strict";
import test from "node:test";
import {
  JobIssueSeverity,
  JobIssueStatus,
  JobRecoveryFlowStatus,
  JobTaskStatus,
} from "@prisma/client";
import {
  deriveBlockedTaskRecoveryRoute,
  deriveIssueRecoveryRoute,
  deriveStuckJobWorkstationRoute,
  mapHealthActionToWorkstationRoute,
  pickBlockingIssueForTask,
  type BlockingIssueCandidate,
  type IssueRecoveryRouteInput,
} from "./workstation-recovery-routing";

const baseIssue = (
  overrides: Partial<IssueRecoveryRouteInput> = {},
): IssueRecoveryRouteInput => ({
  id: "issue-1",
  status: JobIssueStatus.OPEN,
  severity: JobIssueSeverity.BLOCKS_WORK,
  recoveryFlow: null,
  ...overrides,
});

test("mapHealthActionToWorkstationRoute: complete_task → do-recovery-task", () => {
  const route = mapHealthActionToWorkstationRoute(
    { type: "complete_task", label: "Complete recovery step", targetId: "task-r1" },
    "issue-1",
  );
  assert.equal(route?.actionKind, "do-recovery-task");
  assert.equal(route?.actionTaskId, "task-r1");
  assert.equal(route?.actionIssueId, "issue-1");
});

test("mapHealthActionToWorkstationRoute: resume_path → resume-original-path", () => {
  const route = mapHealthActionToWorkstationRoute(
    { type: "resume_path", label: "Resume original path", targetId: "issue-2" },
  );
  assert.equal(route?.actionKind, "resume-original-path");
  assert.equal(route?.actionIssueId, "issue-2");
});

test("mapHealthActionToWorkstationRoute: activate_recovery → plan-recovery", () => {
  const route = mapHealthActionToWorkstationRoute(
    { type: "activate_recovery", label: "Activate recovery plan", targetId: "issue-3" },
  );
  assert.equal(route?.actionKind, "plan-recovery");
  assert.equal(route?.actionIssueId, "issue-3");
});

test("mapHealthActionToWorkstationRoute: resolve_issue → plan-recovery", () => {
  const route = mapHealthActionToWorkstationRoute(
    { type: "resolve_issue", label: "Unblock recovery work", targetId: "issue-4" },
  );
  assert.equal(route?.actionKind, "plan-recovery");
});

test("mapHealthActionToWorkstationRoute: record_payment → null", () => {
  const route = mapHealthActionToWorkstationRoute(
    { type: "record_payment", label: "Record payment" },
  );
  assert.equal(route, null);
});

test("mapHealthActionToWorkstationRoute: review_health with target → do-recovery-task", () => {
  const route = mapHealthActionToWorkstationRoute(
    { type: "review_health", label: "Open next task", targetId: "task-stuck" },
  );
  assert.equal(route?.actionKind, "do-recovery-task");
  assert.equal(route?.actionTaskId, "task-stuck");
});

test("deriveStuckJobWorkstationRoute: opens first actionable task", () => {
  const route = deriveStuckJobWorkstationRoute(
    [
      {
        id: "task-1",
        title: "Site prep",
        jobStageId: "stage-1",
        completedAt: null,
        derivedState: "BLOCKED_BY_SIGNAL",
      },
      {
        id: "task-2",
        title: "Install",
        jobStageId: "stage-1",
        completedAt: null,
        derivedState: "NEEDS_PROOF",
      },
    ],
    [],
  );
  assert.equal(route?.actionKind, "do-recovery-task");
  assert.equal(route?.actionTaskId, "task-2");
  assert.match(route?.nextStep ?? "", /Install/);
});

test("deriveIssueRecoveryRoute: no flow → plan-recovery", () => {
  const route = deriveIssueRecoveryRoute(baseIssue());
  assert.equal(route.actionKind, "plan-recovery");
  assert.equal(route.actionIssueId, "issue-1");
  assert.match(route.nextStep, /plan recovery/i);
});

test("deriveIssueRecoveryRoute: DRAFT flow → plan-recovery", () => {
  const route = deriveIssueRecoveryRoute(
    baseIssue({
      recoveryFlow: {
        status: JobRecoveryFlowStatus.DRAFT,
        tasks: [],
      },
    }),
  );
  assert.equal(route.actionKind, "plan-recovery");
  assert.match(route.nextStep, /draft recovery plan/i);
});

test("deriveIssueRecoveryRoute: CANCELLED flow → plan-recovery", () => {
  const route = deriveIssueRecoveryRoute(
    baseIssue({
      recoveryFlow: {
        status: JobRecoveryFlowStatus.CANCELLED,
        tasks: [{ id: "t1", title: "Old step", status: JobTaskStatus.DONE, recoveryFlowOrder: 0 }],
      },
    }),
  );
  assert.equal(route.actionKind, "plan-recovery");
});

test("deriveIssueRecoveryRoute: ACTIVE flow, 1 of 3 done → do-recovery-task", () => {
  const route = deriveIssueRecoveryRoute(
    baseIssue({
      recoveryFlow: {
        status: JobRecoveryFlowStatus.ACTIVE,
        tasks: [
          { id: "t1", title: "Step 1", status: JobTaskStatus.DONE, recoveryFlowOrder: 0 },
          { id: "t2", title: "Step 2", status: JobTaskStatus.TODO, recoveryFlowOrder: 1 },
          { id: "t3", title: "Step 3", status: JobTaskStatus.TODO, recoveryFlowOrder: 2 },
        ],
      },
    }),
  );
  assert.equal(route.actionKind, "do-recovery-task");
  assert.equal(route.actionTaskId, "t2");
  assert.equal(route.actionIssueId, "issue-1");
  assert.match(route.nextStep, /Recovery Step 2\/3: Step 2/);
});

test("deriveIssueRecoveryRoute: all recovery done, issue open → resume-original-path", () => {
  const route = deriveIssueRecoveryRoute(
    baseIssue({
      recoveryFlow: {
        status: JobRecoveryFlowStatus.ACTIVE,
        tasks: [
          { id: "t1", title: "Step 1", status: JobTaskStatus.DONE, recoveryFlowOrder: 0 },
          { id: "t2", title: "Step 2", status: JobTaskStatus.DONE, recoveryFlowOrder: 1 },
        ],
      },
    }),
  );
  assert.equal(route.actionKind, "resume-original-path");
  assert.match(route.nextStep, /Resume the original path/i);
});

test("deriveIssueRecoveryRoute: COMPLETED flow → resume-original-path", () => {
  const route = deriveIssueRecoveryRoute(
    baseIssue({
      recoveryFlow: {
        status: JobRecoveryFlowStatus.COMPLETED,
        tasks: [
          { id: "t1", title: "Step 1", status: JobTaskStatus.DONE, recoveryFlowOrder: 0 },
        ],
      },
    }),
  );
  assert.equal(route.actionKind, "resume-original-path");
});

test("pickBlockingIssueForTask: prefers task-scoped issue", () => {
  const candidates: BlockingIssueCandidate[] = [
    {
      id: "job-issue",
      jobTaskId: null,
      jobStageId: null,
      createdAt: new Date("2026-01-01"),
      status: JobIssueStatus.OPEN,
      severity: JobIssueSeverity.BLOCKS_WORK,
    },
    {
      id: "task-issue",
      jobTaskId: "task-a",
      jobStageId: "stage-1",
      createdAt: new Date("2026-01-02"),
      status: JobIssueStatus.OPEN,
      severity: JobIssueSeverity.BLOCKS_WORK,
    },
  ];
  const picked = pickBlockingIssueForTask("task-a", "stage-1", candidates);
  assert.equal(picked?.id, "task-issue");
});

test("pickBlockingIssueForTask: falls back to stage-scoped then oldest", () => {
  const candidates: BlockingIssueCandidate[] = [
    {
      id: "older-job",
      jobTaskId: null,
      jobStageId: null,
      createdAt: new Date("2026-01-01"),
      status: JobIssueStatus.OPEN,
      severity: JobIssueSeverity.BLOCKS_WORK,
    },
    {
      id: "stage-issue",
      jobTaskId: null,
      jobStageId: "stage-1",
      createdAt: new Date("2026-01-03"),
      status: JobIssueStatus.OPEN,
      severity: JobIssueSeverity.BLOCKS_WORK,
    },
  ];
  const picked = pickBlockingIssueForTask("task-x", "stage-1", candidates);
  assert.equal(picked?.id, "stage-issue");
});

test("deriveBlockedTaskRecoveryRoute: blocked task routes to active recovery step", () => {
  const candidates: BlockingIssueCandidate[] = [
    {
      id: "issue-1",
      jobTaskId: "task-main",
      jobStageId: "stage-1",
      createdAt: new Date("2026-01-01"),
      status: JobIssueStatus.OPEN,
      severity: JobIssueSeverity.BLOCKS_WORK,
      recoveryFlow: {
        status: JobRecoveryFlowStatus.ACTIVE,
        tasks: [
          { id: "rt1", title: "Fix", status: JobTaskStatus.DONE, recoveryFlowOrder: 0 },
          { id: "rt2", title: "Verify", status: JobTaskStatus.TODO, recoveryFlowOrder: 1 },
        ],
      },
    },
  ];
  const route = deriveBlockedTaskRecoveryRoute("task-main", "stage-1", candidates);
  assert.equal(route?.actionKind, "do-recovery-task");
  assert.equal(route?.actionTaskId, "rt2");
});

test("workstation query emission contract: ACTIVE flow issue item fields", () => {
  const issue = baseIssue({
    id: "issue-ws",
    recoveryFlow: {
      status: JobRecoveryFlowStatus.ACTIVE,
      tasks: [
        { id: "rt-next", title: "Inspect damage", status: JobTaskStatus.TODO, recoveryFlowOrder: 0 },
      ],
    },
  });
  const route = deriveIssueRecoveryRoute(issue);
  const emitted = {
    id: `issue-${issue.id}`,
    filterCategory: "issues" as const,
    nextStep: route.nextStep,
    actionKind: route.actionKind,
    actionLabel: route.actionLabel,
    actionIssueId: route.actionIssueId,
    actionTaskId: route.actionTaskId,
  };
  assert.equal(emitted.actionKind, "do-recovery-task");
  assert.equal(emitted.actionTaskId, "rt-next");
  assert.equal(emitted.actionIssueId, "issue-ws");
});
