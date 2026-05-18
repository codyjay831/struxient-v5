import { CORRECTIONS_STAGE_NAME } from "@/lib/job-payment-readiness";
import { normalizeStageLabel, type AllowedStage } from "./map-ai-stage";
import type { AILibraryProposal, AILibraryProposedTask } from "./library-proposal-schema";

/**
 * Exact warning copy required for Corrections-stage tasks filtered from AI proposals.
 */
export const CORRECTIONS_CONDITIONAL_WORK_WARNING =
  "Correction work is created later from failed inspections, walkthrough findings, punch-list items, or job issues.";

/**
 * Resolves the organization's "Corrections" stage from a list of stages.
 */
export function findCorrectionsStage(stages: AllowedStage[]): AllowedStage | undefined {
  const target = normalizeStageLabel(CORRECTIONS_STAGE_NAME);
  return stages.find((s) => normalizeStageLabel(s.name) === target);
}

/**
 * Returns true if the task is assigned to the Corrections stage (by ID or name).
 */
export function isTaskOnCorrectionsStage(
  task: Pick<AILibraryProposedTask, "stageId" | "stageName">,
  stages: AllowedStage[],
): boolean {
  const correctionsStage = findCorrectionsStage(stages);
  if (correctionsStage && task.stageId === correctionsStage.id) {
    return true;
  }

  if (task.stageName && normalizeStageLabel(task.stageName) === normalizeStageLabel(CORRECTIONS_STAGE_NAME)) {
    return true;
  }

  return false;
}

/**
 * Returns a list of stages suitable for AI execution planning (omits Corrections).
 */
export function getStagesForAiExecutionPlanning(stages: AllowedStage[]): AllowedStage[] {
  const target = normalizeStageLabel(CORRECTIONS_STAGE_NAME);
  return stages.filter((s) => normalizeStageLabel(s.name) !== target);
}

/**
 * Filters out tasks mapped to the Corrections stage from an AI proposal.
 * Appends the required warning if any tasks were removed.
 */
export function filterCorrectionsStageTasksFromAiProposal(
  proposal: AILibraryProposal,
  allStages: AllowedStage[],
): { proposal: AILibraryProposal; removedTaskTitles: string[] } {
  const removedTaskTitles: string[] = [];
  const filteredTasks = proposal.tasks.filter((task) => {
    if (isTaskOnCorrectionsStage(task, allStages)) {
      removedTaskTitles.push(task.title);
      return false;
    }
    return true;
  });

  if (removedTaskTitles.length === 0) {
    return { proposal, removedTaskTitles };
  }

  const warnings = [...proposal.warnings];
  if (!warnings.includes(CORRECTIONS_CONDITIONAL_WORK_WARNING)) {
    warnings.push(CORRECTIONS_CONDITIONAL_WORK_WARNING);
  }

  return {
    proposal: {
      ...proposal,
      warnings,
      tasks: filteredTasks,
    },
    removedTaskTitles,
  };
}
