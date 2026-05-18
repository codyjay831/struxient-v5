import assert from "node:assert/strict";
import test from "node:test";
import {
  JobIssueSeverity,
  JobIssueStatus,
  JobRecoveryFlowStatus,
  JobStatus,
  JobPaymentRequirementStatus,
  JobTaskStatus,
} from "@prisma/client";
import { CORRECTIONS_STAGE_NAME } from "./job-payment-readiness";
import {
  buildJobExecutionContextFromJob,
  deriveJobExecutionHealth,
  isJobExecutionBlockedForWorkstation,
  type BuildJobExecutionContextJobInput,
} from "./job-execution-health";

function baseTask(overrides: Partial<BuildJobExecutionContextJobInput["stages"][0]["tasks"][0]> = {}) {
  return {
    id: "task-1",
    status: JobTaskStatus.TODO,
    completedAt: null,
    completionNote: null,
    completionRequirementsJson: {},
    attachments: [],
    requiresSignals: [],
    recoveryFlowId: null,
    sortOrder: 0,
    issues: [],
    recoveryFlow: null,
    ...overrides,
  };
}

function baseJob(
  overrides: Partial<BuildJobExecutionContextJobInput> = {},
): BuildJobExecutionContextJobInput {
  return {
    id: "job-1",
    status: JobStatus.ACTIVE,
    stages: [
      {
        id: "stage-1",
        title: "Install",
        sortOrder: 0,
        stageId: "org-stage-1",
        issues: [],
        tasks: [baseTask()],
      },
    ],
    issues: [],
    paymentRequirements: [],
    ...overrides,
  };
}

test("deriveJobExecutionHealth: HEALTHY_ACTIONABLE when main task READY", () => {
  const ctx = buildJobExecutionContextFromJob(baseJob(), []);
  const health = deriveJobExecutionHealth(ctx);
  assert.equal(health.primaryState, "HEALTHY_ACTIONABLE");
  assert.equal(health.nextActionableMainTaskId, "task-1");
  assert.equal(health.invariantSatisfied, true);
});

test("deriveJobExecutionHealth: COMPLETE when all main tasks done", () => {
  const ctx = buildJobExecutionContextFromJob(
    baseJob({
      stages: [
        {
          id: "stage-1",
          title: "Install",
          sortOrder: 0,
          stageId: "org-stage-1",
          issues: [],
          tasks: [
            baseTask({
              id: "task-1",
              status: JobTaskStatus.DONE,
              completedAt: new Date(),
            }),
          ],
        },
      ],
    }),
    [],
  );
  const health = deriveJobExecutionHealth(ctx);
  assert.equal(health.primaryState, "COMPLETE");
  assert.equal(health.invariantSatisfied, true);
});

test("deriveJobExecutionHealth: BLOCKED_BY_SIGNAL when all incomplete main tasks wait on signals", () => {
  const ctx = buildJobExecutionContextFromJob(
    baseJob({
      stages: [
        {
          id: "stage-1",
          title: "Install",
          sortOrder: 0,
          stageId: "org-stage-1",
          issues: [],
          tasks: [
            baseTask({
              id: "task-1",
              requiresSignals: ["prior-signal"],
            }),
          ],
        },
      ],
    }),
    [],
  );
  const health = deriveJobExecutionHealth(ctx);
  assert.equal(health.primaryState, "BLOCKED_BY_SIGNAL");
  assert.equal(health.invariantSatisfied, true);
});

test("deriveJobExecutionHealth: BLOCKED_BY_ISSUE when stage has blocking issue", () => {
  const ctx = buildJobExecutionContextFromJob(
    baseJob({
      stages: [
        {
          id: "stage-1",
          title: "Install",
          sortOrder: 0,
          stageId: "org-stage-1",
          issues: [
            {
              id: "issue-1",
              status: JobIssueStatus.OPEN,
              severity: JobIssueSeverity.BLOCKS_WORK,
            },
          ],
          tasks: [baseTask({ id: "task-1" })],
        },
      ],
      issues: [
        {
          id: "issue-1",
          title: "Failed inspection",
          status: JobIssueStatus.OPEN,
          severity: JobIssueSeverity.BLOCKS_WORK,
          recoveryFlow: null,
        },
      ],
    }),
    [],
  );
  const health = deriveJobExecutionHealth(ctx);
  assert.equal(health.primaryState, "BLOCKED_BY_ISSUE");
  assert.equal(health.invariantSatisfied, true);
});

