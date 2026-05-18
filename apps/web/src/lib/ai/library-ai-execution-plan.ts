import type { AILibraryProposal } from "./library-proposal-schema";
import {
  canApplySimulatedExecutionPlans,
  isSimulatedExecutionProposal,
  resolveGenerationMetaForApply,
  type AILibraryProposalGenerationMeta,
} from "./ai-execution-plan-generation";
import { 
  isTaskOnCorrectionsStage, 
  CORRECTIONS_CONDITIONAL_WORK_WARNING 
} from "./ai-execution-plan-corrections";
import type { AllowedStage } from "./map-ai-stage";

export type LibraryApplyValidationResult =
  | { ok: true }
  | { ok: false; error: string; unmappedTaskTitles: string[] };

export function validateLibraryDefaultExecutionProposalForApply(
  proposal: AILibraryProposal,
  generation?: AILibraryProposalGenerationMeta,
  allowedStages: AllowedStage[] = [],
): LibraryApplyValidationResult {
  const meta = resolveGenerationMetaForApply(proposal, generation);

  if (meta.isSimulated && !canApplySimulatedExecutionPlans()) {
    return {
      ok: false,
      error:
        meta.applyBlockedReason ??
        "This is demo AI output and cannot be applied in this environment.",
      unmappedTaskTitles: [],
    };
  }

  if (!meta.canApply) {
    return {
      ok: false,
      error:
        meta.applyBlockedReason ??
        "This AI execution plan cannot be applied. Generate a new plan and try again.",
      unmappedTaskTitles: [],
    };
  }

  if (isSimulatedExecutionProposal(proposal) && !canApplySimulatedExecutionPlans()) {
    return {
      ok: false,
      error: "Demo AI execution output cannot be applied.",
      unmappedTaskTitles: [],
    };
  }

  // Block Corrections-stage tasks from being applied as normal execution tasks
  const correctionsTaskTitles = proposal.tasks
    .filter((t) => isTaskOnCorrectionsStage(t, allowedStages))
    .map((t) => t.title);

  if (correctionsTaskTitles.length > 0) {
    return {
      ok: false,
      error: CORRECTIONS_CONDITIONAL_WORK_WARNING,
      unmappedTaskTitles: correctionsTaskTitles,
    };
  }

  const unmappedTaskTitles = proposal.tasks.filter((t) => !t.stageId).map((t) => t.title);
  if (unmappedTaskTitles.length === 0) {
    return { ok: true };
  }
  return {
    ok: false,
    error:
      "Every default execution task must have a stage before applying—assign a stage for each task in the review panel.",
    unmappedTaskTitles,
  };
}
