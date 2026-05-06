import type {
  ExecutionStageKey,
  QuoteLineExecutionMergeMode,
  QuoteLineExecutionReviewStatus,
  QuoteStatus,
  TaskTemplateCategory,
} from "@prisma/client";
import { EXECUTION_STAGE_KEYS_ORDERED, getExecutionStageLabel } from "@/lib/execution-stage-catalog";
import { buildDefaultExecutionSummaryLine } from "@/lib/line-item-template-execution-summary";

/** Plain input for {@link buildQuoteExecutionReviewPreviewModel} — easy to test without Prisma client. */
export type QuoteExecutionReviewTaskInput = {
  id: string;
  title: string;
  stageKey: ExecutionStageKey;
  category: TaskTemplateCategory;
  sortOrder: number;
};

export type QuoteExecutionReviewLineInput = {
  id: string;
  description: string;
  sortOrder: number;
  executionOrder: number;
  executionReviewStatus: QuoteLineExecutionReviewStatus;
  executionMergeMode: QuoteLineExecutionMergeMode;
  tasks: QuoteExecutionReviewTaskInput[];
};

export type QuoteExecutionReviewQuoteInput = {
  id: string;
  title: string;
  status: QuoteStatus;
  lines: QuoteExecutionReviewLineInput[];
};

export type QuoteExecutionReviewPreviewHeadline =
  | "needs_decisions"
  | "ready_for_activation_review"
  | "commercial_only_execution"
  | "no_draft_tasks_yet"
  | "no_line_items";

export type QuoteExecutionReviewSummary = {
  totalLines: number;
  linesWithTasks: number;
  noExecutionNeededLines: number;
  needsReviewLines: number;
  mergeIntoSharedStageLines: number;
  keepSeparateBlockLines: number;
  totalTasks: number;
  headline: QuoteExecutionReviewPreviewHeadline;
  headlineLabel: string;
  headlineDescription: string;
};

export type QuoteExecutionReviewLineReadinessRow = {
  lineId: string;
  workOrderPosition: number;
  workOrderTotal: number;
  description: string;
  readinessLabel: string;
  mergeLabel: string;
  taskCount: number;
  stageSummaryLine: string | null;
  /** Data inconsistency: tasks exist while marked commercial-only. */
  anomalyCommercialOnlyWithTasks: boolean;
};

export type QuoteExecutionReviewSharedTaskRow = {
  taskId: string;
  title: string;
  sourceLineDescription: string;
};

export type QuoteExecutionReviewSharedStageBlock = {
  stageKey: ExecutionStageKey;
  stageLabel: string;
  tasks: QuoteExecutionReviewSharedTaskRow[];
};

export type QuoteExecutionReviewSeparateStageBlock = {
  stageKey: ExecutionStageKey;
  stageLabel: string;
  tasks: { taskId: string; title: string }[];
};

export type QuoteExecutionReviewSeparateBlock = {
  lineId: string;
  lineDescription: string;
  workOrderPosition: number;
  stages: QuoteExecutionReviewSeparateStageBlock[];
};

export type QuoteExecutionReviewNeedsAttentionLine = {
  lineId: string;
  description: string;
};

export type QuoteExecutionReviewCommercialOnlyLine = {
  lineId: string;
  description: string;
  anomaly: boolean;
};

export type QuoteExecutionReviewPreviewModel = {
  summary: QuoteExecutionReviewSummary;
  lineReadiness: QuoteExecutionReviewLineReadinessRow[];
  sharedStages: QuoteExecutionReviewSharedStageBlock[];
  separateBlocks: QuoteExecutionReviewSeparateBlock[];
  needsAttentionLines: QuoteExecutionReviewNeedsAttentionLine[];
  commercialOnlyLines: QuoteExecutionReviewCommercialOnlyLine[];
};

function sortLines(lines: QuoteExecutionReviewLineInput[]): QuoteExecutionReviewLineInput[] {
  return [...lines].sort((a, b) => {
    if (a.executionOrder !== b.executionOrder) {
      return a.executionOrder - b.executionOrder;
    }
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    return a.id.localeCompare(b.id);
  });
}

