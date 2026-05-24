import assert from "node:assert/strict";
import test from "node:test";
import {
  JobIssueSeverity,
  JobIssueStatus,
  JobRecoveryFlowStatus,
  JobTaskStatus,
  TaskTemplateCategory,
} from "@prisma/client";
import {
  allRecoveryTasksDone,
  getRecoveryProgressMessage,
  shouldAutoOpenRecoveryPlanAfterIssueCreate,
  shouldShowResumeOriginalPathAction,
  shouldShowReviewRecoveryPlanAffordance,
} from "./recovery-issue-ui-flow";
import {
  materializeRecoveryFlowWithTasksInTx,
} from "./recovery-flow-materialize";

/**
 * Smoke test for Issue-to-Action Recovery button flow.
 * Covers UI state transitions (pure helpers) + server materialization boundary.
 */

test("smoke: BLOCKS_WORK issue auto-opens recovery planning", () => {
  assert.equal(
    shouldAutoOpenRecoveryPlanAfterIssueCreate(
      JobIssueSeverity.BLOCKS_WORK,
      "issue-1",
    ),
    true,
  );
});

test("smoke: DOES_NOT_BLOCK issue does not auto-open recovery planning", () => {
  assert.equal(
    shouldAutoOpenRecoveryPlanAfterIssueCreate(
      JobIssueSeverity.DOES_NOT_BLOCK,
      "issue-1",
    ),
    false,
  );
});

test("smoke: cancel/close dialog leaves Review Recovery Plan affordance visible", () => {
  const issue = {
    id: "issue-1",
    status: JobIssueStatus.OPEN,
    severity: JobIssueSeverity.BLOCKS_WORK,
    recoveryFlow: null,
  };

  assert.equal(
    shouldShowReviewRecoveryPlanAffordance({
      issue,
      showRecoveryBuilder: false,
    }),
    true,
  );
  assert.equal(
    shouldShowReviewRecoveryPlanAffordance({
      issue,
      showRecoveryBuilder: true,
    }),
    false,
  );
});

test("smoke: reopen Review Recovery Plan sets builder open for same issue", () => {
  let showRecoveryBuilder = false;
  let selectedIssueId: string | null = null;
  const issueId = "issue-1";

  showRecoveryBuilder = true;
  selectedIssueId = issueId;

  assert.equal(showRecoveryBuilder, true);
  assert.equal(selectedIssueId, issueId);

  showRecoveryBuilder = false;
  assert.equal(
    shouldShowReviewRecoveryPlanAffordance({
      issue: {
        id: issueId,
        status: JobIssueStatus.OPEN,
        severity: JobIssueSeverity.BLOCKS_WORK,
        recoveryFlow: null,
      },
      showRecoveryBuilder,
    }),
    true,
  );
});

test("smoke: completed recovery shows resume original path message and action", () => {
  const issue = {
    id: "issue-1",
    status: JobIssueStatus.OPEN,
    severity: JobIssueSeverity.BLOCKS_WORK,
    recoveryFlow: {
      status: JobRecoveryFlowStatus.COMPLETED,
      tasks: [
        { status: JobTaskStatus.DONE },
        { status: JobTaskStatus.DONE },
      ],
    },
  };

  assert.equal(shouldShowResumeOriginalPathAction(issue), true);
  assert.match(
    getRecoveryProgressMessage(issue) ?? "",
    /Recovery complete.*Resume the original path/i,
  );
});