test("deriveJobExecutionHealth: RECOVERY_READY_TO_RESUME when recovery done and issue open", () => {
  const ctx = buildJobExecutionContextFromJob(
    baseJob({
      stages: [
        {
          id: "stage-1",
          title: "Install",
          sortOrder: 0,
          stageId: "org-stage-1",
          issues: [
            {
              id: "issue-1",
              status: JobIssueStatus.OPEN,
              severity: JobIssueSeverity.BLOCKS_WORK,
            },
          ],
          tasks: [
            baseTask({ id: "task-main", requiresSignals: [] }),
            baseTask({
              id: "task-recovery",
              recoveryFlowId: "flow-1",
              recoveryFlow: { jobIssueId: "issue-1" },
              status: JobTaskStatus.DONE,
              completedAt: new Date(),
            }),
          ],
        },
      ],
      issues: [
        {
          id: "issue-1",
          title: "Failed inspection",
          status: JobIssueStatus.OPEN,
          severity: JobIssueSeverity.BLOCKS_WORK,
          recoveryFlow: {
            id: "flow-1",
            status: JobRecoveryFlowStatus.ACTIVE,
            tasks: [{ id: "task-recovery", status: JobTaskStatus.DONE }],
          },
        },
      ],
    }),
    [],
  );
  const health = deriveJobExecutionHealth(ctx);
  assert.equal(health.primaryState, "RECOVERY_READY_TO_RESUME");
  assert.equal(health.recommendedNextAction.type, "resume_path");
});

test("deriveJobExecutionHealth: STALE_RECOVERY_FLOW when issue resolved but flow active", () => {
  const ctx = buildJobExecutionContextFromJob(
    baseJob({
      issues: [
        {
          id: "issue-1",
          title: "Old issue",
          status: JobIssueStatus.RESOLVED,
          severity: JobIssueSeverity.BLOCKS_WORK,
          recoveryFlow: {
            id: "flow-1",
            status: JobRecoveryFlowStatus.ACTIVE,
            tasks: [],
          },
        },
      ],
    }),
    [],
  );
  const health = deriveJobExecutionHealth(ctx);
  assert.equal(health.primaryState, "STALE_RECOVERY_FLOW");
  assert.ok(health.warnings.some((w) => w.code === "STALE_RECOVERY_FLOW"));
});

test("deriveJobExecutionHealth: BLOCKED_BY_PAYMENT when payment due and no READY main task", () => {
  const ctx = buildJobExecutionContextFromJob(
    baseJob({
      stages: [
        {
          id: "stage-1",
          title: "Install",
          sortOrder: 0,
          stageId: "org-stage-1",
          issues: [],
          tasks: [
            baseTask({
              id: "task-1",
              requiresSignals: ["deposit-cleared"],
            }),
          ],
        },
      ],
      paymentRequirements: [
        {
          id: "pay-1",
          title: "Deposit",
          status: JobPaymentRequirementStatus.DUE,
          requiredBeforeStageId: "stage-1",
          sourcePaymentScheduleItemId: null,
        },
      ],
    }),
    [],
  );
  const health = deriveJobExecutionHealth(ctx);
  assert.equal(health.primaryState, "BLOCKED_BY_PAYMENT");
});

test("deriveJobExecutionHealth: recovery-only job with incomplete recovery reports RECOVERY_ACTIVE", () => {
  const ctx = buildJobExecutionContextFromJob(
    baseJob({
      stages: [
        {
          id: "stage-corrections",
          title: CORRECTIONS_STAGE_NAME,
          sortOrder: 0,
          stageId: "org-stage-corrections",
          issues: [
            {
              id: "issue-1",
              status: JobIssueStatus.OPEN,
              severity: JobIssueSeverity.BLOCKS_WORK,
            },
          ],
          tasks: [
            baseTask({
              id: "task-recovery",
              recoveryFlowId: "flow-1",
              recoveryFlow: { jobIssueId: "issue-1" },
            }),
          ],
        },
      ],
      issues: [
        {
          id: "issue-1",
          title: "Failed inspection",
          status: JobIssueStatus.OPEN,
          severity: JobIssueSeverity.BLOCKS_WORK,
          recoveryFlow: {
            id: "flow-1",
            status: JobRecoveryFlowStatus.ACTIVE,
            tasks: [{ id: "task-recovery", status: JobTaskStatus.TODO }],
          },
        },
      ],
    }),
    [],
  );
  const health = deriveJobExecutionHealth(ctx);
  assert.equal(health.primaryState, "RECOVERY_ACTIVE");
  assert.notEqual(health.primaryState, "VALID_WAITING");
  assert.equal(health.invariantSatisfied, true);
});

