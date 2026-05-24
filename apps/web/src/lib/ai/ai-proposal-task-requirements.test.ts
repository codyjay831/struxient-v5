import assert from "node:assert/strict";
import test from "node:test";
import { TaskTemplateCategory } from "@prisma/client";
import type { AILibraryProposedTask } from "./library-proposal-schema";
import { buildTaskCompletionRequirementsFromAiTask } from "./ai-proposal-task-requirements";

const baseTask: AILibraryProposedTask = {
  tempId: "task-1",
  sourceTaskTemplateId: null,
  title: "Attend Final Inspection",
  category: TaskTemplateCategory.INSPECTION,
  instructions: null,
  stageName: "Inspection",
  stageKey: null,
  stageId: "stage-1",
  stageIntent: null,
  stageMappingWarning: null,
  providesSignals: [],
  requiresSignals: [],
  hardSignal: false,
  noteRequired: true,
  photoRequired: true,
  attachmentRequired: true,
  checklist: [{ label: "Record pass/fail result" }, { label: "Upload inspection document" }],
  resources: [],
  confidence: 1,
};

test("library apply requirements preserve note/photo/attachment/checklist flags", () => {
  let id = 0;
  const requirements = buildTaskCompletionRequirementsFromAiTask(baseTask, () => `cid-${++id}`);
  assert.equal(requirements.noteRequired, true);
  assert.equal(requirements.photoRequired, true);
  assert.equal(requirements.attachmentRequired, true);
  assert.equal(requirements.checklist?.length, 2);
  assert.equal(requirements.checklist?.[0].id, "cid-1");
});

test("quote apply requirements preserve proof flags and checklist", () => {
  const requirements = buildTaskCompletionRequirementsFromAiTask({
    ...baseTask,
    checklist: [{ label: "Capture before photo" }],
  }, () => "check-1");

  assert.equal(requirements.photoRequired, true);
  assert.equal(requirements.attachmentRequired, true);
  assert.equal(requirements.noteRequired, true);
  assert.deepEqual(requirements.checklist, [{ id: "check-1", label: "Capture before photo" }]);
});
