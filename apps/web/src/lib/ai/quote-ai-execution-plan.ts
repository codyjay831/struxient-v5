import type { AILibraryProposal } from "./library-proposal-schema";
import type { AllowedStage } from "./map-ai-stage";

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

  const unmappedTaskTitles: string[] = [];
  const warnings: string[] = [];

  for (const task of proposal.tasks) {
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
