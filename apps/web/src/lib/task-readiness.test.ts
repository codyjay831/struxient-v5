import assert from "node:assert/strict";
import test from "node:test";
import { JobTaskStatus, JobIssueStatus, JobIssueSeverity } from "@prisma/client";
import { deriveTaskState, deriveStageState } from "./task-readiness";

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

test("deriveTaskState: BLOCKED_BY_SIGNAL when stage requirement missing", () => {
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
  assert.equal(state, "BLOCKED_BY_SIGNAL");
});

test("deriveTaskState: BLOCKED_BY_ISSUE when task has blocking issue", () => {
  const state = deriveTaskState({
    status: JobTaskStatus.TODO,
    completedAt: null,
    completionNote: null,
    completionRequirementsJson: {},
    attachments: [],
    requiresSignals: [],
    issues: [{ status: JobIssueStatus.OPEN, severity: JobIssueSeverity.BLOCKS_WORK }],
    stage: { requiresSignals: [], issues: [] }
  }, []);
  assert.equal(state, "BLOCKED_BY_ISSUE");
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
    stage: { requiresSignals: [], issues: [{ status: JobIssueStatus.OPEN, severity: JobIssueSeverity.BLOCKS_WORK }] }
  }, []);
  assert.equal(state, "BLOCKED_BY_ISSUE");
});

test("deriveTaskState: READY when issue is resolved", () => {
  const state = deriveTaskState({
    status: JobTaskStatus.TODO,
    completedAt: null,
    completionNote: null,
    completionRequirementsJson: {},
    attachments: [],
    requiresSignals: [],
    issues: [{ status: JobIssueStatus.RESOLVED, severity: JobIssueSeverity.BLOCKS_WORK }],
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

test("deriveStageState: BLOCKED_BY_SIGNAL when stage requirement missing", () => {
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
  assert.equal(state, "BLOCKED_BY_SIGNAL");
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
