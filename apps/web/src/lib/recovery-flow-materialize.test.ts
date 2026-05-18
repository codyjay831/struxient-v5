import assert from "node:assert/strict";
import test from "node:test";
import {
  JobActivityType,
  JobIssueStatus,
  JobRecoveryFlowStatus,
  JobTaskStatus,
  LineItemTemplateTaskSource,
  TaskTemplateCategory,
} from "@prisma/client";
import {
  materializeRecoveryFlowWithTasksInTx,
  validateRecoveryFlowTasksInput,
} from "./recovery-flow-materialize";

test("validateRecoveryFlowTasksInput: rejects empty list", () => {
  assert.throws(
    () => validateRecoveryFlowTasksInput([]),
    /at least one recovery step/i,
  );
});

test("validateRecoveryFlowTasksInput: rejects blank titles", () => {
  assert.throws(
    () =>
      validateRecoveryFlowTasksInput([
        { title: "  ", category: TaskTemplateCategory.GENERAL },
      ]),
    /must have a title/i,
  );
});

test("validateRecoveryFlowTasksInput: assigns default sortOrder", () => {
  const normalized = validateRecoveryFlowTasksInput([
    { title: "Step A", category: TaskTemplateCategory.GENERAL },
    { title: "Step B", category: TaskTemplateCategory.GENERAL },
  ]);
  assert.equal(normalized[0].sortOrder, 0);
  assert.equal(normalized[1].sortOrder, 10);
});

function createMaterializeMockTx(options?: {
  existingFlow?: boolean;
  issueStatus?: JobIssueStatus;
}) {
  const issueStatus = options?.issueStatus ?? JobIssueStatus.OPEN;
  const flowCreates: unknown[] = [];
  const taskCreates: unknown[] = [];
  const activityCreates: unknown[] = [];
  let flowIdCounter = 0;
  let taskIdCounter = 0;

  const tx = {
    jobRecoveryFlow: {
      findUnique: async () => (options?.existingFlow ? { id: "flow-existing" } : null),
      create: async (args: { data: Record<string, unknown> }) => {
        flowCreates.push(args);
        flowIdCounter += 1;
        return { id: `flow-${flowIdCounter}` };
      },
    },
    jobIssue: {
      findFirst: async () =>
        issueStatus === JobIssueStatus.OPEN
          ? { id: "issue-1", status: JobIssueStatus.OPEN }
          : issueStatus === JobIssueStatus.RESOLVED
            ? { id: "issue-1", status: JobIssueStatus.RESOLVED }
            : null,
    },
    stage: {
      findFirst: async () => ({ id: "stage-corrections", name: "Corrections" }),
      aggregate: async () => ({ _max: { sortOrder: 0 } }),
      create: async () => {
        throw new Error("stage.create should not run when stage exists");
      },
    },
    jobStage: {
      findFirst: async () => ({ id: "job-stage-corrections" }),
      aggregate: async () => ({ _max: { sortOrder: 0 } }),
      create: async () => {
        throw new Error("jobStage.create should not run when job stage exists");
      },
    },
    jobTask: {
      create: async (args: { data: Record<string, unknown> }) => {
        taskCreates.push(args);
        taskIdCounter += 1;
        return { id: `task-${taskIdCounter}` };
      },
    },
    jobActivity: {
      create: async (args: unknown) => {
        activityCreates.push(args);
      },
    },
    flowCreates,
    taskCreates,
    activityCreates,
  };

  return tx;
}

test("materializeRecoveryFlowWithTasksInTx: creates ACTIVE flow and tasks", async () => {
  const tx = createMaterializeMockTx();
  const result = await materializeRecoveryFlowWithTasksInTx(tx as never, {
    organizationId: "org-1",
    jobIssueId: "issue-1",
    jobId: "job-1",
    issueTitle: "Panel failed inspection",
    actorUserId: "user-1",
    tasks: [
      { title: "Revise plans", category: TaskTemplateCategory.GENERAL },
      { title: "Re-inspect", category: TaskTemplateCategory.INSPECTION },
    ],
  });

  assert.equal(result.flowId, "flow-1");
  assert.deepEqual(result.taskIds, ["task-1", "task-2"]);
  assert.equal(tx.flowCreates.length, 1);
  const flowData = (tx.flowCreates[0] as { data: Record<string, unknown> }).data;
  assert.equal(flowData.status, JobRecoveryFlowStatus.ACTIVE);
  assert.equal(flowData.jobIssueId, "issue-1");

  assert.equal(tx.taskCreates.length, 2);
  const firstTask = (tx.taskCreates[0] as { data: Record<string, unknown> }).data;
  assert.equal(firstTask.recoveryFlowId, "flow-1");
  assert.equal(firstTask.recoveryFlowOrder, 0);
  assert.equal(firstTask.sortOrder, 0);
  assert.equal(firstTask.sourceType, LineItemTemplateTaskSource.CUSTOM);
  assert.equal(firstTask.status, JobTaskStatus.TODO);

  const secondTask = (tx.taskCreates[1] as { data: Record<string, unknown> }).data;
  assert.equal(secondTask.recoveryFlowOrder, 10);

  assert.equal(tx.activityCreates.length, 2);
  const createdActivity = (tx.activityCreates[0] as { data: { type: JobActivityType } })
    .data;
  assert.equal(createdActivity.type, JobActivityType.RECOVERY_FLOW_CREATED);
  const activatedActivity = (tx.activityCreates[1] as { data: { type: JobActivityType } })
    .data;
  assert.equal(activatedActivity.type, JobActivityType.RECOVERY_FLOW_ACTIVATED);
});

test("materializeRecoveryFlowWithTasksInTx: rejects existing flow", async () => {
  const tx = createMaterializeMockTx({ existingFlow: true });
  await assert.rejects(
    () =>
      materializeRecoveryFlowWithTasksInTx(tx as never, {
        organizationId: "org-1",
        jobIssueId: "issue-1",
        jobId: "job-1",
        issueTitle: "Issue",
        actorUserId: "user-1",
        tasks: [{ title: "Step", category: TaskTemplateCategory.GENERAL }],
      }),
    /recovery path already exists/i,
  );
  assert.equal(tx.flowCreates.length, 0);
  assert.equal(tx.taskCreates.length, 0);
});

test("materializeRecoveryFlowWithTasksInTx: rejects non-open issue", async () => {
  const tx = createMaterializeMockTx({ issueStatus: JobIssueStatus.RESOLVED });
  await assert.rejects(
    () =>
      materializeRecoveryFlowWithTasksInTx(tx as never, {
        organizationId: "org-1",
        jobIssueId: "issue-1",
        jobId: "job-1",
        issueTitle: "Issue",
        actorUserId: "user-1",
        tasks: [{ title: "Step", category: TaskTemplateCategory.GENERAL }],
      }),
    /open issues/i,
  );
  assert.equal(tx.flowCreates.length, 0);
});
