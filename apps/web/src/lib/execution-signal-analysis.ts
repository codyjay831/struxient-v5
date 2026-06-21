import { normalizeSignalKey } from "@/lib/signal-key";

export type ExecutionSignalTaskInput = {
  id: string;
  title: string;
  stageId: string | null;
  lineId?: string;
  lineDescription?: string;
  requiresSignals: string[];
  providesSignals: string[];
  hardSignal: boolean;
};

export type ExecutionSignalHandshake = {
  signal: string;
  normalizedSignal: string;
  providerTaskId: string;
  providerTaskTitle: string;
  providerLineDescription: string;
  consumerTaskId: string;
  consumerTaskTitle: string;
  consumerLineDescription: string;
};

export type ExecutionSignalMissingRequirement = {
  signal: string;
  normalizedSignal: string;
  isHard: boolean;
  consumerTaskId: string;
  consumerTaskTitle: string;
  consumerStageId: string | null;
  consumerLineId?: string;
  consumerLineDescription: string;
  consumerTaskRequiresSignalCount: number;
};

export type ExecutionSignalCycle = {
  taskIds: string[];
};

export type ExecutionSignalAnalysisResult = {
  handshakes: ExecutionSignalHandshake[];
  missingRequirements: ExecutionSignalMissingRequirement[];
  hardMissingRequirements: ExecutionSignalMissingRequirement[];
  softMissingRequirements: ExecutionSignalMissingRequirement[];
  cycles: ExecutionSignalCycle[];
  providedSignalCount: number;
  requiredSignalCount: number;
};

function normalizedSignals(signals: string[]): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const signal of signals) {
    const normalized = normalizeSignalKey(signal);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    values.push(normalized);
  }
  return values;
}

function formatCycle(path: string[], cycleStartId: string): string[] {
  const startIndex = path.indexOf(cycleStartId);
  if (startIndex < 0) return [cycleStartId];
  const cycle = path.slice(startIndex);
  return cycle.length > 0 ? cycle : [cycleStartId];
}

export function analyzeExecutionSignals(
  tasks: ExecutionSignalTaskInput[],
): ExecutionSignalAnalysisResult {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const providersBySignal = new Map<string, ExecutionSignalTaskInput[]>();

  for (const task of tasks) {
    for (const normalizedSignal of normalizedSignals(task.providesSignals)) {
      const providers = providersBySignal.get(normalizedSignal);
      if (providers) {
        providers.push(task);
      } else {
        providersBySignal.set(normalizedSignal, [task]);
      }
    }
  }

  const handshakes: ExecutionSignalHandshake[] = [];
  const missingRequirements: ExecutionSignalMissingRequirement[] = [];

  for (const consumer of tasks) {
    for (const signal of consumer.requiresSignals) {
      const normalizedSignal = normalizeSignalKey(signal);
      if (!normalizedSignal) continue;
      const providers = providersBySignal.get(normalizedSignal);
      if (providers && providers.length > 0) {
        for (const provider of providers) {
          handshakes.push({
            signal,
            normalizedSignal,
            providerTaskId: provider.id,
            providerTaskTitle: provider.title,
            providerLineDescription: provider.lineDescription ?? provider.title,
            consumerTaskId: consumer.id,
            consumerTaskTitle: consumer.title,
            consumerLineDescription: consumer.lineDescription ?? consumer.title,
          });
        }
      } else {
        missingRequirements.push({
          signal,
          normalizedSignal,
          isHard: consumer.hardSignal,
          consumerTaskId: consumer.id,
          consumerTaskTitle: consumer.title,
          consumerStageId: consumer.stageId,
          consumerLineId: consumer.lineId,
          consumerLineDescription: consumer.lineDescription ?? consumer.title,
          consumerTaskRequiresSignalCount: consumer.requiresSignals.length,
        });
      }
    }
  }

  const visited = new Set<string>();
  const recStack = new Set<string>();
  const cycles: ExecutionSignalCycle[] = [];
  const cycleFingerprints = new Set<string>();

  function detectCycle(taskId: string, path: string[]) {
    if (recStack.has(taskId)) {
      const cyclePath = formatCycle(path, taskId);
      const fingerprint = [...cyclePath].sort().join("|");
      if (!cycleFingerprints.has(fingerprint)) {
        cycles.push({ taskIds: cyclePath });
        cycleFingerprints.add(fingerprint);
      }
      return;
    }
    if (visited.has(taskId)) return;

    visited.add(taskId);
    recStack.add(taskId);
    const task = taskById.get(taskId);
    if (task) {
      for (const signal of task.requiresSignals) {
        const providers = providersBySignal.get(normalizeSignalKey(signal)) ?? [];
        for (const provider of providers) {
          detectCycle(provider.id, [...path, taskId]);
        }
      }
    }
    recStack.delete(taskId);
  }

  for (const task of tasks) {
    if (!visited.has(task.id)) {
      detectCycle(task.id, []);
    }
  }

  const hardMissingRequirements = missingRequirements.filter((missing) => missing.isHard);
  const softMissingRequirements = missingRequirements.filter((missing) => !missing.isHard);

  return {
    handshakes,
    missingRequirements,
    hardMissingRequirements,
    softMissingRequirements,
    cycles,
    providedSignalCount: providersBySignal.size,
    requiredSignalCount: new Set(
      tasks.flatMap((task) => task.requiresSignals.map((signal) => normalizeSignalKey(signal))),
    ).size,
  };
}

