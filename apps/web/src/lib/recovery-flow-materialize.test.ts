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
  existingFlowStatus?: JobRecoveryFlowStatus;
  issueStatus?: JobIssueStatus;
  issueJobTaskId?: string | null;
  validSourceTaskIds?: string[];
}) {
  const issueStatus = options?.issueStatus ?? JobIssueStatus.OPEN;
  const issueJobTaskId = options?.issueJobTaskId ?? null;
  const validSourceTaskIds = new Set(options?.validSourceTaskIds ?? []);
  const flowCreates: unknown[] = [];
  const taskCreates: unknown[] = [];
  const activityCreates: unknown[] = [];
  let flowIdCounter = 0;
  let taskIdCounter = 0;

  const tx = {
    jobRecoveryFlow: {
      findUnique: async () =>
        options?.existingFlow
          ? {
              id: "flow-existing",
              status: options.existingFlowStatus ?? JobRecoveryFlowStatus.ACTIVE,
            }
          : null,
      create: async (args: { data: Record<string, unknown> }) => {
        flowCreates.push(args);
        flowIdCounter += 1;
        return { id: `flow-${flowIdCounter}` };
      },
    },
    jobIssue: {
      findFirst: async () =>
        issueStatus === JobIssueStatus.OPEN
          ? { id: "issue-1", status: JobIssueStatus.OPEN, jobTaskId: issueJobTaskId }
          : issueStatus === JobIssueStatus.RESOLVED
            ? { id: "issue-1", status: JobIssueStatus.RESOLVED, jobTaskId: issueJobTaskId }
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
      findFirst: async (args: { where: { id: string } }) =>
        validSourceTaskIds.has(args.where.id) ? { id: args.where.id } : null,
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
  const tx = createMaterializeMockTx({ issueJobTaskId: "task-source" });
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
  assert.equal(flowData.sourceFailedTaskId, "task-source");

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
  const tx = createMaterializeMockTx({
    existingFlow: true,
    existingFlowStatus: JobRecoveryFlowStatus.COMPLETED,
  });
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

test("materializeRecoveryFlowWithTasksInTx: rejects when active or draft flow already exists", async () => {
  const tx = createMaterializeMockTx({
    existingFlow: true,
    existingFlowStatus: JobRecoveryFlowStatus.DRAFT,
  });
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
    /already in progress/i,
  );
});

test("materializeRecoveryFlowWithTasksInTx: explicit sourceFailedTaskId wins when valid", async () => {
  const tx = createMaterializeMockTx({
    issueJobTaskId: "task-from-issue",
    validSourceTaskIds: ["task-explicit"],
  });
  await materializeRecoveryFlowWithTasksInTx(tx as never, {
    organizationId: "org-1",
    jobIssueId: "issue-1",
    jobId: "job-1",
    issueTitle: "Issue",
    actorUserId: "user-1",
    sourceFailedTaskId: "task-explicit",
    tasks: [{ title: "Step", category: TaskTemplateCategory.GENERAL }],
  });

  const flowData = (tx.flowCreates[0] as { data: Record<string, unknown> }).data;
  assert.equal(flowData.sourceFailedTaskId, "task-explicit");
});

test("materializeRecoveryFlowWithTasksInTx: allows sourceFailedTaskId pointing to a recovery task in same job/org", async () => {
  const tx = createMaterializeMockTx({
    issueJobTaskId: "task-from-issue",
    validSourceTaskIds: ["task-recovery-1"],
  });
  await materializeRecoveryFlowWithTasksInTx(tx as never, {
    organizationId: "org-1",
    jobIssueId: "issue-1",
    jobId: "job-1",
    issueTitle: "Issue",
    actorUserId: "user-1",
    sourceFailedTaskId: "task-recovery-1",
    tasks: [{ title: "Step", category: TaskTemplateCategory.GENERAL }],
  });

  const flowData = (tx.flowCreates[0] as { data: Record<string, unknown> }).data;
  assert.equal(flowData.sourceFailedTaskId, "task-recovery-1");
});

test("materializeRecoveryFlowWithTasksInTx: explicit sourceFailedTaskId rejects invalid task", async () => {
  const tx = createMaterializeMockTx({ issueJobTaskId: "task-from-issue" });
  await assert.rejects(
    () =>
      materializeRecoveryFlowWithTasksInTx(tx as never, {
        organizationId: "org-1",
        jobIssueId: "issue-1",
        jobId: "job-1",
        issueTitle: "Issue",
        actorUserId: "user-1",
        sourceFailedTaskId: "task-cross-job",
        tasks: [{ title: "Step", category: TaskTemplateCategory.GENERAL }],
      }),
    /same job and organization/i,
  );
});

test("materializeRecoveryFlowWithTasksInTx: sourceFailedTaskId remains empty when issue has no source task", async () => {
  const tx = createMaterializeMockTx({ issueJobTaskId: null });
  await materializeRecoveryFlowWithTasksInTx(tx as never, {
    organizationId: "org-1",
    jobIssueId: "issue-1",
    jobId: "job-1",
    issueTitle: "Issue",
    actorUserId: "user-1",
    tasks: [{ title: "Step", category: TaskTemplateCategory.GENERAL }],
  });

  const flowData = (tx.flowCreates[0] as { data: Record<string, unknown> }).data;
  assert.equal(flowData.sourceFailedTaskId, undefined);
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
