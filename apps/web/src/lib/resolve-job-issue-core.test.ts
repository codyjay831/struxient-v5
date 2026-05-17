import assert from "node:assert/strict";
import test from "node:test";
import {
  JobActivityType,
  JobIssueStatus,
  JobRecoveryFlowStatus,
  JobTaskStatus,
} from "@prisma/client";
import {
  assertCanResolveIssue,
  recoveryFlowHasIncompleteTasks,
  resolveJobIssueWithRecoveryHandling,
} from "./resolve-job-issue-core";

test("recoveryFlowHasIncompleteTasks: empty task list is incomplete", () => {
  assert.equal(
    recoveryFlowHasIncompleteTasks({
      id: "flow-1",
      status: JobRecoveryFlowStatus.ACTIVE,
      tasks: [],
    }),
    true,
  );
});

test("recoveryFlowHasIncompleteTasks: any non-DONE is incomplete", () => {
  assert.equal(
    recoveryFlowHasIncompleteTasks({
      id: "flow-1",
      status: JobRecoveryFlowStatus.ACTIVE,
      tasks: [
        { id: "t1", status: JobTaskStatus.DONE },
        { id: "t2", status: JobTaskStatus.TODO },
      ],
    }),
    true,
  );
});

test("recoveryFlowHasIncompleteTasks: all DONE is complete", () => {
  assert.equal(
    recoveryFlowHasIncompleteTasks({
      id: "flow-1",
      status: JobRecoveryFlowStatus.ACTIVE,
      tasks: [{ id: "t1", status: JobTaskStatus.DONE }],
    }),
    false,
  );
});

test("assertCanResolveIssue: no recovery flow is a no-op", () => {
  assert.doesNotThrow(() =>
    assertCanResolveIssue(
      {
        id: "issue-1",
        jobId: "job-1",
        title: "Test",
        recoveryFlow: null,
      },
      "standard",
    ),
  );
});

test("assertCanResolveIssue: standard blocks when recovery incomplete", () => {
  assert.throws(
    () =>
      assertCanResolveIssue(
        {
          id: "issue-1",
          jobId: "job-1",
          title: "Test",
          recoveryFlow: {
            id: "flow-1",
            status: JobRecoveryFlowStatus.ACTIVE,
            tasks: [{ id: "t1", status: JobTaskStatus.TODO }],
          },
        },
        "standard",
      ),
    /open recovery flow with incomplete steps/,
  );
});

test("assertCanResolveIssue: force allows incomplete recovery", () => {
  assert.doesNotThrow(() =>
    assertCanResolveIssue(
      {
        id: "issue-1",
        jobId: "job-1",
        title: "Test",
        recoveryFlow: {
          id: "flow-1",
          status: JobRecoveryFlowStatus.ACTIVE,
          tasks: [{ id: "t1", status: JobTaskStatus.TODO }],
        },
      },
      "force",
    ),
  );
});

test("assertCanResolveIssue: resume blocks when recovery incomplete", () => {
  assert.throws(
    () =>
      assertCanResolveIssue(
        {
          id: "issue-1",
          jobId: "job-1",
          title: "Test",
          recoveryFlow: {
            id: "flow-1",
            status: JobRecoveryFlowStatus.ACTIVE,
            tasks: [{ id: "t1", status: JobTaskStatus.TODO }],
          },
        },
        "resume",
      ),
    /Complete all recovery steps/,
  );
});

test("assertCanResolveIssue: resume allows when recovery complete", () => {
  assert.doesNotThrow(() =>
    assertCanResolveIssue(
      {
        id: "issue-1",
        jobId: "job-1",
        title: "Test",
        recoveryFlow: {
          id: "flow-1",
          status: JobRecoveryFlowStatus.ACTIVE,
          tasks: [{ id: "t1", status: JobTaskStatus.DONE }],
        },
      },
      "resume",
    ),
  );
});

test("assertCanResolveIssue: closed recovery flow does not block standard", () => {
  assert.doesNotThrow(() =>
    assertCanResolveIssue(
      {
        id: "issue-1",
        jobId: "job-1",
        title: "Test",
        recoveryFlow: {
          id: "flow-1",
          status: JobRecoveryFlowStatus.COMPLETED,
          tasks: [{ id: "t1", status: JobTaskStatus.TODO }],
        },
      },
      "standard",
    ),
  );
});

function createMockTx() {
  const jobIssueUpdates: unknown[] = [];
  const jobRecoveryFlowUpdates: unknown[] = [];
  const jobActivityCreates: unknown[] = [];
  const tx = {
    jobIssue: {
      update: async (args: unknown) => {
        jobIssueUpdates.push(args);
      },
    },
    jobRecoveryFlow: {
      update: async (args: unknown) => {
        jobRecoveryFlowUpdates.push(args);
      },
    },
    jobActivity: {
      create: async (args: unknown) => {
        jobActivityCreates.push(args);
      },
    },
    jobIssueUpdates,
    jobRecoveryFlowUpdates,
    jobActivityCreates,
  };
  return tx;
}

