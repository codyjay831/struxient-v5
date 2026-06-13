import { TaskTemplateCategory } from "@prisma/client";
import type { QuotePlanProposal } from "@/lib/quote-plan/quote-plan-proposal-schema";

export type UncoordinatedDraftLineTask = {
  id: string;
  title: string;
  category: TaskTemplateCategory;
  stageId: string | null;
  instructions: string | null;
  providesSignals: string[];
  requiresSignals: string[];
  hardSignal: boolean;
  requirementsJson: unknown;
  partsRequiredJson: unknown;
  sourceTaskTemplateId: string | null;
};

export type UncoordinatedDraftLine = {
  id: string;
  description: string;
  tasks: UncoordinatedDraftLineTask[];
};

export function buildUncoordinatedDraftProposal(params: {
  quoteId: string;
  generatedAgainstInputHash: string;
  basePlanVersion: number;
  lines: UncoordinatedDraftLine[];
}): QuotePlanProposal {
  const operations: QuotePlanProposal["operations"] = [];
  let index = 0;
  for (const line of params.lines) {
    for (const task of line.tasks) {
      index += 1;
      operations.push({
        opId: `seed-${index}`,
        type: "ADD_TASK",
        reason: "Uncoordinated draft seed from existing quote-line task.",
        task: {
          title: task.title,
          category: task.category,
          stageId: task.stageId,
          instructions: task.instructions,
          requiresSignals: task.requiresSignals,
          providesSignals: task.providesSignals,
          hardSignal: task.hardSignal,
          requirementsJson: task.requirementsJson,
          partsRequiredJson: task.partsRequiredJson,
          sourceTaskTemplateId: task.sourceTaskTemplateId,
          sourceType: task.sourceTaskTemplateId ? "TASK_TEMPLATE" : "CUSTOM",
          origin: "MANUAL",
        planningTags: [],
          lineItemIds: [line.id],
        },
      });
    }
  }

  return {
    quoteId: params.quoteId,
    schemaVersion: 1,
    plannerVersion: "uncoordinated-seed-v1",
    generatedAgainstInputHash: params.generatedAgainstInputHash,
    basePlanVersion: params.basePlanVersion,
    summary:
      "Seeded an uncoordinated draft from existing line-by-line tasks. Review and reconcile before acceptance.",
    assumptions: [],
    warnings: [
      "Generated without whole-quote AI coordination.",
      "Duplicate or overlapping tasks may exist across lines.",
    ],
    operations,
  };
}