test("deriveJobExecutionHealth: RECOVERY_ACTIVE when recovery task blocked by another issue", () => {
  const ctx = buildJobExecutionContextFromJob(
    baseJob({
      stages: [
        {
          id: "stage-corrections",
          title: CORRECTIONS_STAGE_NAME,
          sortOrder: 0,
          stageId: "org-stage-corrections",
          issues: [
            {
              id: "issue-1",
              status: JobIssueStatus.OPEN,
              severity: JobIssueSeverity.BLOCKS_WORK,
            },
            {
              id: "issue-2",
              status: JobIssueStatus.OPEN,
              severity: JobIssueSeverity.BLOCKS_WORK,
            },
          ],
          tasks: [
            baseTask({
              id: "task-recovery",
              recoveryFlowId: "flow-1",
              recoveryFlow: { jobIssueId: "issue-1" },
            }),
          ],
        },
      ],
      issues: [
        {
          id: "issue-1",
          title: "Parent issue",
          status: JobIssueStatus.OPEN,
          severity: JobIssueSeverity.BLOCKS_WORK,
          recoveryFlow: {
            id: "flow-1",
            status: JobRecoveryFlowStatus.ACTIVE,
            tasks: [{ id: "task-recovery", status: JobTaskStatus.TODO }],
          },
        },
        {
          id: "issue-2",
          title: "Secondary blocker",
          status: JobIssueStatus.OPEN,
          severity: JobIssueSeverity.BLOCKS_WORK,
          recoveryFlow: null,
        },
      ],
    }),
    [],
  );
  const health = deriveJobExecutionHealth(ctx);
  assert.equal(health.primaryState, "RECOVERY_ACTIVE");
  assert.equal(health.nextActionableRecoveryTaskId, null);
  assert.equal(health.severity, "blocker");
  assert.equal(health.invariantSatisfied, true);
});

test("deriveJobExecutionHealth: BROKEN_REFERENCE when recovery flow id is orphaned", () => {
  const ctx = buildJobExecutionContextFromJob(
    baseJob({
      stages: [
        {
          id: "stage-corrections",
          title: CORRECTIONS_STAGE_NAME,
          sortOrder: 0,
          stageId: "org-stage-corrections",
          issues: [],
          tasks: [
            baseTask({
              id: "task-recovery",
              recoveryFlowId: "orphan-flow",
              recoveryFlow: null,
            }),
          ],
        },
      ],
      issues: [],
    }),
    [],
  );
  const health = deriveJobExecutionHealth(ctx);
  assert.equal(health.primaryState, "BROKEN_REFERENCE");
  assert.ok(health.warnings.some((w) => w.code === "BROKEN_RECOVERY_REFERENCE"));
});

function legacyCoarseJobBlocked(
  issues: BuildJobExecutionContextJobInput["issues"],
  effectivelyDuePaymentCount: number,
): boolean {
  return issues.length > 0 || effectivelyDuePaymentCount > 0;
}

test("isJobExecutionBlockedForWorkstation: true for BLOCKED_BY_ISSUE", () => {
  const ctx = buildJobExecutionContextFromJob(
    baseJob({
      stages: [
        {
          id: "stage-1",
          title: "Install",
          sortOrder: 0,
          stageId: "org-stage-1",
          issues: [
            {
              id: "issue-1",
              status: JobIssueStatus.OPEN,
              severity: JobIssueSeverity.BLOCKS_WORK,
            },
          ],
          tasks: [baseTask({ id: "task-1" })],
        },
      ],
      issues: [
        {
          id: "issue-1",
          title: "Failed inspection",
          status: JobIssueStatus.OPEN,
          severity: JobIssueSeverity.BLOCKS_WORK,
          recoveryFlow: null,
        },
      ],
    }),
    [],
  );
  const health = deriveJobExecutionHealth(ctx);
  assert.equal(health.primaryState, "BLOCKED_BY_ISSUE");
  assert.equal(isJobExecutionBlockedForWorkstation(health), true);
});

