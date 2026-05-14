/**
 * AI Secretary — Signal Suggester
 * 
 * Heuristic-based "AI" that suggests signals based on task titles and categories.
 * In a production environment, this would call an LLM (Claude/Gemini) with the
 * full job context.
 */

export type SignalSuggestion = {
  provides: string[];
  requires: string[];
};

export function suggestSignalsForTask(title: string, category: string): SignalSuggestion {
  const t = title.toLowerCase();
  const suggestions: SignalSuggestion = { provides: [], requires: [] };

  // Heuristics for common contractor workflows
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

  // Construction specific handshakes
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

/**
 * Cross-line item signal wiring suggestions.
 * Looks for common patterns where one line item provides a signal another needs.
 */
export function suggestCrossLineWiring(lines: { id: string, description: string, tasks: { id: string, title: string, provides: string[], requires: string[] }[] }[]): { taskId: string, addRequires: string[] }[] {
  const suggestions: { taskId: string, addRequires: string[] }[] = [];
  
  // Example: If one line is "Roofing" and another is "Skylights", 
  // the skylight installation should probably wait for the roof to be prepped.
  
  const roofLine = lines.find(l => l.description.toLowerCase().includes("roof"));
  const skylightLine = lines.find(l => l.description.toLowerCase().includes("skylight"));

  if (roofLine && skylightLine) {
    const roofPrepTask = roofLine.tasks.find(t => t.title.toLowerCase().includes("remove") || t.title.toLowerCase().includes("prep"));
    const skylightInstallTask = skylightLine.tasks.find(t => t.title.toLowerCase().includes("install"));

    if (roofPrepTask && skylightInstallTask) {
      // Suggest wiring them if not already wired
      const signal = "roof-prepped";
      if (!roofPrepTask.provides.includes(signal)) {
        // In a real AI, we'd suggest adding 'provides' to the roof task too
      }
      if (!skylightInstallTask.requires.includes(signal)) {
        suggestions.push({ taskId: skylightInstallTask.id, addRequires: [signal] });
      }
    }
  }

  return suggestions;
}
