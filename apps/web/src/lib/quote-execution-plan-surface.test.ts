import assert from "node:assert/strict";
import test from "node:test";
import { QuoteStatus, TaskTemplateCategory } from "@prisma/client";
import {
  buildQuoteActivationLinesFromPlan,
  buildQuoteExecutionReviewModelInputFromPlan,
  buildQuotePlanTasksByLineId,
  hasQuoteWidePlanTasks,
} from "./quote-execution-plan-surface";

const lines = [
  { id: "line-a", description: "Line A", sortOrder: 0, executionRelevant: true },
  { id: "line-b", description: "Line B", sortOrder: 1, executionRelevant: true },
];

const sharedTask = {
  id: "task-shared",
  title: "Shared install",
  stageId: "stage-1",
  stageName: "Installation",
  category: TaskTemplateCategory.GENERAL,
  sortOrder: 0,
  providesSignals: ["install-done"],
  requiresSignals: [],
  hardSignal: false,
  scopeLineIds: ["line-a", "line-b"],
};

const lineATask = {
  id: "task-a",
  title: "Measure",
  stageId: "stage-0",
  stageName: "Pre-Construction",
  category: TaskTemplateCategory.GENERAL,
  sortOrder: 0,
  providesSignals: ["measured"],
  requiresSignals: [],
  hardSignal: false,
  scopeLineIds: ["line-a"],
};

test("hasQuoteWidePlanTasks is false when plan has no tasks", () => {
  assert.equal(hasQuoteWidePlanTasks([]), false);
});

test("buildQuotePlanTasksByLineId maps shared tasks to each scoped line", () => {
  const byLine = buildQuotePlanTasksByLineId(lines, [lineATask, sharedTask]);
  assert.equal(byLine["line-a"]?.length, 2);
  assert.equal(byLine["line-b"]?.length, 1);
  assert.equal(byLine["line-b"]?.[0]?.id, "task-shared");
});

test("buildQuoteActivationLinesFromPlan does not include draft-only tasks", () => {
  const activationLines = buildQuoteActivationLinesFromPlan(lines, [lineATask]);
  assert.equal(activationLines.find((l) => l.id === "line-b")?.tasks.length, 0);
  assert.equal(activationLines.find((l) => l.id === "line-a")?.tasks[0]?.id, "task-a");
});

test("buildQuoteActivationReadinessInput ignores line draft tasks when plan is empty", async () => {
  const { buildQuoteActivationReadinessInput } = await import("./quote-execution-plan-surface");
  const { evaluateQuoteJobActivationReadiness } = await import("./quote-job-activation-readiness");
  const { QuoteStatus } = await import("@prisma/client");

  const readiness = evaluateQuoteJobActivationReadiness(
    buildQuoteActivationReadinessInput({
      status: QuoteStatus.APPROVED,
      hasApprovalCheckpoint: true,
      executionPlan: null,
      currentPlanningInputHash: null,
      lines: [{ id: "line-1", description: "Windows", sortOrder: 0, executionRelevant: true }],
      planTasks: [],
      quoteTotalCents: 100_00,
      paymentSchedule: [],
    }),
  );

  assert.equal(readiness.ready, false);
  assert.ok(readiness.blockReasons.some((r) => r.code === "NO_EXECUTION_TASKS"));
});

test("buildQuoteExecutionReviewModelInputFromPlan uses plan task ids only", () => {
  const modelInput = buildQuoteExecutionReviewModelInputFromPlan(
    { id: "quote-1", title: "Test", status: QuoteStatus.APPROVED },
    lines,
    [lineATask],
  );
  assert.equal(modelInput.lines.find((l) => l.id === "line-a")?.tasks[0]?.id, "task-a");
  assert.equal(modelInput.lines.find((l) => l.id === "line-b")?.tasks.length, 0);
});