function taskLineSort(
  a: { line: QuoteExecutionReviewLineInput; task: QuoteExecutionReviewTaskInput },
  b: { line: QuoteExecutionReviewLineInput; task: QuoteExecutionReviewTaskInput },
): number {
  if (a.line.executionOrder !== b.line.executionOrder) {
    return a.line.executionOrder - b.line.executionOrder;
  }
  if (a.line.sortOrder !== b.line.sortOrder) {
    return a.line.sortOrder - b.line.sortOrder;
  }
  if (a.line.id !== b.line.id) {
    return a.line.id.localeCompare(b.line.id);
  }
  if (a.task.sortOrder !== b.task.sortOrder) {
    return a.task.sortOrder - b.task.sortOrder;
  }
  return a.task.id.localeCompare(b.task.id);
}

export function buildQuoteExecutionReviewPreviewModel(
  quote: QuoteExecutionReviewQuoteInput,
): QuoteExecutionReviewPreviewModel {
  const sorted = sortLines(quote.lines);
  const workOrderTotal = sorted.length;
  const workOrderRank = new Map(sorted.map((l, i) => [l.id, i + 1]));

  let linesWithTasks = 0;
  let noExecutionNeededLines = 0;
  let needsReviewLines = 0;
  let mergeIntoSharedStageLines = 0;
  let keepSeparateBlockLines = 0;
  let totalTasks = 0;
  let anomalyCommercialOnlyWithTasks = 0;

  for (const line of sorted) {
    const n = line.tasks.length;
    totalTasks += n;
    if (n > 0) {
      linesWithTasks += 1;
    }
    if (line.executionReviewStatus === "NO_EXECUTION_NEEDED") {
      noExecutionNeededLines += 1;
      if (n > 0) {
        anomalyCommercialOnlyWithTasks += 1;
      }
    } else if (n === 0) {
      needsReviewLines += 1;
    }
    if (line.executionReviewStatus !== "NO_EXECUTION_NEEDED") {
      if (line.executionMergeMode === "MERGE_INTO_JOB_STAGES") {
        mergeIntoSharedStageLines += 1;
      } else {
        keepSeparateBlockLines += 1;
      }
    }
  }

  const needsAttentionLines: QuoteExecutionReviewNeedsAttentionLine[] = sorted
    .filter((l) => l.executionReviewStatus === "UNREVIEWED" && l.tasks.length === 0)
    .map((l) => ({ lineId: l.id, description: l.description }));

  const commercialOnlyLines: QuoteExecutionReviewCommercialOnlyLine[] = sorted
    .filter((l) => l.executionReviewStatus === "NO_EXECUTION_NEEDED")
    .map((l) => ({
      lineId: l.id,
      description: l.description,
      anomaly: l.tasks.length > 0,
    }));

  const lineReadiness: QuoteExecutionReviewLineReadinessRow[] = sorted.map((line) => {
    const exec = buildDefaultExecutionSummaryLine(
      line.tasks.map((t) => ({ stageKey: t.stageKey, category: t.category })),
    );
    let readinessLabel: string;
    if (line.executionReviewStatus === "NO_EXECUTION_NEEDED") {
      readinessLabel = "No execution needed";
    } else if (line.tasks.length > 0) {
      readinessLabel = "Has draft execution";
    } else {
      readinessLabel = "Needs execution review";
    }
    const mergeLabel =
      line.executionMergeMode === "KEEP_SEPARATE_BLOCK"
        ? "Separate execution block"
        : "Shared job stages";

    return {
      lineId: line.id,
      workOrderPosition: workOrderRank.get(line.id) ?? 1,
      workOrderTotal,
      description: line.description,
      readinessLabel,
      mergeLabel,
      taskCount: line.tasks.length,
      stageSummaryLine: exec.summaryLine,
      anomalyCommercialOnlyWithTasks:
        line.executionReviewStatus === "NO_EXECUTION_NEEDED" && line.tasks.length > 0,
    };
  });

  const mergeContributors = sorted.filter(
    (l) =>
      l.executionReviewStatus !== "NO_EXECUTION_NEEDED" &&
      l.executionMergeMode === "MERGE_INTO_JOB_STAGES" &&
      l.tasks.length > 0,
  );

  const sharedRefs: { line: QuoteExecutionReviewLineInput; task: QuoteExecutionReviewTaskInput }[] = [];
  for (const line of mergeContributors) {
    for (const task of line.tasks) {
      sharedRefs.push({ line, task });
    }
  }
  sharedRefs.sort(taskLineSort);

  const sharedStages: QuoteExecutionReviewSharedStageBlock[] = [];
  for (const stageKey of EXECUTION_STAGE_KEYS_ORDERED) {
    const inStage = sharedRefs.filter((r) => r.task.stageKey === stageKey);
    if (inStage.length === 0) {
      continue;
    }
    sharedStages.push({
      stageKey,
      stageLabel: getExecutionStageLabel(stageKey),
      tasks: inStage.map((r) => ({
        taskId: r.task.id,
        title: r.task.title,
        sourceLineDescription: r.line.description,
      })),
    });
  }

  const separateLineSources = sorted.filter(
    (l) =>
      l.executionReviewStatus !== "NO_EXECUTION_NEEDED" &&
      l.executionMergeMode === "KEEP_SEPARATE_BLOCK" &&
      l.tasks.length > 0,
  );

  const separateBlocks: QuoteExecutionReviewSeparateBlock[] = separateLineSources.map((line) => {
    const stages: QuoteExecutionReviewSeparateStageBlock[] = [];
    for (const stageKey of EXECUTION_STAGE_KEYS_ORDERED) {
      const inStage = line.tasks
        .filter((t) => t.stageKey === stageKey)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
      if (inStage.length === 0) {
        continue;
      }
      stages.push({
        stageKey,
        stageLabel: getExecutionStageLabel(stageKey),
        tasks: inStage.map((t) => ({ taskId: t.id, title: t.title })),
      });
    }
    return {
      lineId: line.id,
      lineDescription: line.description,
      workOrderPosition: workOrderRank.get(line.id) ?? 1,
      stages,
    };
  });

  let headline: QuoteExecutionReviewPreviewHeadline;
  let headlineLabel: string;
  let headlineDescription: string;

  if (workOrderTotal === 0) {
    headline = "no_line_items";
    headlineLabel = "No line items yet";
    headlineDescription = "Add line items on the quote before previewing execution.";
  } else if (anomalyCommercialOnlyWithTasks > 0 || needsAttentionLines.length > 0) {
    headline = "needs_decisions";
    headlineLabel = "Needs execution decisions";
    headlineDescription =
      anomalyCommercialOnlyWithTasks > 0
        ? "Some lines are marked commercial-only but still have draft tasks—fix planning on those lines."
        : "Some lines still need draft execution or an explicit commercial-only choice.";
  } else if (totalTasks === 0) {
    if (noExecutionNeededLines === workOrderTotal) {
      headline = "commercial_only_execution";
      headlineLabel = "Commercial-only from an execution standpoint";
      headlineDescription =
        "Every line is marked no execution needed. A future job could still be created from the quote, but no internal execution tasks would come from these lines yet.";
    } else {
      headline = "no_draft_tasks_yet";
      headlineLabel = "No draft execution yet";
      headlineDescription =
        "No draft tasks are on this quote. Add tasks on lines that need work, or mark lines commercial-only where appropriate.";
    }
  } else {
    headline = "ready_for_activation_review";
    headlineLabel = "Ready for future activation review";
    headlineDescription =
      "Draft execution is present and there are no open review gaps in this preview. Activation and runtime jobs are not built yet—this is planning only.";
  }

  return {
    summary: {
      totalLines: workOrderTotal,
      linesWithTasks,
      noExecutionNeededLines,
      needsReviewLines,
      mergeIntoSharedStageLines,
      keepSeparateBlockLines,
      totalTasks,
      headline,
      headlineLabel,
      headlineDescription,
    },
    lineReadiness,
    sharedStages,
    separateBlocks,
    needsAttentionLines,
    commercialOnlyLines,
  };
}
