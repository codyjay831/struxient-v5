import type { AILibraryProposal } from "./library-proposal-schema";

export type LibraryApplyValidationResult =
  | { ok: true }
  | { ok: false; error: string; unmappedTaskTitles: string[] };

export function validateLibraryDefaultExecutionProposalForApply(
  proposal: AILibraryProposal,
): LibraryApplyValidationResult {
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
