import { QuoteExecutionPlanStatus } from "@prisma/client";
import {
  QuotePlanProposalSchema,
  type QuotePlanProposal,
} from "@/lib/quote-plan/quote-plan-proposal-schema";
import { analyzeExecutionSignals } from "@/lib/execution-signal-analysis";

type QuotePlanValidationTaskRow = {
  id: string;
  protectedAt: Date | null;
  humanEditedAt: Date | null;
  lineItemIds: string[];
  requiresSignals: string[];
  providesSignals: string[];
  hardSignal: boolean;
};

export type QuotePlanValidationContext = {
  quoteId: string;
  allowedLineItemIds: Set<string>;
  executionRelevantLineItemIds: Set<string>;
  plan: {
    status: QuoteExecutionPlanStatus;
    planVersion: number;
    planningInputHash: string | null;
  };
  currentPlanningInputHash: string;
  existingTasks: QuotePlanValidationTaskRow[];
};

export type QuotePlanValidationResult =
  | { ok: true; proposal: QuotePlanProposal }
  | { ok: false; error: string };

type SimTask = {
  id: string;
  lineItemIds: string[];
  requiresSignals: string[];
  providesSignals: string[];
  hardSignal: boolean;
  canceled: boolean;
};

function validateLineScopeIds(lineIds: string[], allowedLineItemIds: Set<string>) {
  return lineIds.every((lineId) => allowedLineItemIds.has(lineId));
}

function buildSimTaskMap(existingTasks: QuotePlanValidationTaskRow[]): Map<string, SimTask> {
  const map = new Map<string, SimTask>();
  for (const task of existingTasks) {
    map.set(task.id, {
      id: task.id,
      lineItemIds: [...task.lineItemIds],
      requiresSignals: [...task.requiresSignals],
      providesSignals: [...task.providesSignals],
      hardSignal: task.hardSignal,
      canceled: false,
    });
  }
  return map;
}

function assertCoverageInvariant(
  tasks: Iterable<SimTask>,
  executionRelevantLineItemIds: Set<string>,
): { ok: true } | { ok: false; error: string } {
  const covered = new Set<string>();
  for (const task of tasks) {
    if (task.canceled) continue;
    for (const lineId of task.lineItemIds) {
      covered.add(lineId);
    }
  }
  for (const lineId of executionRelevantLineItemIds) {
    if (!covered.has(lineId)) {
      return {
        ok: false,
        error: `Execution-relevant scope line ${lineId} has no planned task coverage.`,
      };
    }
  }
  return { ok: true };
}

function assertNoHardSignalOrphans(tasks: Iterable<SimTask>): { ok: true } | { ok: false; error: string } {
  const liveTasks = [...tasks].filter((task) => !task.canceled);
  const analysis = analyzeExecutionSignals(
    liveTasks.map((task) => ({
      id: task.id,
      title: task.id,
      stageId: null,
      requiresSignals: task.requiresSignals,
      providesSignals: task.providesSignals,
      hardSignal: task.hardSignal,
    })),
  );
  if (analysis.hardMissingRequirements.length === 0) {
    return { ok: true };
  }
  const first = analysis.hardMissingRequirements[0];
  return {
    ok: false,
    error: `Hard dependency orphan detected: signal "${first.signal}" has no provider after apply.`,
  };
}

