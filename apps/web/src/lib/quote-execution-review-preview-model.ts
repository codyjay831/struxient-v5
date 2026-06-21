import type {
  QuoteStatus,
  TaskTemplateCategory,
} from "@prisma/client";
import { normalizeSignalKey } from "@/lib/signal-key";
import { analyzeExecutionSignals } from "@/lib/execution-signal-analysis";
import type { TaskCompletionRequirements } from "./task-readiness";
import type { TaskResourceRequirement } from "./task-resource";

/** Plain input for {@link buildQuoteExecutionReviewPreviewModel} */
export type QuoteExecutionReviewTaskInput = {
  id: string;
  title: string;
  stageId: string | null;
  stageName?: string | null;
  category: TaskTemplateCategory;
  providesSignals: string[];
  requiresSignals: string[];
  hardSignal: boolean;
  sortOrder: number;
  requirementsJson?: unknown;
  partsRequiredJson?: unknown;
};

export type QuoteExecutionReviewLineInput = {
  id: string;
  description: string;
  sortOrder: number;
  tasks: QuoteExecutionReviewTaskInput[];
};

export type QuoteExecutionReviewQuoteInput = {
  id: string;
  title: string;
  status: QuoteStatus;
  lines: QuoteExecutionReviewLineInput[];
};

export type QuoteExecutionReviewHandshake = {
  signal: string;
  providerTaskId: string;
  providerTaskTitle: string;
  providerLineDescription: string;
  consumerTaskId: string;
  consumerTaskTitle: string;
  consumerLineDescription: string;
};

export type QuoteExecutionReviewOrphan = {
  signal: string;
  isHard: boolean;
  consumerLineId: string;
  consumerStageId: string | null;
  consumerTaskId: string;
  consumerTaskTitle: string;
  consumerTaskRequiresSignalCount: number;
  consumerLineDescription: string;
};

export type QuoteExecutionReviewPreviewModel = {
  summary: {
    totalLines: number;
    totalTasks: number;
    providedSignalCount: number;
    requiredSignalCount: number;
    orphanCount: number;
    hardOrphanCount: number;
  };
  handshakes: QuoteExecutionReviewHandshake[];
  orphans: QuoteExecutionReviewOrphan[];
  lineReadiness: {
    lineId: string;
    description: string;
    taskCount: number;
    providesSignals: string[];
    requiresSignals: string[];
    checklistCount: number;
    equipmentCount: number;
  }[];
  equipmentRollup: {
    id: string;
    name: string;
    quantity: number;
    unit?: string;
    isEquipment?: boolean;
    taskTitles: string[];
  }[];
};

function uniqueSignalsByEquivalence(signals: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const signal of signals) {
    const normalized = normalizeSignalKey(signal);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    unique.push(signal);
  }
  return unique;
}

export function buildQuoteExecutionReviewPreviewModel(
  quote: QuoteExecutionReviewQuoteInput,
): QuoteExecutionReviewPreviewModel {
  const allTasksById = new Map<
    string,
    QuoteExecutionReviewTaskInput & { lineDescription: string; lineId: string }
  >();
  for (const line of quote.lines) {
    for (const task of line.tasks) {
      if (!allTasksById.has(task.id)) {
        allTasksById.set(task.id, {
          ...task,
          lineDescription: line.description,
          lineId: line.id,
        });
      }
    }
  }
  const allTasks = Array.from(allTasksById.values());

  const signalAnalysis = analyzeExecutionSignals(allTasks);
  const handshakes: QuoteExecutionReviewHandshake[] = signalAnalysis.handshakes.map((entry) => ({
    signal: entry.signal,
    providerTaskId: entry.providerTaskId,
    providerTaskTitle: entry.providerTaskTitle,
    providerLineDescription: entry.providerLineDescription,
    consumerTaskId: entry.consumerTaskId,
    consumerTaskTitle: entry.consumerTaskTitle,
    consumerLineDescription: entry.consumerLineDescription,
  }));
  const orphans: QuoteExecutionReviewOrphan[] = signalAnalysis.missingRequirements.map((entry) => ({
    signal: entry.signal,
    isHard: entry.isHard,
    consumerLineId: entry.consumerLineId ?? "",
    consumerStageId: entry.consumerStageId,
    consumerTaskId: entry.consumerTaskId,
    consumerTaskTitle: entry.consumerTaskTitle,
    consumerTaskRequiresSignalCount: entry.consumerTaskRequiresSignalCount,
    consumerLineDescription: entry.consumerLineDescription,
  }));

  const lineReadiness = quote.lines.map((l) => {
    const tasks = l.tasks;
    let checklistCount = 0;
    let equipmentCount = 0;

    for (const t of tasks) {
      const reqs = (t.requirementsJson ?? {}) as TaskCompletionRequirements;
      checklistCount += reqs.checklist?.length ?? 0;

      const parts = (t.partsRequiredJson ?? { resources: [] }) as TaskResourceRequirement;
      equipmentCount += parts.resources?.length ?? 0;
    }

    return {
      lineId: l.id,
      description: l.description,
      taskCount: l.tasks.length,
      providesSignals: uniqueSignalsByEquivalence(l.tasks.flatMap((t) => t.providesSignals)),
      requiresSignals: uniqueSignalsByEquivalence(l.tasks.flatMap((t) => t.requiresSignals)),
      checklistCount,
      equipmentCount,
    };
  });

  const equipmentMap = new Map<
    string,
    {
      id: string;
      name: string;
      quantity: number;
      unit?: string;
      isEquipment?: boolean;
      taskTitles: Set<string>;
    }
  >();

  for (const t of allTasks) {
    const parts = (t.partsRequiredJson ?? { resources: [] }) as TaskResourceRequirement;
    for (const res of parts.resources ?? []) {
      const key = `${res.name}|${res.unit ?? ""}|${res.isEquipment ?? false}`;
      if (!equipmentMap.has(key)) {
        equipmentMap.set(key, {
          id: res.id,
          name: res.name,
          quantity: 0,
          unit: res.unit,
          isEquipment: res.isEquipment,
          taskTitles: new Set(),
        });
      }
      const entry = equipmentMap.get(key)!;
      entry.quantity += res.quantity;
      entry.taskTitles.add(t.title);
    }
  }

  const equipmentRollup = Array.from(equipmentMap.values())
    .map((e) => ({
      ...e,
      taskTitles: Array.from(e.taskTitles),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    summary: {
      totalLines: quote.lines.length,
      totalTasks: allTasks.length,
      providedSignalCount: signalAnalysis.providedSignalCount,
      requiredSignalCount: signalAnalysis.requiredSignalCount,
      orphanCount: orphans.length,
      hardOrphanCount: orphans.filter((o) => o.isHard).length,
    },
    handshakes,
    orphans,
    lineReadiness,
    equipmentRollup,
  };
}
