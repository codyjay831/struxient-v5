import type { TaskTemplateCategory } from "@prisma/client";
import type {
  QuoteActivationLineInput,
  QuoteActivationReadinessInput,
} from "@/lib/quote-job-activation-readiness";
import type {
  QuoteExecutionReviewLineInput,
  QuoteExecutionReviewQuoteInput,
  QuoteExecutionReviewTaskInput,
} from "@/lib/quote-execution-review-preview-model";

/** Task row from QuoteExecutionPlan.tasks (with scopes). */
export type QuotePlanSurfaceTask = {
  id: string;
  title: string;
  stageId: string | null;
  stageName?: string | null;
  category: TaskTemplateCategory;
  instructions?: string | null;
  sortOrder: number;
  providesSignals: string[];
  requiresSignals: string[];
  hardSignal: boolean;
  protectedAt?: Date | null;
  humanEditedAt?: Date | null;
  requirementsJson?: unknown;
  partsRequiredJson?: unknown;
  scopeLineIds: string[];
};

export type QuotePlanSurfaceLine = {
  id: string;
  description: string;
  sortOrder: number;
  executionRelevant?: boolean;
};

export type QuotePlanSurfaceExecutionPlan = {
  status: "DRAFT" | "READY_FOR_REVIEW" | "ACCEPTED";
  planVersion: number;
  planningInputHash: string | null;
  planningInputSchemaVersion?: number;
};

export function hasQuoteWidePlanTasks(planTasks: readonly QuotePlanSurfaceTask[]): boolean {
  return planTasks.length > 0;
}

/** Map plan tasks to the line items they cover (shared tasks appear on each scoped line). */
export function buildQuotePlanTasksByLineId(
  lines: readonly QuotePlanSurfaceLine[],
  planTasks: readonly QuotePlanSurfaceTask[],
): Record<string, QuotePlanSurfaceTask[]> {
  const byLineId: Record<string, QuotePlanSurfaceTask[]> = {};
  for (const line of lines) {
    byLineId[line.id] = [];
  }
  for (const task of planTasks) {
    for (const lineId of task.scopeLineIds) {
      if (byLineId[lineId]) {
        byLineId[lineId].push(task);
      }
    }
  }
  for (const lineId of Object.keys(byLineId)) {
    byLineId[lineId].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
  }
  return byLineId;
}

/** Lines + activation-scoped tasks for evaluateQuoteJobActivationReadiness. Plan-only — no draft fallback. */
export function buildQuoteActivationLinesFromPlan(
  lines: readonly QuotePlanSurfaceLine[],
  planTasks: readonly QuotePlanSurfaceTask[],
): QuoteActivationLineInput[] {
  const byLineId = buildQuotePlanTasksByLineId(lines, planTasks);
  return lines.map((line) => ({
    id: line.id,
    description: line.description,
    executionRelevant: line.executionRelevant,
    tasks: (byLineId[line.id] ?? []).map((task) => ({
      id: task.id,
      title: task.title,
      stageId: task.stageId,
      providesSignals: task.providesSignals,
      requiresSignals: task.requiresSignals,
      hardSignal: task.hardSignal,
    })),
  }));
}

/** Input for buildQuoteExecutionReviewPreviewModel. Plan-only — no draft fallback. */
export function buildQuoteExecutionReviewModelInputFromPlan(
  quote: { id: string; title: string; status: QuoteExecutionReviewQuoteInput["status"] },
  lines: readonly QuotePlanSurfaceLine[],
  planTasks: readonly QuotePlanSurfaceTask[],
): QuoteExecutionReviewQuoteInput {
  const byLineId = buildQuotePlanTasksByLineId(lines, planTasks);
  return {
    id: quote.id,
    title: quote.title,
    status: quote.status,
    lines: lines.map((line): QuoteExecutionReviewLineInput => ({
      id: line.id,
      description: line.description,
      sortOrder: line.sortOrder,
      tasks: (byLineId[line.id] ?? []).map(
        (task): QuoteExecutionReviewTaskInput => ({
          id: task.id,
          title: task.title,
          stageId: task.stageId,
          stageName: task.stageName,
          category: task.category,
          providesSignals: task.providesSignals,
          requiresSignals: task.requiresSignals,
          hardSignal: task.hardSignal,
          sortOrder: task.sortOrder,
          requirementsJson: task.requirementsJson,
          partsRequiredJson: task.partsRequiredJson,
        }),
      ),
    })),
  };
}

export function buildQuoteActivationReadinessInput(params: {
  status: QuoteActivationReadinessInput["status"];
  hasApprovalCheckpoint: boolean;
  executionPlan: QuotePlanSurfaceExecutionPlan | null;
  currentPlanningInputHash: string | null;
  lines: readonly QuotePlanSurfaceLine[];
  planTasks: readonly QuotePlanSurfaceTask[];
  quoteTotalCents: number;
  paymentSchedule: QuoteActivationReadinessInput["paymentSchedule"];
}): QuoteActivationReadinessInput {
  return {
    status: params.status,
    hasApprovalCheckpoint: params.hasApprovalCheckpoint,
    executionPlan: params.executionPlan
      ? {
          status: params.executionPlan.status,
          planVersion: params.executionPlan.planVersion,
          acceptedPlanningInputHash: params.executionPlan.planningInputHash,
          currentPlanningInputHash:
            params.currentPlanningInputHash ?? params.executionPlan.planningInputHash ?? "",
        }
      : null,
    lines: buildQuoteActivationLinesFromPlan(params.lines, params.planTasks),
    quoteTotalCents: params.quoteTotalCents,
    paymentSchedule: params.paymentSchedule,
  };
}

/** Group plan tasks by stage name for preview UI. */
export function groupQuotePlanTasksByStage(
  planTasks: readonly QuotePlanSurfaceTask[],
): Array<{ stageName: string; tasks: QuotePlanSurfaceTask[] }> {
  const groups = new Map<string, QuotePlanSurfaceTask[]>();
  for (const task of [...planTasks].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const stageName = task.stageName?.trim() || "No stage";
    const existing = groups.get(stageName);
    if (existing) {
      existing.push(task);
    } else {
      groups.set(stageName, [task]);
    }
  }
  return Array.from(groups.entries()).map(([stageName, tasks]) => ({ stageName, tasks }));
}
