import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertCanAddOrdinaryJobTaskToStage,
  computeNextTaskSortOrder,
  normalizeJobTaskInstructions,
  normalizeJobTaskTitle,
  validateAddJobTaskInput,
} from "./job-task-add-guard";
import { CORRECTIONS_STAGE_NAME } from "./job-payment-readiness";

const baseContext = {
  jobId: "job-1",
  jobStageId: "stage-1",
  stageTitle: "Pre-Construction",
  stageBelongsToJob: true,
  jobIsActive: true,
};

test("normalizeJobTaskTitle trims whitespace", () => {
  assert.equal(normalizeJobTaskTitle("  Pick up permits  "), "Pick up permits");
});

test("normalizeJobTaskInstructions returns null for empty", () => {
  assert.equal(normalizeJobTaskInstructions("   "), null);
  assert.equal(normalizeJobTaskInstructions(undefined), null);
});

test("computeNextTaskSortOrder appends after max", () => {
  assert.equal(computeNextTaskSortOrder(null), 0);
  assert.equal(computeNextTaskSortOrder(0), 1);
  assert.equal(computeNextTaskSortOrder(40), 41);
});

test("assertCanAddOrdinaryJobTaskToStage rejects corrections stage", () => {
  const result = assertCanAddOrdinaryJobTaskToStage({
    ...baseContext,
    stageTitle: CORRECTIONS_STAGE_NAME,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /Recovery/i);
  }
});

test("assertCanAddOrdinaryJobTaskToStage rejects archived jobs", () => {
  const result = assertCanAddOrdinaryJobTaskToStage({
    ...baseContext,
    jobIsActive: false,
  });
  assert.equal(result.ok, false);
});

test("validateAddJobTaskInput requires title", () => {
  const result = validateAddJobTaskInput(
    { jobId: "job-1", jobStageId: "stage-1", title: "   " },
    baseContext,
  );
  assert.equal(result.ok, false);
});

test("validateAddJobTaskInput accepts valid ordinary task", () => {
  const result = validateAddJobTaskInput(
    {
      jobId: "job-1",
      jobStageId: "stage-1",
      title: "Site walk",
      instructions: " Confirm access gate code.",
    },
    baseContext,
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.title, "Site walk");
    assert.equal(result.instructions, "Confirm access gate code.");
  }
});
