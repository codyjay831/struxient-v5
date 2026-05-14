import type { TaskTemplateCategory } from "@prisma/client";
import { getTaskTemplateCategoryLabel } from "@/lib/task-template-category";

export type DefaultExecutionSummaryTask = {
  stage: { name: string; sortOrder: number } | null;
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

  const stageMap = new Map<string, { name: string; sortOrder: number }>();
  for (const t of tasks) {
    if (t.stage && !stageMap.has(t.stage.name)) {
      stageMap.set(t.stage.name, t.stage);
    }
  }
  const orderedStages = [...stageMap.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  const stageLabels = orderedStages.map((s) => s.name);

  const taskWord = tasks.length === 1 ? "task" : "tasks";
  let summaryLine: string;
  if (stageLabels.length === 0) {
    summaryLine = `${tasks.length} ${taskWord}`;
  } else if (stageLabels.length <= 3) {
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
