import {
  normalizeSignalKey,
  signalsEquivalent,
} from "@/lib/signal-key";
export { normalizeSignalKey, signalsEquivalent };

/**
 * AI Secretary — Signal Suggester
 *
 * Heuristic-based suggestions for task signals and cross-line wiring.
 * In production this can be backed by an LLM with full job context.
 */

export type SignalSuggestion = {
  provides: string[];
  requires: string[];
};

export type CrossLineWiringSuggestion = {
  suggestionKey: string;
  signal: string;
  consumerTaskId: string;
  consumerTaskTitle: string;
  consumerLineDescription: string;
  providerTaskId: string;
  providerTaskTitle: string;
  providerLineDescription: string;
};

export type UnresolvedWiringOrphan = {
  signal: string;
  consumerLineId: string;
  consumerTaskId: string;
  consumerTaskTitle: string;
  consumerLineDescription: string;
};

export type CrossLineWiringLineInput = {
  id: string;
  description: string;
  tasks: {
    id: string;
    title: string;
    category: string;
    provides: string[];
    requires: string[];
  }[];
};

export type CrossLineWiringAnalysis = {
  suggestions: CrossLineWiringSuggestion[];
  unresolvedOrphans: UnresolvedWiringOrphan[];
};

function taskExplicitlyProvidesSignal(
  task: CrossLineWiringLineInput["tasks"][number],
  signal: string,
): boolean {
  return task.provides.some((s) => signalsEquivalent(s, signal));
}

function taskHeuristicallyProvidesSignal(
  task: CrossLineWiringLineInput["tasks"][number],
  signal: string,
): boolean {
  const heuristic = suggestSignalsForTask(task.title, task.category);
  return heuristic.provides.some((s) => signalsEquivalent(s, signal));
}

function isSignalProvidedGlobally(lines: CrossLineWiringLineInput[], signal: string): boolean {
  for (const line of lines) {
    for (const task of line.tasks) {
      if (taskExplicitlyProvidesSignal(task, signal)) {
        return true;
      }
    }
  }
  return false;
}

type SemanticProviderMatcher = (title: string, category: string) => boolean;

const SEMANTIC_PROVIDER_MATCHERS: Record<string, SemanticProviderMatcher> = {
  "permit.approved": (title, category) => {
    const t = title.toLowerCase();
    return (
      (t.includes("permit") || category === "PERMIT") &&
      (t.includes("approv") || t.includes("confirm") || t.includes("receive") || t.includes("pick up"))
    );
  },
  "permit.submitted": (title, category) => {
    const t = title.toLowerCase();
    return (
      (t.includes("permit") || category === "PERMIT") &&
      (t.includes("submit") || t.includes("file") || t.includes("apply") || t.includes("prepare"))
    );
  },
  "material.ready": (title, category) => {
    const t = title.toLowerCase();
    return (
      (t.includes("material") || category === "MATERIAL") &&
      (t.includes("stage") ||
        t.includes("source") ||
        t.includes("ready") ||
        t.includes("deliver") ||
        t.includes("procure") ||
        t.includes("receive"))
    );
  },
  "install.scheduled": (title, category) => {
    const t = title.toLowerCase();
    return (
      t.includes("schedule") &&
      (t.includes("install") || category === "GENERAL" || category === "LABOR")
    );
  },
  "install.completed": (title, category) => {
    const t = title.toLowerCase();
    return t.includes("install") && !t.includes("schedule") && category !== "INSPECTION";
  },
  "site_verification.complete": (title) => {
    const t = title.toLowerCase();
    return (
      (t.includes("verify") || t.includes("verification") || t.includes("site visit") || t.includes("field verify")) &&
      !t.includes("schedule")
    );
  },
};

function semanticProviderMatcherForSignal(signal: string): SemanticProviderMatcher | null {
  const normalized = normalizeSignalKey(signal);
  for (const [canonical, matcher] of Object.entries(SEMANTIC_PROVIDER_MATCHERS)) {
    if (normalizeSignalKey(canonical) === normalized) {
      return matcher;
    }
  }
  return null;
}