test("smoke: activate creates one recovery flow and tasks; duplicate activate rejected", async () => {
  const flowCreates: unknown[] = [];
  const taskCreates: unknown[] = [];
  let flowIdCounter = 0;
  let taskIdCounter = 0;
  let existingFlow: { id: string; status: JobRecoveryFlowStatus } | null =
    null;

  const tx = {
    jobRecoveryFlow: {
      findUnique: async () => existingFlow,
      create: async (args: { data: Record<string, unknown> }) => {
        flowCreates.push(args);
        flowIdCounter += 1;
        const flow = {
          id: `flow-${flowIdCounter}`,
          status: args.data.status as JobRecoveryFlowStatus,
        };
        existingFlow = flow;
        return { id: flow.id };
      },
    },
    jobIssue: {
      findFirst: async () => ({
        id: "issue-1",
        status: JobIssueStatus.OPEN,
        jobTaskId: "task-source",
      }),
    },
    stage: {
      findFirst: async () => ({ id: "stage-corrections", name: "Corrections" }),
      aggregate: async () => ({ _max: { sortOrder: 0 } }),
      create: async () => {
        throw new Error("unexpected stage.create");
      },
    },
    jobStage: {
      findFirst: async () => ({ id: "job-stage-corrections" }),
      aggregate: async () => ({ _max: { sortOrder: 0 } }),
      create: async () => {
        throw new Error("unexpected jobStage.create");
      },
    },
    jobTask: {
      findFirst: async () => null,
      create: async (args: { data: Record<string, unknown> }) => {
        taskCreates.push(args);
        taskIdCounter += 1;
        return { id: `recovery-task-${taskIdCounter}` };
      },
    },
    jobActivity: {
      create: async () => {},
    },
  };

  const result = await materializeRecoveryFlowWithTasksInTx(tx as never, {
    organizationId: "org-1",
    jobIssueId: "issue-1",
    jobId: "job-1",
    issueTitle: "Panel failed",
    actorUserId: "user-1",
    tasks: [
      { title: "Fix wiring", category: TaskTemplateCategory.GENERAL },
      { title: "Re-inspect", category: TaskTemplateCategory.INSPECTION },
    ],
  });

  assert.equal(result.flowId, "flow-1");
  assert.deepEqual(result.taskIds, ["recovery-task-1", "recovery-task-2"]);
  assert.equal(flowCreates.length, 1);
  assert.equal(taskCreates.length, 2);

  const flowData = (flowCreates[0] as { data: Record<string, unknown> }).data;
  assert.equal(flowData.sourceFailedTaskId, "task-source");
  assert.equal(flowData.status, JobRecoveryFlowStatus.ACTIVE);

  await assert.rejects(
    () =>
      materializeRecoveryFlowWithTasksInTx(tx as never, {
        organizationId: "org-1",
        jobIssueId: "issue-1",
        jobId: "job-1",
        issueTitle: "Panel failed",
        actorUserId: "user-1",
        tasks: [{ title: "Duplicate", category: TaskTemplateCategory.GENERAL }],
      }),
    /already in progress/i,
  );
  assert.equal(flowCreates.length, 1);
  assert.equal(taskCreates.length, 2);
});

test("smoke: recovery-from-recovery uses recovery task as sourceFailedTaskId default", async () => {
  const flowCreates: unknown[] = [];
  const tx = {
    jobRecoveryFlow: {
      findUnique: async () => null,
      create: async (args: { data: Record<string, unknown> }) => {
        flowCreates.push(args);
        return { id: "flow-child" };
      },
    },
    jobIssue: {
      findFirst: async () => ({
        id: "issue-child",
        status: JobIssueStatus.OPEN,
        jobTaskId: "recovery-task-parent",
      }),
    },
    stage: {
      findFirst: async () => ({ id: "stage-corrections", name: "Corrections" }),
      aggregate: async () => ({ _max: { sortOrder: 0 } }),
    },
    jobStage: {
      findFirst: async () => ({ id: "job-stage-corrections" }),
      aggregate: async () => ({ _max: { sortOrder: 0 } }),
    },
    jobTask: {
      findFirst: async () => null,
      create: async () => ({ id: "recovery-task-child" }),
    },
    jobActivity: {
      create: async () => {},
    },
  };

  await materializeRecoveryFlowWithTasksInTx(tx as never, {
    organizationId: "org-1",
    jobIssueId: "issue-child",
    jobId: "job-1",
    issueTitle: "Recovery task failed",
    actorUserId: "user-1",
    tasks: [{ title: "Correct recovery work", category: TaskTemplateCategory.GENERAL }],
  });

  const flowData = (flowCreates[0] as { data: Record<string, unknown> }).data;
  assert.equal(flowData.sourceFailedTaskId, "recovery-task-parent");
});

test("smoke: in-progress recovery with all tasks done enables resume affordance", () => {
  const issue = {
    id: "issue-1",
    status: JobIssueStatus.OPEN,
    severity: JobIssueSeverity.BLOCKS_WORK,
    recoveryFlow: {
      status: JobRecoveryFlowStatus.ACTIVE,
      tasks: [{ status: JobTaskStatus.DONE }],
    },
  };

  assert.equal(allRecoveryTasksDone(issue.recoveryFlow), true);
  assert.equal(shouldShowResumeOriginalPathAction(issue), true);
});