test("resolveJobIssueWithRecoveryHandling: force cancels flow and records forced activity", async () => {
  const tx = createMockTx();
  await resolveJobIssueWithRecoveryHandling(tx as never, {
    organizationId: "org-1",
    issue: {
      id: "issue-1",
      jobId: "job-1",
      title: "Leak",
      recoveryFlow: {
        id: "flow-1",
        status: JobRecoveryFlowStatus.ACTIVE,
        tasks: [{ id: "t1", status: JobTaskStatus.TODO }],
      },
    },
    resolutionNote: " Customer waived follow-up ",
    mode: "force",
    actorUserId: "user-1",
  });

  assert.equal(tx.jobIssueUpdates.length, 1);
  const issueUpdate = tx.jobIssueUpdates[0] as {
    where: { id: string };
    data: { status: JobIssueStatus };
  };
  assert.equal(issueUpdate.where.id, "issue-1");
  assert.equal(issueUpdate.data.status, JobIssueStatus.RESOLVED);

  assert.equal(tx.jobRecoveryFlowUpdates.length, 1);
  const flowUpdate = tx.jobRecoveryFlowUpdates[0] as {
    where: { id: string };
    data: { status: JobRecoveryFlowStatus };
  };
  assert.equal(flowUpdate.where.id, "flow-1");
  assert.equal(flowUpdate.data.status, JobRecoveryFlowStatus.CANCELLED);

  assert.equal(tx.jobActivityCreates.length, 1);
  const act = tx.jobActivityCreates[0] as { data: Record<string, unknown> };
  assert.equal(act.data.type, JobActivityType.ISSUE_RESOLVED);
  assert.equal(act.data.metadataJson && (act.data.metadataJson as { forced?: boolean }).forced, true);
});

test("resolveJobIssueWithRecoveryHandling: standard with complete recovery matches resume", async () => {
  const tx = createMockTx();
  await resolveJobIssueWithRecoveryHandling(tx as never, {
    organizationId: "org-1",
    issue: {
      id: "issue-1",
      jobId: "job-1",
      title: "Leak",
      recoveryFlow: {
        id: "flow-1",
        status: JobRecoveryFlowStatus.ACTIVE,
        tasks: [{ id: "t1", status: JobTaskStatus.DONE }],
      },
    },
    mode: "standard",
    actorUserId: "user-1",
  });

  assert.equal(tx.jobRecoveryFlowUpdates.length, 1);
  const flowUpdate = tx.jobRecoveryFlowUpdates[0] as {
    data: { status: JobRecoveryFlowStatus };
  };
  assert.equal(flowUpdate.data.status, JobRecoveryFlowStatus.COMPLETED);

  const act = tx.jobActivityCreates[0] as { data: Record<string, unknown> };
  assert.equal(act.data.type, JobActivityType.RECOVERY_FLOW_COMPLETED);
  const meta = act.data.metadataJson as { originalPathResumed?: boolean };
  assert.equal(meta.originalPathResumed, true);
});

test("resolveJobIssueWithRecoveryHandling: resume completes flow", async () => {
  const tx = createMockTx();
  await resolveJobIssueWithRecoveryHandling(tx as never, {
    organizationId: "org-1",
    issue: {
      id: "issue-1",
      jobId: "job-1",
      title: "Leak",
      recoveryFlow: {
        id: "flow-1",
        status: JobRecoveryFlowStatus.ACTIVE,
        tasks: [{ id: "t1", status: JobTaskStatus.DONE }],
      },
    },
    mode: "resume",
    actorUserId: "user-1",
  });

  assert.equal(tx.jobRecoveryFlowUpdates.length, 1);
  const flowUpdate = tx.jobRecoveryFlowUpdates[0] as {
    data: { status: JobRecoveryFlowStatus };
  };
  assert.equal(flowUpdate.data.status, JobRecoveryFlowStatus.COMPLETED);

  assert.equal(tx.jobActivityCreates.length, 1);
  const act = tx.jobActivityCreates[0] as { data: Record<string, unknown> };
  assert.equal(act.data.type, JobActivityType.RECOVERY_FLOW_COMPLETED);
});

test("resolveJobIssueWithRecoveryHandling: standard without open flow records issue resolved", async () => {
  const tx = createMockTx();
  await resolveJobIssueWithRecoveryHandling(tx as never, {
    organizationId: "org-1",
    issue: {
      id: "issue-1",
      jobId: "job-1",
      title: "Minor",
      recoveryFlow: null,
    },
    mode: "standard",
    actorUserId: "user-1",
  });

  assert.equal(tx.jobRecoveryFlowUpdates.length, 0);
  assert.equal(tx.jobActivityCreates.length, 1);
  const act = tx.jobActivityCreates[0] as { data: Record<string, unknown> };
  assert.equal(act.data.type, JobActivityType.ISSUE_RESOLVED);
  assert.equal(
    String(act.data.title || "").includes("Issue resolved"),
    true,
  );
});
