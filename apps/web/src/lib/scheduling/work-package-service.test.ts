import assert from "node:assert/strict";
import test from "node:test";
import { assignTaskWorkPackage, createWorkPackage } from "./work-package-service";

test("createWorkPackage assigns next display order and audits create", async () => {
  const calls: { createdTitle?: string; displayOrder?: number; activityTitle?: string } = {};
  const tx = {
    jobWorkPackage: {
      aggregate: async () => ({ _max: { displayOrder: 4 } }),
      create: async (args: {
        data: { title: string; displayOrder: number };
        select: { id: true };
      }) => {
        calls.createdTitle = args.data.title;
        calls.displayOrder = args.data.displayOrder;
        return { id: "wp-1" };
      },
    },
    jobActivity: {
      create: async (args: { data: { title: string } }) => {
        calls.activityTitle = args.data.title;
        return { id: "act-1" };
      },
    },
  } as never;

  const result = await createWorkPackage(
    {
      organizationId: "org-1",
      jobId: "job-1",
      title: "  Electrical Group  ",
      actorUserId: "user-1",
    },
    tx,
  );
  assert.deepEqual(result, { success: true, workPackageId: "wp-1" });
  assert.equal(calls.createdTitle, "Electrical Group");
  assert.equal(calls.displayOrder, 5);
  assert.equal(calls.activityTitle, "Work group created: Electrical Group");
});

test("assignTaskWorkPackage keeps membership behavior for historical tasks", async () => {
  const calls: { updatedWorkPackageId?: string | null; activityTitle?: string } = {};
  const tx = {
    jobTask: {
      findFirst: async () => ({
        id: "task-1",
        jobId: "job-1",
        title: "Historical Task",
        status: "CANCELED",
        workPackageId: "old-wp",
      }),
      update: async (args: { data: { workPackageId: string | null } }) => {
        calls.updatedWorkPackageId = args.data.workPackageId;
        return { id: "task-1" };
      },
    },
    jobWorkPackage: {
      findFirst: async () => ({ id: "new-wp", title: "Scope Delta Group" }),
    },
    jobActivity: {
      create: async (args: { data: { title: string } }) => {
        calls.activityTitle = args.data.title;
        return { id: "act-1" };
      },
    },
  } as never;

  const result = await assignTaskWorkPackage(
    {
      organizationId: "org-1",
      taskId: "task-1",
      workPackageId: "new-wp",
      actorUserId: "user-1",
    },
    tx,
  );
  assert.deepEqual(result, { success: true });
  assert.equal(calls.updatedWorkPackageId, "new-wp");
  assert.equal(calls.activityTitle, "Task added to work group: Historical Task");
});

