import assert from "node:assert/strict";
import test from "node:test";
import { TaskTemplateCategory } from "@prisma/client";
import type { AILibraryProposedTask } from "./library-proposal-schema";
import { canonicalizeExecutionTaskTitle, normalizeExecutionProposalTasks } from "./normalize-execution-proposal";

function makeTask(
  overrides: Partial<AILibraryProposedTask> & Pick<AILibraryProposedTask, "title" | "category">,
): AILibraryProposedTask {
  return {
    tempId: crypto.randomUUID(),
    sourceTaskTemplateId: null,
    instructions: null,
    stageName: "Closeout",
    stageId: "stage-closeout",
    stageKey: null,
    stageIntent: null,
    stageMappingWarning: null,
    providesSignals: [],
    requiresSignals: [],
    hardSignal: false,
    checklist: [],
    resources: [],
    confidence: 0.9,
    ...overrides,
    title: overrides.title,
    category: overrides.category,
  };
}

test("canonicalizeExecutionTaskTitle normalizes finalization phrases", () => {
  const normalized = canonicalizeExecutionTaskTitle("Finalize Project Close-Out");
  assert.match(normalized, /closeout/);
  assert.equal(normalized.includes("finalize"), false);
});

test("normalizer consolidates duplicate closeout/finalization tasks", () => {
  const tasks = [
    makeTask({ title: "Finalize Project Closeout", category: TaskTemplateCategory.GENERAL }),
    makeTask({ title: "Project finalization", category: TaskTemplateCategory.GENERAL }),
  ];
  const result = normalizeExecutionProposalTasks(tasks);
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].title, "Final Project Closeout");
  assert.ok(result.cleanupNotes.some((note) => note.includes("Merged")));
});

test("normalizer keeps schedule + attend inspection separate and folds confirm task into checklist", () => {
  const schedule = makeTask({
    title: "Request & Schedule Final Inspection",
    category: TaskTemplateCategory.INSPECTION,
    stageName: "Inspection",
    stageId: "stage-inspection",
  });
  const attend = makeTask({
    title: "Attend Final Inspection",
    category: TaskTemplateCategory.INSPECTION,
    stageName: "Inspection",
    stageId: "stage-inspection",
  });
  const confirm = makeTask({
    title: "Confirm inspection passed",
    category: TaskTemplateCategory.INSPECTION,
    stageName: "Inspection",
    stageId: "stage-inspection",
  });

  const result = normalizeExecutionProposalTasks([schedule, attend, confirm]);
  assert.equal(result.tasks.length, 2);
  const attendAfter = result.tasks.find((task) => task.title === attend.title);
  assert.ok(attendAfter);
  assert.ok(attendAfter.checklist.some((item) => /confirm inspection passed/i.test(item.label)));
  assert.ok(result.cleanupNotes.some((note) => /separate execution tasks/i.test(note)));
});

test("normalizer converts upload/photo proof detail tasks into checklist + proof flags under inspection attend task", () => {
  const attend = makeTask({
    title: "Attend Final Inspection",
    category: TaskTemplateCategory.INSPECTION,
    stageName: "Inspection",
    stageId: "stage-inspection",
  });
  const uploadDoc = makeTask({
    title: "Upload inspection document",
    category: TaskTemplateCategory.INSPECTION,
    stageName: "Inspection",
    stageId: "stage-inspection",
  });
  const capturePhoto = makeTask({
    title: "Capture final inspection photo",
    category: TaskTemplateCategory.INSPECTION,
    stageName: "Inspection",
    stageId: "stage-inspection",
  });

  const result = normalizeExecutionProposalTasks([attend, uploadDoc, capturePhoto]);
  const attendAfter = result.tasks.find((task) => task.title === attend.title);
  assert.ok(attendAfter);
  assert.equal(attendAfter.attachmentRequired, true);
  assert.equal(attendAfter.photoRequired, true);
  assert.ok(attendAfter.checklist.some((item) => /upload inspection document/i.test(item.label)));
  assert.ok(attendAfter.checklist.some((item) => /capture final inspection photo/i.test(item.label)));
});

test("normalizer keeps utility, permit, payment, material, customer access, and safety tasks as tasks", () => {
  const tasks = [
    makeTask({ title: "Schedule utility disconnect", category: TaskTemplateCategory.SCHEDULING }),
    makeTask({ title: "Submit permit application", category: TaskTemplateCategory.PERMIT }),
    makeTask({ title: "Collect final payment", category: TaskTemplateCategory.PAYMENT }),
    makeTask({ title: "Confirm material readiness", category: TaskTemplateCategory.MATERIAL }),
    makeTask({ title: "Coordinate customer access window", category: TaskTemplateCategory.CUSTOMER_COMMUNICATION }),
    makeTask({ title: "Run safety-critical lockout check", category: TaskTemplateCategory.GENERAL }),
  ];
  const result = normalizeExecutionProposalTasks(tasks);
  assert.equal(result.tasks.length, tasks.length);
});
