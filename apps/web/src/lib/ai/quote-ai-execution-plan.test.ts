import assert from "node:assert/strict";
import test from "node:test";
import { TaskTemplateCategory } from "@prisma/client";
import { QuoteStatus } from "@prisma/client";
import { evaluateQuoteJobActivationReadiness } from "../quote-job-activation-readiness";
import { validateQuoteAiExecutionPlanForPersist } from "./quote-ai-execution-plan";
import type { AILibraryProposal } from "./library-proposal-schema";

const stages = [
  { id: "s1", name: "Site Prep" },
  { id: "s2", name: "Rough-In" },
];

function proposal(tasks: AILibraryProposal["tasks"]): AILibraryProposal {
  return {
    templateId: "compat",
    sourceContext: "Test",
    assumptions: [],
    warnings: [],
    tasks,
  };
}

const mappedTask = {
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

test("validateQuoteAiExecutionPlanForPersist passes when all tasks mapped", () => {
  const result = validateQuoteAiExecutionPlanForPersist(proposal([mappedTask]), stages);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.warnings.length, 0);
  }
});

test("validateQuoteAiExecutionPlanForPersist blocks unmapped tasks", () => {
  const result = validateQuoteAiExecutionPlanForPersist(
    proposal([{ ...mappedTask, stageId: null }]),
    stages,
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.unmappedTaskTitles, ["Install flashing"]);
  }
});

test("validateQuoteAiExecutionPlanForPersist blocks when org has no stages", () => {
  const result = validateQuoteAiExecutionPlanForPersist(proposal([mappedTask]), []);
  assert.equal(result.ok, false);
});

test("mapped AI quote tasks satisfy activation readiness", () => {
  const validation = validateQuoteAiExecutionPlanForPersist(proposal([mappedTask]), stages);
  assert.equal(validation.ok, true);

  const readiness = evaluateQuoteJobActivationReadiness({
    status: QuoteStatus.APPROVED,
    lines: [
      {
        id: "line-1",
        description: "Roof",
        tasks: [
          {
            id: "task-1",
            title: mappedTask.title,
            stageId: mappedTask.stageId!,
            providesSignals: [],
            requiresSignals: [],
            hardSignal: false,
          },
        ],
      },
    ],
  });

  assert.equal(readiness.ready, true);
  assert.equal(
    readiness.blockReasons.some((r) => r.code === "TASK_MISSING_STAGE"),
    false,
  );
});