export function validateQuotePlanProposalForApply(
  rawProposal: unknown,
  ctx: QuotePlanValidationContext,
): QuotePlanValidationResult {
  const parsed = QuotePlanProposalSchema.safeParse(rawProposal);
  if (!parsed.success) {
    return { ok: false, error: "Proposal format is invalid." };
  }
  const proposal = parsed.data;
  const taskById = new Map(ctx.existingTasks.map((task) => [task.id, task]));
  const simTaskById = buildSimTaskMap(ctx.existingTasks);
  if (proposal.quoteId !== ctx.quoteId) {
    return { ok: false, error: "Proposal quote id mismatch." };
  }
  if (proposal.basePlanVersion !== ctx.plan.planVersion) {
    return { ok: false, error: "Plan version changed. Regenerate proposal from the latest plan." };
  }
  if (proposal.generatedAgainstInputHash !== ctx.currentPlanningInputHash) {
    return { ok: false, error: "Planning inputs changed. Regenerate proposal against current input." };
  }
  if (
    ctx.plan.status !== QuoteExecutionPlanStatus.DRAFT &&
    ctx.plan.status !== QuoteExecutionPlanStatus.READY_FOR_REVIEW
  ) {
    return { ok: false, error: "Plan is not editable in its current status." };
  }
  for (const operation of proposal.operations) {
    if (operation.type === "ADD_TASK") {
      if (!validateLineScopeIds(operation.task.lineItemIds, ctx.allowedLineItemIds)) {
        return { ok: false, error: "Proposal references line items outside the target quote." };
      }
      const syntheticId = `add:${operation.opId}`;
      simTaskById.set(syntheticId, {
        id: syntheticId,
        lineItemIds: [...new Set(operation.task.lineItemIds)],
        requiresSignals: operation.task.requiresSignals,
        providesSignals: operation.task.providesSignals,
        hardSignal: operation.task.hardSignal,
        canceled: false,
      });
      continue;
    }
    if (operation.type === "UPDATE_TASK") {
      const existing = taskById.get(operation.taskId);
      if (!existing) {
        return { ok: false, error: `Task ${operation.taskId} no longer exists on this quote plan.` };
      }
      if (existing.protectedAt) {
        return { ok: false, error: `Task ${operation.taskId} is protected and cannot be mutated.` };
      }
      const sim = simTaskById.get(operation.taskId);
      if (!sim) continue;
      if (operation.task.lineItemIds) {
        if (!validateLineScopeIds(operation.task.lineItemIds, ctx.allowedLineItemIds)) {
          return { ok: false, error: "Proposal references line items outside the target quote." };
        }
        sim.lineItemIds = [...new Set(operation.task.lineItemIds)];
      }
      if (operation.task.requiresSignals) sim.requiresSignals = operation.task.requiresSignals;
      if (operation.task.providesSignals) sim.providesSignals = operation.task.providesSignals;
      if (operation.task.hardSignal !== undefined) sim.hardSignal = operation.task.hardSignal;
      continue;
    }
    if (operation.type === "RELINK_TASK_SCOPE") {
      const existing = taskById.get(operation.taskId);
      if (!existing) {
        return { ok: false, error: `Task ${operation.taskId} no longer exists on this quote plan.` };
      }
      if (existing.protectedAt) {
        return { ok: false, error: `Task ${operation.taskId} is protected and cannot be mutated.` };
      }
      if (!validateLineScopeIds(operation.lineItemIds, ctx.allowedLineItemIds)) {
        return { ok: false, error: "Proposal references line items outside the target quote." };
      }
      const sim = simTaskById.get(operation.taskId);
      if (sim) {
        sim.lineItemIds = [...new Set(operation.lineItemIds)];
      }
      continue;
    }
    if (operation.type === "CANCEL_TASK") {
      const existing = taskById.get(operation.taskId);
      if (!existing) {
        return { ok: false, error: `Task ${operation.taskId} no longer exists on this quote plan.` };
      }
      if (existing.protectedAt) {
        return { ok: false, error: `Task ${operation.taskId} is protected and cannot be canceled.` };
      }
      const sim = simTaskById.get(operation.taskId);
      if (sim) sim.canceled = true;
      continue;
    }
  }
  const coverage = assertCoverageInvariant(simTaskById.values(), ctx.executionRelevantLineItemIds);
  if (!coverage.ok) return coverage;
  const dependencies = assertNoHardSignalOrphans(simTaskById.values());
  if (!dependencies.ok) return dependencies;
  return { ok: true, proposal };
}

