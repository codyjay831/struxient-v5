export function resolveQuoteLineAiReplaceDeleteIds(
  existingTaskIds: readonly string[],
  keepTaskIds: readonly string[],
): { deleteTaskIds: string[]; normalizedKeepTaskIds: string[] } {
  const existing = new Set(existingTaskIds);
  const normalizedKeepTaskIds = [...new Set(keepTaskIds)];
  const invalidKeepId = normalizedKeepTaskIds.find((id) => !existing.has(id));
  if (invalidKeepId) {
    throw new Error("INVALID_KEEP_TASKS");
  }

  if (normalizedKeepTaskIds.length === 0) {
    return {
      deleteTaskIds: [...existingTaskIds],
      normalizedKeepTaskIds,
    };
  }

  return {
    deleteTaskIds: existingTaskIds.filter((id) => !normalizedKeepTaskIds.includes(id)),
    normalizedKeepTaskIds,
  };
}

