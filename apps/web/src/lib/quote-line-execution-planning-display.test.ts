import assert from "node:assert/strict";
import test from "node:test";
import { buildQuoteLineExecutionPlanningSummaryLine } from "./quote-line-execution-planning-display";

test("buildQuoteLineExecutionPlanningSummaryLine returns needs review when no tasks", () => {
  const line = buildQuoteLineExecutionPlanningSummaryLine({
    taskCount: 0,
    executionSummaryLine: null,
  });

  assert.equal(line, "Needs job plan review");
});

test("buildQuoteLineExecutionPlanningSummaryLine uses execution summary without duplicating task count", () => {
  const line = buildQuoteLineExecutionPlanningSummaryLine({
    taskCount: 8,
    executionSummaryLine: "8 tasks · 5 stages · 5 categories",
  });

  assert.equal(line, "Planned work · 8 tasks · 5 stages · 5 categories");
});

test("buildQuoteLineExecutionPlanningSummaryLine falls back to task count when summary line missing", () => {
  const line = buildQuoteLineExecutionPlanningSummaryLine({
    taskCount: 3,
    executionSummaryLine: null,
  });

  assert.equal(line, "Planned work · 3 tasks");
});
