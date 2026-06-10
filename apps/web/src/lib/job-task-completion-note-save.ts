import { JobTaskStatus } from "@prisma/client";

export function normalizeCompletionNoteDraft(completionNote: string): string | null {
  const trimmed = completionNote.trim();
  return trimmed || null;
}

export type CompletionNoteDraftSaveValidation =
  | { ok: true }
  | { ok: false; error: string };

export function validateCompletionNoteDraftSave(
  task: { status: JobTaskStatus } | null,
): CompletionNoteDraftSaveValidation {
  if (!task) {
    return { ok: false, error: "Task not found in your organization." };
  }

  if (task.status !== JobTaskStatus.TODO) {
    return { ok: false, error: "Cannot save a completion note on a completed task." };
  }

  return { ok: true };
}
