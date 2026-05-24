import assert from "node:assert/strict";
import test from "node:test";
import { TaskTemplateCategory } from "@prisma/client";
import { validateLibraryDefaultExecutionProposalForApply } from "./library-ai-execution-plan";
import { CORRECTIONS_STAGE_NAME } from "@/lib/job-payment-readiness";

const task = {
  tempId: "t1",
  title: "Install flashing",
  category: TaskTemplateCategory.GENERAL,
  stageName: "Rough-In",
  stageId: "s2",
  providesSignals: [],
  requiresSignals: [],
  hardSignal: false,
  checklist: [],
  resources: [],
  confidence: 1,
};

const stages = [
  { id: "s1", name: "Site Prep" },
  { id: "s2", name: "Rough-In" },
  { id: "s3", name: CORRECTIONS_STAGE_NAME },
];

test("validateLibraryDefaultExecutionProposalForApply passes when staged", () => {
  const result = validateLibraryDefaultExecutionProposalForApply({
    templateId: "x",
    sourceContext: "Test",
    assumptions: [],
    warnings: [],
    cleanupNotes: [],
    missingContext: [],
    tasks: [task],
  });
  assert.equal(result.ok, true);
});

test("validateLibraryDefaultExecutionProposalForApply blocks unstaged tasks", () => {
  const result = validateLibraryDefaultExecutionProposalForApply({
    templateId: "x",
    sourceContext: "Test",
    assumptions: [],
    warnings: [],
    cleanupNotes: [],
    missingContext: [],
    tasks: [{ ...task, stageId: null }],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.unmappedTaskTitles, ["Install flashing"]);
  }
});

test("validateLibraryDefaultExecutionProposalForApply blocks Corrections-stage tasks", () => {
  const result = validateLibraryDefaultExecutionProposalForApply(
    {
      templateId: "x",
      sourceContext: "Test",
      assumptions: [],
      warnings: [],
      cleanupNotes: [],
      missingContext: [],
      tasks: [{ ...task, stageId: "s3", stageName: CORRECTIONS_STAGE_NAME }],
    },
    undefined,
    stages
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.error.includes("Correction work is created later"));
    assert.deepEqual(result.unmappedTaskTitles, ["Install flashing"]);
  }
});

test("validateLibraryDefaultExecutionProposalForApply blocks stale stage ids", () => {
  const result = validateLibraryDefaultExecutionProposalForApply(
    {
      templateId: "x",
      sourceContext: "Test",
      assumptions: [],
      warnings: [],
      cleanupNotes: ["Merged duplicate closeout tasks."],
      missingContext: ["Service size missing."],
      tasks: [{ ...task, stageId: "stale-stage-id" }],
    },
    undefined,
    stages,
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.unmappedTaskTitles, ["Install flashing"]);
  }
});

test("cleanupNotes and missingContext do not block valid library apply", () => {
  const result = validateLibraryDefaultExecutionProposalForApply(
    {
      templateId: "x",
      sourceContext: "Test",
      assumptions: [],
      warnings: [],
      cleanupNotes: ["Merged duplicate closeout tasks."],
      missingContext: ["Need utility provider policy."],
      tasks: [task],
    },
    undefined,
    stages,
  );
  assert.equal(result.ok, true);
});
