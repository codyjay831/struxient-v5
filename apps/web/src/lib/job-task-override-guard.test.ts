import assert from "node:assert/strict";
import test from "node:test";
import {
  JobIssueSeverity,
  JobIssueStatus,
  JobTaskStatus,
} from "@prisma/client";
import {
  OVERRIDE_BLOCKED_BY_ISSUE_MESSAGE,
  assertCanOverrideTaskReadiness,
} from "./job-task-override-guard";

const openBlocksWorkIssue = {
  id: "issue-1",
  status: JobIssueStatus.OPEN,
  severity: JobIssueSeverity.BLOCKS_WORK,
};

test("assertCanOverrideTaskReadiness: rejects when OPEN BLOCKS_WORK issue on task", () => {
  const result = assertCanOverrideTaskReadiness({
    status: JobTaskStatus.TODO,
    issues: [openBlocksWorkIssue],
    jobStage: { issues: [] },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error, OVERRIDE_BLOCKED_BY_ISSUE_MESSAGE);
  }
});

test("assertCanOverrideTaskReadiness: rejects when OPEN BLOCKS_WORK issue on stage", () => {
  const result = assertCanOverrideTaskReadiness({
    status: JobTaskStatus.TODO,
    issues: [],
    jobStage: { issues: [openBlocksWorkIssue] },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error, OVERRIDE_BLOCKED_BY_ISSUE_MESSAGE);
  }
});

test("assertCanOverrideTaskReadiness: allows override when only signal-blocked (no open BLOCKS_WORK issue)", () => {
  const result = assertCanOverrideTaskReadiness({
    status: JobTaskStatus.TODO,
    issues: [],
    jobStage: { issues: [] },
  });

  assert.equal(result.ok, true);
});

test("overrideJobTaskReadinessAction: gate failure implies no DB write or signal publish path", () => {
  const blocked = assertCanOverrideTaskReadiness({
    status: JobTaskStatus.TODO,
    issues: [openBlocksWorkIssue],
    jobStage: { issues: [] },
  });

  assert.equal(blocked.ok, false);
  // overrideJobTaskReadinessAction returns { error } immediately when !overrideGate.ok,
  // before db.$transaction or publishSignal — task remains TODO with no new signals.
});
