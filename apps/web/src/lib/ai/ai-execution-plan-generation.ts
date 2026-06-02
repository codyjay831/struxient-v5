import type { AILibraryProposal } from "./library-proposal-schema";

/** User-facing copy when structured AI output fails validation. */
export const AI_INVALID_EXECUTION_PLAN_MESSAGE =
  "AI generated an invalid execution plan. Nothing was saved. Try again or adjust the line item description.";

export type AILibraryProposalGenerationMeta = {
  isSimulated: boolean;
  canApply: boolean;
  applyBlockedReason?: string;
};

export type AILibraryProposalGenerationResult = {
  proposal: AILibraryProposal;
  generation: AILibraryProposalGenerationMeta;
};

/** Enables demo/simulated execution plans when the provider is missing or fails. */
export function isAiSimulatedExecutionPlansEnabled(): boolean {
  return process.env.AI_ALLOW_SIMULATED_EXECUTION_PLANS === "1";
}

/** Allows applying demo/simulated execution plans (dev/test only). */
export function canApplySimulatedExecutionPlans(): boolean {
  return process.env.AI_ALLOW_APPLY_SIMULATED_EXECUTION_PLANS === "1";
}

/** Enables preflight context assessment before full execution plan generation. */
export function isAiExecutionContextPreflightEnabled(): boolean {
  return process.env.AI_EXECUTION_CONTEXT_PREFLIGHT === "1";
}

export function buildSimulatedGenerationMeta(): AILibraryProposalGenerationMeta {
  const canApply = canApplySimulatedExecutionPlans();
  return {
    isSimulated: true,
    canApply,
    applyBlockedReason: canApply
      ? undefined
      : "This is demo AI output. Apply is disabled until demo apply is explicitly enabled.",
  };
}

export function buildValidGenerationMeta(): AILibraryProposalGenerationMeta {
  return { isSimulated: false, canApply: true };
}

/** Detects demo fallback output by its stamped assumptions/warnings. */
export function isSimulatedExecutionProposal(proposal: AILibraryProposal): boolean {
  const stampedAssumption = proposal.assumptions.some((a) =>
    /^simulated:/i.test(a.trim()),
  );
  const demoWarning = proposal.warnings.some((w) =>
    /simulated response|demo ai output|gemini_api_key is missing/i.test(w),
  );
  return stampedAssumption || demoWarning;
}

export function resolveGenerationMetaForApply(
  proposal: AILibraryProposal,
  generation?: AILibraryProposalGenerationMeta,
): AILibraryProposalGenerationMeta {
  if (generation) {
    return generation;
  }
  if (isSimulatedExecutionProposal(proposal)) {
    return buildSimulatedGenerationMeta();
  }
  return buildValidGenerationMeta();
}