export function suggestSignalsForTask(title: string, category: string): SignalSuggestion {
  const t = title.toLowerCase();
  const suggestions: SignalSuggestion = { provides: [], requires: [] };

  if (t.includes("permit") || category === "PERMIT") {
    if (t.includes("apply") || t.includes("file") || t.includes("submit") || t.includes("prepare")) {
      suggestions.provides = ["permit.submitted", "permit-applied"];
    } else if (t.includes("approved") || t.includes("approv") || t.includes("receive") || t.includes("pick up") || t.includes("confirm")) {
      suggestions.requires = ["permit.submitted", "permit-applied"];
      suggestions.provides = ["permit.approved", "permit-approved"];
    }
  }

  if (t.includes("inspection") || category === "INSPECTION") {
    suggestions.requires = ["permit.approved", "permit-approved"];
    if (t.includes("rough")) {
      suggestions.provides = ["inspection:rough:passed"];
    } else if (t.includes("final")) {
      suggestions.provides = ["inspection:final:passed", "inspection.final_passed"];
    }
  }

  if (t.includes("material") || category === "MATERIAL") {
    if (t.includes("order")) {
      suggestions.provides = ["materials-ordered"];
    } else if (
      t.includes("deliver") ||
      t.includes("receive") ||
      t.includes("stage") ||
      t.includes("source") ||
      t.includes("procure")
    ) {
      suggestions.provides = ["material.ready", "materials-on-site"];
    }
  }

  if (t.includes("payment") || category === "PAYMENT") {
    if (t.includes("deposit")) {
      suggestions.provides = ["payment:deposit:cleared"];
    } else if (t.includes("final")) {
      suggestions.provides = ["payment:final:cleared"];
    }
  }

  if (t.includes("demo") || t.includes("remove")) {
    suggestions.provides = ["demo-complete"];
  }

  if (t.includes("framing")) {
    suggestions.requires = ["demo-complete"];
    suggestions.provides = ["framing-complete"];
  }

  if (t.includes("rough-in") || t.includes("rough in")) {
    suggestions.requires = ["framing-complete"];
    suggestions.provides = ["mechanical-rough-in-complete"];
  } else if (t.includes("electrical") || t.includes("plumbing")) {
    suggestions.provides = ["mechanical-rough-in-complete"];
  }

  if (t.includes("drywall") || t.includes("sheetrock")) {
    suggestions.requires = ["mechanical-rough-in-complete", "inspection:rough:passed"];
    suggestions.provides = ["drywall-complete"];
  }

  if (t.includes("paint") || t.includes("finish")) {
    suggestions.requires = ["drywall-complete"];
    suggestions.provides = ["finishes-complete"];
  }

  return suggestions;
}

function mergeUniqueSignals(existing: string[], additions: string[]): string[] {
  return [...new Set([...existing, ...additions])];
}

function pushSuggestion(
  out: CrossLineWiringSuggestion[],
  seen: Set<string>,
  suggestion: CrossLineWiringSuggestion,
) {
  if (seen.has(suggestion.suggestionKey)) {
    return;
  }
  seen.add(suggestion.suggestionKey);
  out.push(suggestion);
}

function taskAlreadyProvides(task: CrossLineWiringLineInput["tasks"][number], signal: string): boolean {
  return task.provides.some((s) => signalsEquivalent(s, signal));
}

function taskAlreadyRequires(task: CrossLineWiringLineInput["tasks"][number], signal: string): boolean {
  return task.requires.some((s) => signalsEquivalent(s, signal));
}

function findProviderForOrphan(
  lines: CrossLineWiringLineInput[],
  signal: string,
  consumerTaskId: string,
): { line: CrossLineWiringLineInput; task: CrossLineWiringLineInput["tasks"][number] } | null {
  for (const line of lines) {
    for (const task of line.tasks) {
      if (task.id === consumerTaskId) {
        continue;
      }
      if (taskExplicitlyProvidesSignal(task, signal)) {
        return { line, task };
      }
    }
  }

  for (const line of lines) {
    for (const task of line.tasks) {
      if (task.id === consumerTaskId) {
        continue;
      }
      if (taskHeuristicallyProvidesSignal(task, signal)) {
        return { line, task };
      }
    }
  }

  const semanticMatcher = semanticProviderMatcherForSignal(signal);
  if (semanticMatcher) {
    for (const line of lines) {
      for (const task of line.tasks) {
        if (task.id === consumerTaskId) {
          continue;
        }
        if (semanticMatcher(task.title, task.category)) {
          return { line, task };
        }
      }
    }
  }

  return null;
}

