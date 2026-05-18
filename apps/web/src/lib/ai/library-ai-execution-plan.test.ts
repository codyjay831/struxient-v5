import assert from "node:assert/strict";
import test from "node:test";
import { TaskTemplateCategory } from "@prisma/client";
import { validateLibraryDefaultExecutionProposalForApply } from "./library-ai-execution-plan";
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

test("validateLibraryDefaultExecutionProposalForApply passes when staged", () => {
  const result = validateLibraryDefaultExecutionProposalForApply({
    templateId: "x",
    sourceContext: "Test",
    assumptions: [],
    warnings: [],
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
    tasks: [{ ...task, stageId: null }],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.unmappedTaskTitles, ["Install flashing"]);
  }
});
