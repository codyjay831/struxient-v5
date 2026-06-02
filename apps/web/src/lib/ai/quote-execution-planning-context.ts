import { parseIntakeNotes } from "@/lib/lead-display";

type BuildQuoteExecutionPlanningContextInput = {
  userInstructions?: string | null;
  lineInternalNotes?: string | null;
  customerScopeTitle?: string | null;
  customerScopeDescription?: string | null;
  customerIncludedNotes?: string | null;
  customerExcludedNotes?: string | null;
  quoteInternalNotes?: string | null;
  leadNotes?: string | null;
  priorMissingContext?: string[];
};

function trimOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function dedupeNonEmpty(values: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = trimOrNull(value);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export function buildQuoteExecutionPlanningContext(
  input: BuildQuoteExecutionPlanningContextInput,
): string | undefined {
  const sections: string[] = [];

  const userInstructions = trimOrNull(input.userInstructions);
  if (userInstructions) {
    sections.push(`User clarifications:\n${userInstructions}`);
  }

  const lineInternalNotes = trimOrNull(input.lineInternalNotes);
  if (lineInternalNotes) {
    sections.push(`Line internal notes:\n${lineInternalNotes}`);
  }

  const customerScopeTitle = trimOrNull(input.customerScopeTitle);
  if (customerScopeTitle) {
    sections.push(`Customer scope title:\n${customerScopeTitle}`);
  }

  const customerScopeDescription = trimOrNull(input.customerScopeDescription);
  if (customerScopeDescription) {
    sections.push(`Customer scope description:\n${customerScopeDescription}`);
  }

  const customerIncludedNotes = trimOrNull(input.customerIncludedNotes);
  if (customerIncludedNotes) {
    sections.push(`Customer included notes:\n${customerIncludedNotes}`);
  }

  const customerExcludedNotes = trimOrNull(input.customerExcludedNotes);
  if (customerExcludedNotes) {
    sections.push(`Customer excluded notes:\n${customerExcludedNotes}`);
  }

  const quoteInternalNotes = trimOrNull(input.quoteInternalNotes);
  if (quoteInternalNotes) {
    sections.push(`Quote internal notes:\n${quoteInternalNotes}`);
  }

  const leadNotes = trimOrNull(input.leadNotes);
  if (leadNotes) {
    const parsed = parseIntakeNotes(leadNotes);
    if (parsed.isPublicIntake && parsed.parsedFields.length > 0) {
      const fieldLines = parsed.parsedFields.map((field) => `- ${field.label}: ${field.value}`);
      sections.push(`Lead intake context:\n${fieldLines.join("\n")}`);
      const cleanNotes = trimOrNull(parsed.cleanNotes);
      if (cleanNotes) {
        sections.push(`Lead intake raw notes:\n${cleanNotes}`);
      }
    } else {
      sections.push(`Lead notes:\n${leadNotes}`);
    }
  }

  const priorMissing = dedupeNonEmpty(input.priorMissingContext ?? []);
  if (priorMissing.length > 0) {
    const detail = priorMissing.map((item) => `- ${item}`).join("\n");
    sections.push(
      `Previously flagged missing context (resolve where possible using details above):\n${detail}`,
    );
  }

  const merged = sections.join("\n\n---\n\n").trim();
  return merged.length > 0 ? merged : undefined;
}