test("isJobExecutionBlockedForWorkstation: true for BLOCKED_BY_PAYMENT", () => {
  const ctx = buildJobExecutionContextFromJob(
    baseJob({
      stages: [
        {
          id: "stage-1",
          title: "Install",
          sortOrder: 0,
          stageId: "org-stage-1",
          issues: [],
          tasks: [
            baseTask({
              id: "task-1",
              requiresSignals: ["deposit-cleared"],
            }),
          ],
        },
      ],
      paymentRequirements: [
        {
          id: "pay-1",
          title: "Deposit",
          status: JobPaymentRequirementStatus.DUE,
          requiredBeforeStageId: "stage-1",
          sourcePaymentScheduleItemId: null,
        },
      ],
    }),
    [],
  );
  const health = deriveJobExecutionHealth(ctx);
  assert.equal(health.primaryState, "BLOCKED_BY_PAYMENT");
  assert.equal(isJobExecutionBlockedForWorkstation(health), true);
});

test("isJobExecutionBlockedForWorkstation: true for RECOVERY_READY_TO_RESUME", () => {
  const ctx = buildJobExecutionContextFromJob(
    baseJob({
      stages: [
        {
          id: "stage-1",
          title: "Install",
          sortOrder: 0,
          stageId: "org-stage-1",
          issues: [
            {
              id: "issue-1",
              status: JobIssueStatus.OPEN,
              severity: JobIssueSeverity.BLOCKS_WORK,
            },
          ],
          tasks: [
            baseTask({ id: "task-main" }),
            baseTask({
              id: "task-recovery",
              recoveryFlowId: "flow-1",
              recoveryFlow: { jobIssueId: "issue-1" },
              status: JobTaskStatus.DONE,
              completedAt: new Date(),
            }),
          ],
        },
      ],
      issues: [
        {
          id: "issue-1",
          title: "Failed inspection",
          status: JobIssueStatus.OPEN,
          severity: JobIssueSeverity.BLOCKS_WORK,
          recoveryFlow: {
            id: "flow-1",
            status: JobRecoveryFlowStatus.ACTIVE,
            tasks: [{ id: "task-recovery", status: JobTaskStatus.DONE }],
          },
        },
      ],
    }),
    [],
  );
  const health = deriveJobExecutionHealth(ctx);
  assert.equal(health.primaryState, "RECOVERY_READY_TO_RESUME");
  assert.equal(isJobExecutionBlockedForWorkstation(health), true);
});

test("isJobExecutionBlockedForWorkstation: false for HEALTHY_ACTIONABLE with payment attention only", () => {
  const ctx = buildJobExecutionContextFromJob(
    baseJob({
      paymentRequirements: [
        {
          id: "pay-1",
          title: "Deposit",
          status: JobPaymentRequirementStatus.DUE,
          requiredBeforeStageId: "stage-1",
          sourcePaymentScheduleItemId: null,
        },
      ],
    }),
    [],
  );
  const health = deriveJobExecutionHealth(ctx);
  assert.equal(health.primaryState, "HEALTHY_ACTIONABLE");
  assert.equal(health.severity, "normal");
  assert.ok(health.warnings.some((w) => w.code === "PAYMENT_ATTENTION_ONLY"));
  assert.equal(isJobExecutionBlockedForWorkstation(health), false);
});

test("isJobExecutionBlockedForWorkstation: false for BLOCKED_BY_SIGNAL", () => {
  const ctx = buildJobExecutionContextFromJob(
    baseJob({
      stages: [
        {
          id: "stage-1",
          title: "Install",
          sortOrder: 0,
          stageId: "org-stage-1",
          issues: [],
          tasks: [
            baseTask({
              id: "task-1",
              requiresSignals: ["prior-signal"],
            }),
          ],
        },
      ],
    }),
    [],
  );
  const health = deriveJobExecutionHealth(ctx);
  assert.equal(health.primaryState, "BLOCKED_BY_SIGNAL");
  assert.equal(isJobExecutionBlockedForWorkstation(health), false);
});

test("isJobExecutionBlockedForWorkstation: false for RECOVERY_ACTIVE with ready recovery task", () => {
  const ctx = buildJobExecutionContextFromJob(
    baseJob({
      stages: [
        {
          id: "stage-corrections",
          title: CORRECTIONS_STAGE_NAME,
          sortOrder: 0,
          stageId: "org-stage-corrections",
          issues: [
            {
              id: "issue-1",
              status: JobIssueStatus.OPEN,
              severity: JobIssueSeverity.BLOCKS_WORK,
            },
          ],
          tasks: [
            baseTask({
              id: "task-recovery",
              recoveryFlowId: "flow-1",
              recoveryFlow: { jobIssueId: "issue-1" },
            }),
          ],
        },
      ],
      issues: [
        {
          id: "issue-1",
          title: "Failed inspection",
          status: JobIssueStatus.OPEN,
          severity: JobIssueSeverity.BLOCKS_WORK,
          recoveryFlow: {
            id: "flow-1",
            status: JobRecoveryFlowStatus.ACTIVE,
            tasks: [{ id: "task-recovery", status: JobTaskStatus.TODO }],
          },
        },
      ],
    }),
    [],
  );
  const health = deriveJobExecutionHealth(ctx);
  assert.equal(health.primaryState, "RECOVERY_ACTIVE");
  assert.equal(health.severity, "normal");
  assert.equal(isJobExecutionBlockedForWorkstation(health), false);
});