function collectUnresolvedOrphans(
  lines: CrossLineWiringLineInput[],
  suggestions: CrossLineWiringSuggestion[],
): UnresolvedWiringOrphan[] {
  const suggestedKeys = new Set(suggestions.map((s) => `${s.consumerTaskId}:${normalizeSignalKey(s.signal)}`));
  const unresolved: UnresolvedWiringOrphan[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    for (const consumer of line.tasks) {
      for (const signal of consumer.requires) {
        const key = `${consumer.id}:${normalizeSignalKey(signal)}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);

        if (isSignalProvidedGlobally(lines, signal)) {
          continue;
        }
        if (suggestedKeys.has(key)) {
          continue;
        }

        unresolved.push({
          signal,
          consumerLineId: line.id,
          consumerTaskId: consumer.id,
          consumerTaskTitle: consumer.title,
          consumerLineDescription: line.description,
        });
      }
    }
  }

  return unresolved;
}

/**
 * Cross-line signal wiring suggestions for quote execution review.
 */
export function suggestCrossLineWiring(lines: CrossLineWiringLineInput[]): CrossLineWiringSuggestion[] {
  return analyzeCrossLineWiring(lines).suggestions;
}

/**
 * Full cross-line analysis: auto-wiring suggestions plus orphans that still need manual fixes.
 */
export function analyzeCrossLineWiring(lines: CrossLineWiringLineInput[]): CrossLineWiringAnalysis {
  const suggestions: CrossLineWiringSuggestion[] = [];
  const seen = new Set<string>();

  const roofLine = lines.find((l) => l.description.toLowerCase().includes("roof"));
  const skylightLine = lines.find((l) => l.description.toLowerCase().includes("skylight"));

  if (roofLine && skylightLine) {
    const roofPrepTask = roofLine.tasks.find(
      (t) =>
        t.title.toLowerCase().includes("remove") ||
        t.title.toLowerCase().includes("prep") ||
        t.title.toLowerCase().includes("tear"),
    );
    const skylightInstallTask = skylightLine.tasks.find((t) => t.title.toLowerCase().includes("install"));

    if (roofPrepTask && skylightInstallTask) {
      const signal = "roof-prepped";
      const needsConsumerRequire = !taskAlreadyRequires(skylightInstallTask, signal);
      const needsProviderProvide = !taskAlreadyProvides(roofPrepTask, signal);
      if (needsConsumerRequire || needsProviderProvide) {
        pushSuggestion(suggestions, seen, {
          suggestionKey: `${skylightInstallTask.id}:${signal}`,
          signal,
          consumerTaskId: skylightInstallTask.id,
          consumerTaskTitle: skylightInstallTask.title,
          consumerLineDescription: skylightLine.description,
          providerTaskId: roofPrepTask.id,
          providerTaskTitle: roofPrepTask.title,
          providerLineDescription: roofLine.description,
        });
      }
    }
  }

  for (const line of lines) {
    for (const consumer of line.tasks) {
      for (const signal of consumer.requires) {
        if (isSignalProvidedGlobally(lines, signal)) {
          continue;
        }
        const match = findProviderForOrphan(lines, signal, consumer.id);
        if (!match || match.task.id === consumer.id) {
          continue;
        }
        const needsConsumerRequire = !taskAlreadyRequires(consumer, signal);
        const needsProviderProvide = !taskAlreadyProvides(match.task, signal);
        if (!needsConsumerRequire && !needsProviderProvide) {
          continue;
        }
        pushSuggestion(suggestions, seen, {
          suggestionKey: `${consumer.id}:${signal}`,
          signal,
          consumerTaskId: consumer.id,
          consumerTaskTitle: consumer.title,
          consumerLineDescription: line.description,
          providerTaskId: match.task.id,
          providerTaskTitle: match.task.title,
          providerLineDescription: match.line.description,
        });
      }
    }
  }

  return {
    suggestions,
    unresolvedOrphans: collectUnresolvedOrphans(lines, suggestions),
  };
}

export function mergeSignalsForCrossLineApply(
  existing: string[],
  additions: string[],
): string[] {
  return mergeUniqueSignals(existing, additions);
}
