import type { AILibraryProposal } from "./library-proposal-schema";
import { StaffRole } from "@prisma/client";
import type { AllowedStage } from "./map-ai-stage";
import {
  canApplySimulatedExecutionPlans,
  isSimulatedExecutionProposal,
  resolveGenerationMetaForApply,
  type AILibraryProposalGenerationMeta,
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
 * Validates an AI proposal before persisting quote-line execution tasks (apply boundary).
 */
export function validateQuoteAiExecutionPlanForApply(
  proposal: AILibraryProposal,
  allowedStages: AllowedStage[],
  generation?: AILibraryProposalGenerationMeta,
): QuoteAiPlanValidationResult {
  if (allowedStages.length === 0) {
    return {
      ok: false,
      error:
        "Add execution stages in Scope Library settings before applying an AI execution plan.",
      unmappedTaskTitles: proposal.tasks.map((t) => t.title),
    };
  }

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

  if (proposal.tasks.length === 0) {
    return {
      ok: false,
      error: "Add at least one task before applying.",
      unmappedTaskTitles: [],
    };
  }

  const unmappedTaskTitles: string[] = [];
  const correctionsTaskTitles: string[] = [];
  const invalidRoleTaskTitles: string[] = [];
  const warnings: string[] = [];
  const validStageIds = new Set(allowedStages.map((stage) => stage.id));
  const validRoles = new Set(Object.values(StaffRole));

  if (proposal.warnings.includes(CORRECTIONS_CONDITIONAL_WORK_WARNING)) {
    warnings.push(CORRECTIONS_CONDITIONAL_WORK_WARNING);
  }

  for (const task of proposal.tasks) {
    if (isTaskOnCorrectionsStage(task, allowedStages)) {
      correctionsTaskTitles.push(task.title);
      continue;
    }

    if (!task.stageId || !validStageIds.has(task.stageId)) {
      unmappedTaskTitles.push(task.title);
      continue;
    }
    if (task.assigneeRole && !validRoles.has(task.assigneeRole)) {
      invalidRoleTaskTitles.push(task.title);
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
        "Every execution task must have a stage before applying—assign a stage for each task in the review panel.",
      unmappedTaskTitles,
    };
  }

  if (invalidRoleTaskTitles.length > 0) {
    return {
      ok: false,
      error:
        "One or more execution tasks include an invalid assignee role. Update the proposal and try again.",
      unmappedTaskTitles: invalidRoleTaskTitles,
    };
  }

  return { ok: true, warnings: [...new Set(warnings)] };
}

/** @deprecated Use validateQuoteAiExecutionPlanForApply at the apply boundary. */
export function validateQuoteAiExecutionPlanForPersist(
  proposal: AILibraryProposal,
  allowedStages: AllowedStage[],
): QuoteAiPlanValidationResult {
  return validateQuoteAiExecutionPlanForApply(proposal, allowedStages);
}
