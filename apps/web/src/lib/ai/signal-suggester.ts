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

export function suggestSignalsForTask(title: string, category: string): SignalSuggestion {
  const t = title.toLowerCase();
  const suggestions: SignalSuggestion = { provides: [], requires: [] };

  if (t.includes("permit") || category === "PERMIT") {
    if (t.includes("apply") || t.includes("file")) {
      suggestions.provides = ["permit-applied"];
    } else if (t.includes("approved") || t.includes("receive") || t.includes("pick up")) {
      suggestions.requires = ["permit-applied"];
      suggestions.provides = ["permit-approved"];
    }
  }

  if (t.includes("inspection") || category === "INSPECTION") {
    suggestions.requires = ["permit-approved"];
    if (t.includes("rough")) {
      suggestions.provides = ["inspection:rough:passed"];
    } else if (t.includes("final")) {
      suggestions.provides = ["inspection:final:passed"];
    }
  }

  if (t.includes("material") || category === "MATERIAL") {
    if (t.includes("order")) {
      suggestions.provides = ["materials-ordered"];
    } else if (t.includes("deliver") || t.includes("receive")) {
      suggestions.requires = ["materials-ordered"];
      suggestions.provides = ["materials-on-site"];
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

  if (t.includes("rough-in") || t.includes("electrical") || t.includes("plumbing")) {
    suggestions.requires = ["framing-complete"];
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
  return task.provides.includes(signal);
}

function taskAlreadyRequires(task: CrossLineWiringLineInput["tasks"][number], signal: string): boolean {
  return task.requires.includes(signal);
}

function globalProvides(lines: CrossLineWiringLineInput[]): Set<string> {
  const provided = new Set<string>();
  for (const line of lines) {
    for (const task of line.tasks) {
      for (const signal of task.provides) {
        provided.add(signal);
      }
    }
  }
  return provided;
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
      if (task.provides.includes(signal)) {
        return { line, task };
      }
      const heuristic = suggestSignalsForTask(task.title, task.category);
      if (heuristic.provides.includes(signal)) {
        return { line, task };
      }
    }
  }
  return null;
}

/**
 * Cross-line signal wiring suggestions for quote execution review.
 */
export function suggestCrossLineWiring(lines: CrossLineWiringLineInput[]): CrossLineWiringSuggestion[] {
  const suggestions: CrossLineWiringSuggestion[] = [];
  const seen = new Set<string>();
  const providedGlobally = globalProvides(lines);

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
        if (providedGlobally.has(signal)) {
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

  return suggestions;
}

export function mergeSignalsForCrossLineApply(
  existing: string[],
  additions: string[],
): string[] {
  return mergeUniqueSignals(existing, additions);
}
