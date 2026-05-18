import assert from "node:assert/strict";
import { test } from "node:test";
import { TaskTemplateCategory } from "@prisma/client";
import {
  AI_INVALID_EXECUTION_PLAN_MESSAGE,
  buildSimulatedGenerationMeta,
  buildValidGenerationMeta,
  canApplySimulatedExecutionPlans,
  isSimulatedExecutionProposal,
  resolveGenerationMetaForApply,
} from "./ai-execution-plan-generation";
import { validateLibraryDefaultExecutionProposalForApply } from "./library-ai-execution-plan";
import { AILibraryProposedTaskSchema, type AILibraryProposal } from "./library-proposal-schema";
import {
  AiExecutionPlanInvalidError,
  AI_TEMPORARILY_UNAVAILABLE_MESSAGE,
  getAiActionErrorMessage,
  isAiProviderTemporarilyUnavailable,
} from "./ai-provider-errors";

function baseProposal(tasks: AILibraryProposal["tasks"]): AILibraryProposal {
  return {
    templateId: "t1",
    sourceContext: "Roof tear-off",
    assumptions: [],
    warnings: [],
    tasks,
  };
}

const validTask = {
  tempId: "task-1",
  title: "Install flashing",
  category: TaskTemplateCategory.GENERAL,
  stageName: "Site Prep",
  stageId: "s1",
  providesSignals: [],
  requiresSignals: [],
  hardSignal: false,
  checklist: [{ label: "Verify layout" }],
  resources: [{ name: "Flashing roll", quantity: 1, isEquipment: false }],
  confidence: 1,
};

test("invalid task field fails task schema validation", () => {
  const parsed = AILibraryProposedTaskSchema.safeParse({
    ...validTask,
    title: "",
  });
  assert.equal(parsed.success, false);
});

test("validateLibraryDefaultExecutionProposalForApply passes for valid mapped tasks", () => {
  const result = validateLibraryDefaultExecutionProposalForApply(
    baseProposal([validTask]),
    buildValidGenerationMeta(),
  );
  assert.equal(result.ok, true);
});

test("validateLibraryDefaultExecutionProposalForApply blocks unmapped stages", () => {
  const result = validateLibraryDefaultExecutionProposalForApply(
    baseProposal([{ ...validTask, stageId: null }]),
    buildValidGenerationMeta(),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.unmappedTaskTitles, ["Install flashing"]);
  }
});

test("simulated execution proposal is not applyable without dev apply flag", () => {
  const previous = process.env.AI_ALLOW_APPLY_SIMULATED_EXECUTION_PLANS;
  delete process.env.AI_ALLOW_APPLY_SIMULATED_EXECUTION_PLANS;

  const proposal = baseProposal([validTask]);
  proposal.assumptions = ["Simulated: Assumed standard residential safety protocols apply."];

  assert.equal(isSimulatedExecutionProposal(proposal), true);
  const result = validateLibraryDefaultExecutionProposalForApply(
    proposal,
    buildSimulatedGenerationMeta(),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /demo ai output/i);
  }

  if (previous !== undefined) {
    process.env.AI_ALLOW_APPLY_SIMULATED_EXECUTION_PLANS = previous;
  }
});

test("simulated execution proposal can apply when dev apply flag enabled", () => {
  const previous = process.env.AI_ALLOW_APPLY_SIMULATED_EXECUTION_PLANS;
  process.env.AI_ALLOW_APPLY_SIMULATED_EXECUTION_PLANS = "1";

  const proposal = baseProposal([validTask]);
  proposal.assumptions = ["Simulated: Assumed standard residential safety protocols apply."];

  const meta = resolveGenerationMetaForApply(proposal, buildSimulatedGenerationMeta());
  assert.equal(meta.canApply, true);
  assert.equal(canApplySimulatedExecutionPlans(), true);

  const result = validateLibraryDefaultExecutionProposalForApply(proposal, meta);
  assert.equal(result.ok, true);

  if (previous !== undefined) {
    process.env.AI_ALLOW_APPLY_SIMULATED_EXECUTION_PLANS = previous;
  } else {
    delete process.env.AI_ALLOW_APPLY_SIMULATED_EXECUTION_PLANS;
  }
});

test("getAiActionErrorMessage returns invalid plan copy", () => {
  const message = getAiActionErrorMessage(new AiExecutionPlanInvalidError());
  assert.equal(message, AI_INVALID_EXECUTION_PLAN_MESSAGE);
});

test("provider 503 maps to clean unavailable message", () => {
  const err = Object.assign(new Error("upstream failure"), { status: 503 });
  assert.equal(isAiProviderTemporarilyUnavailable(err), true);
  assert.equal(getAiActionErrorMessage(err), AI_TEMPORARILY_UNAVAILABLE_MESSAGE);
});
