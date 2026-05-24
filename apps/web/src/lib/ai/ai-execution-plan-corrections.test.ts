import assert from "node:assert/strict";
import test from "node:test";
import { TaskTemplateCategory } from "@prisma/client";
import { 
  getStagesForAiExecutionPlanning, 
  filterCorrectionsStageTasksFromAiProposal,
  CORRECTIONS_CONDITIONAL_WORK_WARNING 
} from "./ai-execution-plan-corrections";
import { CORRECTIONS_STAGE_NAME } from "@/lib/job-payment-readiness";

const stages = [
  { id: "s1", name: "Site Prep" },
  { id: "s2", name: "Rough-In" },
  { id: "s3", name: CORRECTIONS_STAGE_NAME },
];

const task = {
  tempId: "t1",
  title: "Normal Task",
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

test("getStagesForAiExecutionPlanning omits Corrections stage", () => {
  const filtered = getStagesForAiExecutionPlanning(stages);
  assert.equal(filtered.length, 2);
  assert.equal(filtered.some(s => s.name === CORRECTIONS_STAGE_NAME), false);
});

test("filterCorrectionsStageTasksFromAiProposal removes tasks on Corrections stage by ID", () => {
  const proposal = {
    templateId: "tpl",
    sourceContext: "test",
    assumptions: [],
    warnings: [],
    cleanupNotes: [],
    missingContext: [],
    tasks: [
      { ...task, title: "Keep Me" },
      { ...task, title: "Remove Me", stageId: "s3", stageName: CORRECTIONS_STAGE_NAME },
    ],
  };

  const { proposal: filtered, removedTaskTitles } = filterCorrectionsStageTasksFromAiProposal(proposal, stages);
  
  assert.equal(filtered.tasks.length, 1);
  assert.equal(filtered.tasks[0].title, "Keep Me");
  assert.deepEqual(removedTaskTitles, ["Remove Me"]);
  assert.ok(filtered.warnings.includes(CORRECTIONS_CONDITIONAL_WORK_WARNING));
});

test("filterCorrectionsStageTasksFromAiProposal removes tasks on Corrections stage by name", () => {
  const proposal = {
    templateId: "tpl",
    sourceContext: "test",
    assumptions: [],
    warnings: [],
    cleanupNotes: [],
    missingContext: [],
    tasks: [
      { ...task, title: "Keep Me" },
      { ...task, title: "Remove Me", stageId: null, stageName: "Corrections" },
    ],
  };

  const { proposal: filtered, removedTaskTitles } = filterCorrectionsStageTasksFromAiProposal(proposal, stages);
  
  assert.equal(filtered.tasks.length, 1);
  assert.equal(filtered.tasks[0].title, "Keep Me");
  assert.deepEqual(removedTaskTitles, ["Remove Me"]);
  assert.ok(filtered.warnings.includes(CORRECTIONS_CONDITIONAL_WORK_WARNING));
});

test("filterCorrectionsStageTasksFromAiProposal does nothing if no Corrections tasks", () => {
  const proposal = {
    templateId: "tpl",
    sourceContext: "test",
    assumptions: [],
    warnings: ["Existing warning"],
    cleanupNotes: [],
    missingContext: [],
    tasks: [task],
  };

  const { proposal: filtered, removedTaskTitles } = filterCorrectionsStageTasksFromAiProposal(proposal, stages);
  
  assert.equal(filtered.tasks.length, 1);
  assert.deepEqual(removedTaskTitles, []);
  assert.equal(filtered.warnings.length, 1);
  assert.equal(filtered.warnings[0], "Existing warning");
});

test("filterCorrectionsStageTasksFromAiProposal dedupes warning", () => {
  const proposal = {
    templateId: "tpl",
    sourceContext: "test",
    assumptions: [],
    warnings: [CORRECTIONS_CONDITIONAL_WORK_WARNING],
    cleanupNotes: [],
    missingContext: [],
    tasks: [
      { ...task, stageId: "s3" },
    ],
  };

  const { proposal: filtered } = filterCorrectionsStageTasksFromAiProposal(proposal, stages);
  
  const warningCount = filtered.warnings.filter(w => w === CORRECTIONS_CONDITIONAL_WORK_WARNING).length;
  assert.equal(warningCount, 1);
});