test("isJobExecutionBlockedForWorkstation: false for STALE_RECOVERY_FLOW", () => {
  const ctx = buildJobExecutionContextFromJob(
    baseJob({
      issues: [
        {
          id: "issue-1",
          title: "Old issue",
          status: JobIssueStatus.RESOLVED,
          severity: JobIssueSeverity.BLOCKS_WORK,
          recoveryFlow: {
            id: "flow-1",
            status: JobRecoveryFlowStatus.ACTIVE,
            tasks: [],
          },
        },
      ],
    }),
    [],
  );
  const health = deriveJobExecutionHealth(ctx);
  assert.equal(health.primaryState, "STALE_RECOVERY_FLOW");
  assert.equal(isJobExecutionBlockedForWorkstation(health), false);
});

test("R11 divergence: payment due with READY main task is not workstation-blocked", () => {
  const ctx = buildJobExecutionContextFromJob(
    baseJob({
      paymentRequirements: [
        {
          id: "pay-1",
          title: "Deposit",
          status: JobPaymentRequirementStatus.DUE,
          requiredBeforeStageId: "stage-1",
          sourcePaymentScheduleItemId: null,
        },
      ],
    }),
    [],
  );
  const health = deriveJobExecutionHealth(ctx);
  const coarseBlocked = legacyCoarseJobBlocked(ctx.issues, ctx.effectivelyDuePayments.length);
  assert.equal(coarseBlocked, true);
  assert.equal(isJobExecutionBlockedForWorkstation(health), false);
});

test("R11 divergence: open issue with READY task on later stage is not workstation-blocked", () => {
  const ctx = buildJobExecutionContextFromJob(
    baseJob({
      stages: [
        {
          id: "stage-1",
          title: "Install",
          sortOrder: 0,
          stageId: "org-stage-1",
          issues: [
            {
              id: "issue-1",
              status: JobIssueStatus.OPEN,
              severity: JobIssueSeverity.BLOCKS_WORK,
            },
          ],
          tasks: [baseTask({ id: "task-blocked", sortOrder: 0 })],
        },
        {
          id: "stage-2",
          title: "Finish",
          sortOrder: 1,
          stageId: "org-stage-2",
          issues: [],
          tasks: [baseTask({ id: "task-ready", sortOrder: 0 })],
        },
      ],
      issues: [
        {
          id: "issue-1",
          title: "Stage 1 hold",
          status: JobIssueStatus.OPEN,
          severity: JobIssueSeverity.BLOCKS_WORK,
          recoveryFlow: null,
        },
      ],
    }),
    [],
  );
  const health = deriveJobExecutionHealth(ctx);
  const coarseBlocked = legacyCoarseJobBlocked(ctx.issues, ctx.effectivelyDuePayments.length);
  assert.equal(coarseBlocked, true);
  assert.equal(health.primaryState, "HEALTHY_ACTIONABLE");
  assert.equal(isJobExecutionBlockedForWorkstation(health), false);
});

test("R11 divergence: full payment block remains workstation-blocked", () => {
  const ctx = buildJobExecutionContextFromJob(
    baseJob({
      stages: [
        {
          id: "stage-1",
          title: "Install",
          sortOrder: 0,
          stageId: "org-stage-1",
          issues: [],
          tasks: [
            baseTask({
              id: "task-1",
              requiresSignals: ["deposit-cleared"],
            }),
          ],
        },
      ],
      paymentRequirements: [
        {
          id: "pay-1",
          title: "Deposit",
          status: JobPaymentRequirementStatus.DUE,
          requiredBeforeStageId: "stage-1",
          sourcePaymentScheduleItemId: null,
        },
      ],
    }),
    [],
  );
  const health = deriveJobExecutionHealth(ctx);
  const coarseBlocked = legacyCoarseJobBlocked(ctx.issues, ctx.effectivelyDuePayments.length);
  assert.equal(coarseBlocked, true);
  assert.equal(health.primaryState, "BLOCKED_BY_PAYMENT");
  assert.equal(isJobExecutionBlockedForWorkstation(health), true);
});
