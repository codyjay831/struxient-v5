import assert from "node:assert/strict";
import test from "node:test";
import { TaskTemplateCategory } from "@prisma/client";
import { QuoteStatus } from "@prisma/client";
import { evaluateQuoteJobActivationReadiness } from "../quote-job-activation-readiness";
import { validateQuoteAiExecutionPlanForApply, validateQuoteAiExecutionPlanForPersist } from "./quote-ai-execution-plan";
import type { AILibraryProposal } from "./library-proposal-schema";
import { CORRECTIONS_STAGE_NAME } from "@/lib/job-payment-readiness";
import { CORRECTIONS_CONDITIONAL_WORK_WARNING } from "./ai-execution-plan-corrections";

const stages = [
  { id: "s1", name: "Site Prep" },
  { id: "s2", name: "Rough-In" },
  { id: "s3", name: CORRECTIONS_STAGE_NAME },
];

function proposal(tasks: AILibraryProposal["tasks"], warnings: string[] = []): AILibraryProposal {
  return {
    templateId: "compat",
    sourceContext: "Test",
    assumptions: [],
    warnings,
    cleanupNotes: [],
    missingContext: [],
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

test("validateQuoteAiExecutionPlanForApply blocks when generation.canApply is false", () => {
  const result = validateQuoteAiExecutionPlanForApply(
    proposal([mappedTask]),
    stages,
    {
      canApply: false,
      isSimulated: false,
      applyBlockedReason: "Provider returned invalid output.",
    },
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error, "Provider returned invalid output.");
  }
});

test("validateQuoteAiExecutionPlanForApply blocks empty task list", () => {
  const result = validateQuoteAiExecutionPlanForApply(proposal([]), stages);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /at least one task/i);
  }
});

test("validateQuoteAiExecutionPlanForApply passes when all tasks mapped", () => {
  const result = validateQuoteAiExecutionPlanForApply(proposal([mappedTask]), stages);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.warnings.length, 0);
  }
});

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

test("validateQuoteAiExecutionPlanForPersist blocks Corrections tasks", () => {
  const result = validateQuoteAiExecutionPlanForPersist(
    proposal([{ ...mappedTask, stageId: "s3", stageName: CORRECTIONS_STAGE_NAME }]),
    stages,
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.error.includes("Correction work is created later"));
    assert.deepEqual(result.unmappedTaskTitles, ["Install flashing"]);
  }
});

test("validateQuoteAiExecutionPlanForPersist surfaces Corrections warning from generation", () => {
  const result = validateQuoteAiExecutionPlanForPersist(
    proposal([mappedTask], [CORRECTIONS_CONDITIONAL_WORK_WARNING]),
    stages,
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(result.warnings.includes(CORRECTIONS_CONDITIONAL_WORK_WARNING));
  }
});

test("validateQuoteAiExecutionPlanForPersist blocks when org has no stages", () => {
  const result = validateQuoteAiExecutionPlanForPersist(proposal([mappedTask]), []);
  assert.equal(result.ok, false);
});

test("validateQuoteAiExecutionPlanForPersist blocks simulated proposals without dev apply flag", () => {
  const previous = process.env.AI_ALLOW_APPLY_SIMULATED_EXECUTION_PLANS;
  delete process.env.AI_ALLOW_APPLY_SIMULATED_EXECUTION_PLANS;

  const simulated = proposal([mappedTask]);
  simulated.assumptions = ["Simulated: Assumed standard residential safety protocols apply."];

  const result = validateQuoteAiExecutionPlanForPersist(simulated, stages);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /demo ai output/i);
  }

  if (previous !== undefined) {
    process.env.AI_ALLOW_APPLY_SIMULATED_EXECUTION_PLANS = previous;
  }
});

test("mapped AI quote tasks satisfy activation readiness", () => {
  const validation = validateQuoteAiExecutionPlanForPersist(proposal([mappedTask]), stages);
  assert.equal(validation.ok, true);

  const readiness = evaluateQuoteJobActivationReadiness({
    status: QuoteStatus.APPROVED,
    hasApprovalCheckpoint: true,
    quoteTotalCents: 0,
    paymentSchedule: [],
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

test("validateQuoteAiExecutionPlanForApply blocks stale stage ids", () => {
  const result = validateQuoteAiExecutionPlanForApply(
    proposal([{ ...mappedTask, stageId: "stale-stage-id" }]),
    stages,
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.unmappedTaskTitles, ["Install flashing"]);
  }
});

test("missingContext and cleanupNotes do not block valid quote apply", () => {
  const result = validateQuoteAiExecutionPlanForApply(
    {
      ...proposal([mappedTask]),
      cleanupNotes: ["Merged duplicate closeout tasks."],
      missingContext: ["Need service size confirmation."],
    },
    stages,
  );
  assert.equal(result.ok, true);
});
