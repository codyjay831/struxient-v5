export type VersioningQuestionShape = {
  key: string;
  inputType: string;
  options: { key: string }[];
};

/**
 * Returns true when question-set edits are structurally breaking and should
 * create a new set version (instead of mutating in place).
 */
export function hasBreakingClarificationChanges(
  previous: VersioningQuestionShape[],
  next: VersioningQuestionShape[],
): boolean {
  if (previous.length !== next.length) return true;
  const previousByKey = new Map(previous.map((q) => [q.key, q]));
  for (const question of next) {
    const existing = previousByKey.get(question.key);
    if (!existing) return true;
    if (existing.inputType !== question.inputType) return true;
    const prevOptions = new Set(existing.options.map((o) => o.key));
    const nextOptions = new Set(question.options.map((o) => o.key));
    if (prevOptions.size !== nextOptions.size) return true;
    for (const key of nextOptions) {
      if (!prevOptions.has(key)) return true;
    }
  }
  return false;
}
