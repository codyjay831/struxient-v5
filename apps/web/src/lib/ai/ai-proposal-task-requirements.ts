import type { AILibraryProposedTask } from "./library-proposal-schema";
import type { TaskCompletionRequirements } from "@/lib/task-readiness";

export function buildTaskCompletionRequirementsFromAiTask(
  task: Pick<
    AILibraryProposedTask,
    "noteRequired" | "photoRequired" | "attachmentRequired" | "checklist"
  >,
  makeId: () => string = () => crypto.randomUUID(),
): TaskCompletionRequirements {
  return {
    noteRequired: Boolean(task.noteRequired),
    photoRequired: Boolean(task.photoRequired),
    attachmentRequired: Boolean(task.attachmentRequired),
    checklist: task.checklist.map((item) => ({
      id: makeId(),
      label: item.label,
    })),
  };
}
