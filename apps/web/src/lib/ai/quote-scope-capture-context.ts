import { parseIntakeNotes } from "@/lib/lead-display";

export type QuoteScopeCaptureSourceFlags = {
  includeIntakeNotes?: boolean;
  includeInternalQuoteNotes?: boolean;
  includeScopeSummary?: boolean;
};

export type BuildQuoteScopeCaptureContextInput = {
  captureText?: string | null;
  additionalInstructions?: string | null;
  quoteInternalNotes?: string | null;
  leadNotes?: string | null;
  leadScopeSummary?: string | null;
  sources?: QuoteScopeCaptureSourceFlags;
  priorMissingInfo?: string[];
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

/**
 * Builds merged context for Quick scope capture from user input and optional stored sources.
 */
export function buildQuoteScopeCaptureContext(
  input: BuildQuoteScopeCaptureContextInput,
): string | undefined {
  const sections: string[] = [];
  const sources = input.sources ?? {};

  const captureText = trimOrNull(input.captureText);
  if (captureText) {
    sections.push(`Work description:\n${captureText}`);
  }

  const additionalInstructions = trimOrNull(input.additionalInstructions);
  if (additionalInstructions) {
    sections.push(`Additional instructions:\n${additionalInstructions}`);
  }

  if (sources.includeScopeSummary !== false) {
    const scopeSummary = trimOrNull(input.leadScopeSummary);
    if (scopeSummary) {
      sections.push(`Lead scope summary:\n${scopeSummary}`);
    }
  }

  if (sources.includeInternalQuoteNotes !== false) {
    const quoteInternalNotes = trimOrNull(input.quoteInternalNotes);
    if (quoteInternalNotes) {
      sections.push(`Internal quote notes:\n${quoteInternalNotes}`);
    }
  }

  if (sources.includeIntakeNotes !== false) {
    const leadNotes = trimOrNull(input.leadNotes);
    if (leadNotes) {
      const parsed = parseIntakeNotes(leadNotes);
      if (parsed.isPublicIntake && parsed.parsedFields.length > 0) {
        const fieldLines = parsed.parsedFields.map((field) => `- ${field.label}: ${field.value}`);
        sections.push(`Intake / customer notes:\n${fieldLines.join("\n")}`);
        const cleanNotes = trimOrNull(parsed.cleanNotes);
        if (cleanNotes) {
          sections.push(`Intake raw notes:\n${cleanNotes}`);
        }
      } else {
        sections.push(`Intake / lead notes:\n${leadNotes}`);
      }
    }
  }

  const priorMissing = dedupeNonEmpty(input.priorMissingInfo ?? []);
  if (priorMissing.length > 0) {
    const detail = priorMissing.map((item) => `- ${item}`).join("\n");
    sections.push(
      `Previously flagged missing context:\n${detail}`,
    );
  }

  const merged = sections.join("\n\n---\n\n").trim();
  return merged.length > 0 ? merged : undefined;
}
