import assert from "node:assert/strict";
import test from "node:test";
import { JobTaskStatus, JobIssueStatus, JobIssueSeverity } from "@prisma/client";
import {
  deriveTaskState,
  deriveStageState,
  toTaskReadinessInput,
  validateTaskCompletionReadiness,
} from "./task-readiness";

test("deriveTaskState: READY when no requirements", () => {
  const state = deriveTaskState({
    status: JobTaskStatus.TODO,
    completedAt: null,
    completionNote: null,
    completionRequirementsJson: {},
    attachments: [],
    requiresSignals: [],
    issues: [],
    stage: { requiresSignals: [], issues: [] }
  }, []);
  assert.equal(state, "READY");
});

test("deriveTaskState: BLOCKED_BY_SIGNAL when task requirement missing", () => {
  const state = deriveTaskState({
    status: JobTaskStatus.TODO,
    completedAt: null,
    completionNote: null,
    completionRequirementsJson: {},
    attachments: [],
    requiresSignals: ["signal-a"],
    issues: [],
    stage: { requiresSignals: [], issues: [] }
  }, []);
  assert.equal(state, "BLOCKED_BY_SIGNAL");
});

test("deriveTaskState: READY when task requirement met", () => {
  const state = deriveTaskState({
    status: JobTaskStatus.TODO,
    completedAt: null,
    completionNote: null,
    completionRequirementsJson: {},
    attachments: [],
    requiresSignals: ["signal-a"],
    issues: [],
    stage: { requiresSignals: [], issues: [] }
  }, ["signal-a"]);
  assert.equal(state, "READY");
});

test("deriveTaskState: ignores stage signal requirements in v5 MVP", () => {
  const state = deriveTaskState({
    status: JobTaskStatus.TODO,
    completedAt: null,
    completionNote: null,
    completionRequirementsJson: {},
    attachments: [],
    requiresSignals: [],
    issues: [],
    stage: { requiresSignals: ["stage-signal"], issues: [] }
  }, []);
  assert.equal(state, "READY");
});

test("deriveTaskState: BLOCKED_BY_ISSUE when task has blocking issue", () => {
  const state = deriveTaskState({
    status: JobTaskStatus.TODO,
    completedAt: null,
    completionNote: null,
    completionRequirementsJson: {},
    attachments: [],
    requiresSignals: [],
    issues: [{ id: "issue-1", status: JobIssueStatus.OPEN, severity: JobIssueSeverity.BLOCKS_WORK }],
    stage: { requiresSignals: [], issues: [] }
  }, []);
  assert.equal(state, "BLOCKED_BY_ISSUE");
});

test("deriveTaskState: READY when task is part of recovery flow for the blocking issue", () => {
  const state = deriveTaskState({
    status: JobTaskStatus.TODO,
    completedAt: null,
    completionNote: null,
    completionRequirementsJson: {},
    attachments: [],
    requiresSignals: [],
    issues: [{ id: "issue-1", status: JobIssueStatus.OPEN, severity: JobIssueSeverity.BLOCKS_WORK }],
    stage: { requiresSignals: [], issues: [] }
  }, [], { recoveryFlowIssueId: "issue-1" });
  assert.equal(state, "READY");
});

test("deriveTaskState: BLOCKED_BY_ISSUE when stage has blocking issue", () => {
  const state = deriveTaskState({
    status: JobTaskStatus.TODO,
    completedAt: null,
    completionNote: null,
    completionRequirementsJson: {},
    attachments: [],
    requiresSignals: [],
    issues: [],
    stage: { requiresSignals: [], issues: [{ id: "issue-2", status: JobIssueStatus.OPEN, severity: JobIssueSeverity.BLOCKS_WORK }] }
  }, []);
  assert.equal(state, "BLOCKED_BY_ISSUE");
});

test("deriveTaskState: READY when stage issue is bypassed by recovery flow", () => {
  const state = deriveTaskState({
    status: JobTaskStatus.TODO,
    completedAt: null,
    completionNote: null,
    completionRequirementsJson: {},
    attachments: [],
    requiresSignals: [],
    issues: [],
    stage: { requiresSignals: [], issues: [{ id: "issue-2", status: JobIssueStatus.OPEN, severity: JobIssueSeverity.BLOCKS_WORK }] }
  }, [], { recoveryFlowIssueId: "issue-2" });
  assert.equal(state, "READY");
});

test("deriveTaskState: READY when issue is resolved", () => {
  const state = deriveTaskState({
    status: JobTaskStatus.TODO,
    completedAt: null,
    completionNote: null,
    completionRequirementsJson: {},
    attachments: [],
    requiresSignals: [],
    issues: [{ id: "issue-1", status: JobIssueStatus.RESOLVED, severity: JobIssueSeverity.BLOCKS_WORK }],
    stage: { requiresSignals: [], issues: [] }
  }, []);
  assert.equal(state, "READY");
});

test("deriveStageState: READY when all tasks ready", () => {
  const state = deriveStageState({
    requiresSignals: [],
    issues: [],
    tasks: [
      { 
        status: JobTaskStatus.TODO, 
        completedAt: null,
        completionNote: null,
        completionRequirementsJson: {},
        attachments: [],
        requiresSignals: [], 
        issues: [] 
      }
    ]
  }, []);
  assert.equal(state, "READY");
});

test("deriveStageState: READY when stage requirement missing (stage gates deferred)", () => {
  const state = deriveStageState({
    requiresSignals: ["signal-a"],
    issues: [],
    tasks: [
      { 
        status: JobTaskStatus.TODO, 
        completedAt: null,
        completionNote: null,
        completionRequirementsJson: {},
        attachments: [],
        requiresSignals: [], 
        issues: [] 
      }
    ]
  }, []);
  assert.equal(state, "READY");
});

test("toTaskReadinessInput: maps jobStage issues into stage context", () => {
  const input = toTaskReadinessInput(
    {
      status: JobTaskStatus.TODO,
      issues: [],
      jobStage: {
        requiresSignals: ["stage-signal"],
        issues: [{ id: "issue-2", status: JobIssueStatus.OPEN, severity: JobIssueSeverity.BLOCKS_WORK }],
      },
    },
    { requiresSignals: ["stage-signal"], issues: [{ id: "issue-2", status: JobIssueStatus.OPEN, severity: JobIssueSeverity.BLOCKS_WORK }] },
  );
  const state = deriveTaskState(input, []);
  assert.equal(state, "BLOCKED_BY_ISSUE");
});

test("deriveStageState: COMPLETED when all tasks DONE", () => {
  const state = deriveStageState({
    requiresSignals: [],
    issues: [],
    tasks: [
      { 
        status: JobTaskStatus.DONE, 
        completedAt: new Date(),
        completionNote: null,
        completionRequirementsJson: {},
        attachments: [],
        requiresSignals: [], 
        issues: [] 
      }
    ]
  }, []);
  assert.equal(state, "COMPLETED");
});

test("validateTaskCompletionReadiness: rejects incomplete checklist", () => {
  const result = validateTaskCompletionReadiness({
    completionNote: null,
    completionRequirementsJson: {
      checklist: [{ id: "c1", label: "Item 1", completedAt: null }],
    },
    attachments: [],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /checklist/i);
  }
});

test("validateTaskCompletionReadiness: accepts complete checklist", () => {
  const result = validateTaskCompletionReadiness({
    completionNote: null,
    completionRequirementsJson: {
      checklist: [{ id: "c1", label: "Item 1", completedAt: "2026-01-01T00:00:00.000Z" }],
    },
    attachments: [],
  });
  assert.equal(result.ok, true);
});
