import type { ExecutionStageKey, TaskTemplateCategory } from "@prisma/client";
import { EXECUTION_STAGE_KEYS_ORDERED, getExecutionStageLabel } from "@/lib/execution-stage-catalog";
import { getTaskTemplateCategoryLabel } from "@/lib/task-template-category";

export type DefaultExecutionSummaryTask = {
  stageKey: ExecutionStageKey;
  category: TaskTemplateCategory;
};

/** Build a calm one-line summary for list cards (Saved Line Items). */
export function buildDefaultExecutionSummaryLine(tasks: DefaultExecutionSummaryTask[]): {
  taskCount: number;
  summaryLine: string | null;
} {
  if (tasks.length === 0) {
    return { taskCount: 0, summaryLine: null };
  }
  const stageSet = new Set(tasks.map((t) => t.stageKey));
  const orderedStages = EXECUTION_STAGE_KEYS_ORDERED.filter((sk) => stageSet.has(sk));
  const stageLabels = orderedStages.map((sk) => getExecutionStageLabel(sk));
  const taskWord = tasks.length === 1 ? "task" : "tasks";
  let summaryLine: string;
  if (stageLabels.length <= 3) {
    summaryLine = `${tasks.length} ${taskWord} · ${stageLabels.join(", ")}`;
  } else {
    summaryLine = `${tasks.length} ${taskWord} · ${stageLabels.length} stages`;
  }
  const catSet = new Set(tasks.map((t) => t.category));
  if (catSet.size >= 2 && catSet.size <= 3) {
    const catLabels = [...catSet].map((c) => getTaskTemplateCategoryLabel(c));
    summaryLine = `${summaryLine} · ${catLabels.join(", ")}`;
  } else if (catSet.size > 3) {
    summaryLine = `${summaryLine} · ${catSet.size} categories`;
  }
  return { taskCount: tasks.length, summaryLine };
}
