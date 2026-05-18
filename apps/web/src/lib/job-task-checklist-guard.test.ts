import assert from "node:assert/strict";
import test from "node:test";
import {
  JobIssueSeverity,
  JobIssueStatus,
  JobTaskStatus,
} from "@prisma/client";
import {
  CHECKLIST_BLOCKED_BY_ISSUE_MESSAGE,
  CHECKLIST_COMPLETED_TASK_MESSAGE,
  assertCanToggleTaskChecklistItem,
} from "./job-task-checklist-guard";

const openBlocksWorkIssue = {
  id: "issue-1",
  status: JobIssueStatus.OPEN,
  severity: JobIssueSeverity.BLOCKS_WORK,
};

const baseTask = {
  status: JobTaskStatus.TODO,
  completedAt: null,
  completionNote: null,
  completionRequirementsJson: {
    checklist: [{ id: "c1", label: "Step 1", completedAt: null }],
  },
  attachments: [],
  requiresSignals: [] as string[],
  issues: [] as typeof openBlocksWorkIssue[],
  jobStage: { issues: [] as typeof openBlocksWorkIssue[] },
  liveSignals: [] as string[],
};

test("assertCanToggleTaskChecklistItem: rejects marking done when BLOCKED_BY_ISSUE on task", () => {
  const result = assertCanToggleTaskChecklistItem({
    ...baseTask,
    issues: [openBlocksWorkIssue],
    completed: true,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error, CHECKLIST_BLOCKED_BY_ISSUE_MESSAGE);
  }
});

test("assertCanToggleTaskChecklistItem: rejects marking done when BLOCKED_BY_ISSUE on stage", () => {
  const result = assertCanToggleTaskChecklistItem({
    ...baseTask,
    jobStage: { issues: [openBlocksWorkIssue] },
    completed: true,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error, CHECKLIST_BLOCKED_BY_ISSUE_MESSAGE);
  }
});

test("assertCanToggleTaskChecklistItem: allows uncheck when BLOCKED_BY_ISSUE", () => {
  const result = assertCanToggleTaskChecklistItem({
    ...baseTask,
    issues: [openBlocksWorkIssue],
    completionRequirementsJson: {
      checklist: [
        {
          id: "c1",
          label: "Step 1",
          completedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    },
    completed: false,
  });

  assert.equal(result.ok, true);
});

test("assertCanToggleTaskChecklistItem: allows marking done when recovery flow bypasses issue", () => {
  const result = assertCanToggleTaskChecklistItem({
    ...baseTask,
    issues: [openBlocksWorkIssue],
    recoveryFlowIssueId: "issue-1",
    completed: true,
  });

  assert.equal(result.ok, true);
});

test("assertCanToggleTaskChecklistItem: allows marking done when BLOCKED_BY_SIGNAL only", () => {
  const result = assertCanToggleTaskChecklistItem({
    ...baseTask,
    requiresSignals: ["roof-ready"],
    liveSignals: [],
    completed: true,
  });

  assert.equal(result.ok, true);
});

test("assertCanToggleTaskChecklistItem: rejects any toggle on completed task", () => {
  const done = assertCanToggleTaskChecklistItem({
    ...baseTask,
    status: JobTaskStatus.DONE,
    completedAt: new Date(),
    completed: true,
  });
  assert.equal(done.ok, false);
  if (!done.ok) {
    assert.equal(done.error, CHECKLIST_COMPLETED_TASK_MESSAGE);
  }

  const uncheck = assertCanToggleTaskChecklistItem({
    ...baseTask,
    status: JobTaskStatus.DONE,
    completedAt: new Date(),
    completed: false,
  });
  assert.equal(uncheck.ok, false);
  if (!uncheck.ok) {
    assert.equal(uncheck.error, CHECKLIST_COMPLETED_TASK_MESSAGE);
  }
});
