import type { AILibraryProposal } from "./library-proposal-schema";
import type { AllowedStage } from "./map-ai-stage";
import {
  canApplySimulatedExecutionPlans,
  isSimulatedExecutionProposal,
} from "./ai-execution-plan-generation";
import {
  isTaskOnCorrectionsStage,
  CORRECTIONS_CONDITIONAL_WORK_WARNING,
} from "./ai-execution-plan-corrections";

export type QuoteAiPlanValidationResult =
  | {
      ok: true;
      warnings: string[];
    }
  | {
      ok: false;
      error: string;
      unmappedTaskTitles: string[];
    };

/**
 * Validates an AI proposal before persisting quote-line execution tasks.
 * Blocks the entire generate when any task lacks a mapped stageId.
 */
export function validateQuoteAiExecutionPlanForPersist(
  proposal: AILibraryProposal,
  allowedStages: AllowedStage[],
): QuoteAiPlanValidationResult {
  if (allowedStages.length === 0) {
    return {
      ok: false,
      error:
        "Add execution stages in Scope Library settings before generating an AI execution plan.",
      unmappedTaskTitles: proposal.tasks.map((t) => t.title),
    };
  }

  if (isSimulatedExecutionProposal(proposal) && !canApplySimulatedExecutionPlans()) {
    return {
      ok: false,
      error: "Demo AI execution output cannot be applied.",
      unmappedTaskTitles: [],
    };
  }

  const unmappedTaskTitles: string[] = [];
  const correctionsTaskTitles: string[] = [];
  const warnings: string[] = [];

  // Carry over Corrections warning if it was already added during generation filtering
  if (proposal.warnings.includes(CORRECTIONS_CONDITIONAL_WORK_WARNING)) {
    warnings.push(CORRECTIONS_CONDITIONAL_WORK_WARNING);
  }

  for (const task of proposal.tasks) {
    if (isTaskOnCorrectionsStage(task, allowedStages)) {
      correctionsTaskTitles.push(task.title);
      continue;
    }

    if (!task.stageId) {
      unmappedTaskTitles.push(task.title);
      continue;
    }
    const stageName = allowedStages.find((s) => s.id === task.stageId)?.name;
    const aiStageName = task.stageName;
    if (
      aiStageName &&
      stageName &&
      aiStageName.trim().toLowerCase() !== stageName.trim().toLowerCase()
    ) {
      const proposalWarnings = proposal.warnings ?? [];
      const aliasWarning = proposalWarnings.find(
        (w) => w.includes(task.title) || w.includes(aiStageName),
      );
      if (aliasWarning) {
        warnings.push(aliasWarning);
      }
    }
  }

  if (correctionsTaskTitles.length > 0) {
    return {
      ok: false,
      error: CORRECTIONS_CONDITIONAL_WORK_WARNING,
      unmappedTaskTitles: correctionsTaskTitles,
    };
  }

  if (unmappedTaskTitles.length > 0) {
    return {
      ok: false,
      error:
        "AI could not assign a stage to every task. Add or rename stages in Scope Library, then try again.",
      unmappedTaskTitles,
    };
  }

  return { ok: true, warnings: [...new Set(warnings)] };
}
