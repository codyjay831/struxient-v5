import type { AILibraryProposalGenerationMeta } from "./ai-execution-plan-generation";
import {
  canApplySimulatedExecutionPlans,
  resolveGenerationMetaForApply,
} from "./ai-execution-plan-generation";
import type { QuoteExecutionReviewProposal } from "./quote-execution-review-proposal-schema";

type AllowedStage = { id: string; name: string };

export type QuoteExecutionReviewValidationResult =
  | {
      ok: true;
      warnings: string[];
      selectedOperationIds: string[];
    }
  | {
      ok: false;
      error: string;
      invalidOperationIds: string[];
    };

function collectSelectedOperationIds(
  proposal: QuoteExecutionReviewProposal,
  selectedOperationIds?: string[],
): string[] {
  if (!selectedOperationIds || selectedOperationIds.length === 0) {
    return proposal.operations.map((op) => op.opId);
  }
  return [...new Set(selectedOperationIds.map((value) => value.trim()).filter(Boolean))];
}

export function validateQuoteExecutionReviewProposalForApply(params: {
  proposal: QuoteExecutionReviewProposal;
  allowedStages: AllowedStage[];
  validLineItemIds: Set<string>;
  validTaskIds: Set<string>;
  selectedOperationIds?: string[];
  generation?: AILibraryProposalGenerationMeta;
}): QuoteExecutionReviewValidationResult {
  const {
    proposal,
    allowedStages,
    validLineItemIds,
    validTaskIds,
    generation,
    selectedOperationIds,
  } = params;

  const meta = resolveGenerationMetaForApply(
    {
      templateId: proposal.quoteId,
      sourceContext: proposal.summary,
      assumptions: proposal.assumptions,
      warnings: proposal.warnings,
      cleanupNotes: [],
      missingContext: proposal.missingContext,
      tasks: [],
    },
    generation,
  );

  if (meta.isSimulated && !canApplySimulatedExecutionPlans()) {
    return {
      ok: false,
      error:
        meta.applyBlockedReason ??
        "This is demo AI output and cannot be applied in this environment.",
      invalidOperationIds: [],
    };
  }

  if (!meta.canApply) {
    return {
      ok: false,
      error:
        meta.applyBlockedReason ??
        "This AI execution review cannot be applied. Generate a new review and try again.",
      invalidOperationIds: [],
    };
  }

  const stageIds = new Set(allowedStages.map((stage) => stage.id));
  const selected = collectSelectedOperationIds(proposal, selectedOperationIds);
  const selectableIds = new Set(proposal.operations.map((op) => op.opId));

  const unknownSelection = selected.filter((opId) => !selectableIds.has(opId));
  if (unknownSelection.length > 0) {
    return {
      ok: false,
      error: "One or more selected AI changes are no longer available. Run review again.",
      invalidOperationIds: unknownSelection,
    };
  }

  const invalidOperationIds: string[] = [];
  const warnings: string[] = [];

  for (const opId of selected) {
    const operation = proposal.operations.find((entry) => entry.opId === opId);
    if (!operation) {
      invalidOperationIds.push(opId);
      continue;
    }

    if (operation.type === "add_task") {
      if (!validLineItemIds.has(operation.lineItemId)) {
        invalidOperationIds.push(opId);
        continue;
      }
      if (!stageIds.has(operation.task.stageId)) {
        invalidOperationIds.push(opId);
        continue;
      }
      if (
        operation.task.providesSignals.length === 0 &&
        operation.task.requiresSignals.length === 0
      ) {
        warnings.push(
          `AI task "${operation.task.title}" has no signals. Review whether this is intentional.`,
        );
      }
      continue;
    }

    if (!validTaskIds.has(operation.taskId)) {
      invalidOperationIds.push(opId);
      continue;
    }
    if (
      operation.addProvides.length === 0 &&
      operation.removeProvides.length === 0 &&
      operation.addRequires.length === 0 &&
      operation.removeRequires.length === 0
    ) {
      warnings.push("One selected signal patch has no net changes and will be ignored.");
    }
  }

  if (invalidOperationIds.length > 0) {
    return {
      ok: false,
      error: "One or more AI changes are no longer valid for this quote.",
      invalidOperationIds: [...new Set(invalidOperationIds)],
    };
  }

  return {
    ok: true,
    warnings: [...new Set(warnings)],
    selectedOperationIds: selected,
  };
}
