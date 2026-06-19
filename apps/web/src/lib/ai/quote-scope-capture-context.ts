import type { CommercialContext } from "@/lib/ai/commercial-context";

export type QuoteScopeCaptureSourceFlags = {
  includeIntakeNotes?: boolean;
  includeInternalQuoteNotes?: boolean;
  includeScopeSummary?: boolean;
};

export type BuildQuoteScopeCaptureContextInput = {
  captureText?: string | null;
  additionalInstructions?: string | null;
  commercialContext: CommercialContext;
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
  const context = input.commercialContext;

  const captureText = trimOrNull(input.captureText);
  if (captureText) {
    sections.push(`Work description:\n${captureText}`);
  }

  const additionalInstructions = trimOrNull(input.additionalInstructions);
  if (additionalInstructions) {
    sections.push(`Additional instructions:\n${additionalInstructions}`);
  }

  if (sources.includeScopeSummary !== false) {
    const scopeSummary = trimOrNull(context.leadRequest?.scopeSummary);
    if (scopeSummary) {
      sections.push(`Lead scope summary (customer-stated):\n${scopeSummary}`);
    }
  }

  if (sources.includeInternalQuoteNotes !== false) {
    const quoteInternalNotes = trimOrNull(context.quote.internalNotes);
    if (quoteInternalNotes) {
      sections.push(`Internal quote notes (staff-only, not verified facts):\n${quoteInternalNotes}`);
    }
  }

  if (sources.includeIntakeNotes !== false) {
    const customerFields = context.leadNotes?.customerProvidedLines ?? [];
    if (customerFields.length > 0) {
      sections.push(
        `Customer-provided intake fields (not yet field-verified):\n${customerFields
          .map((field) => `- ${field}`)
          .join("\n")}`,
      );
    }
    const customerRaw = trimOrNull(context.leadNotes?.customerRawNotes);
    if (customerRaw) {
      sections.push(`Customer-provided raw notes (not yet field-verified):\n${customerRaw}`);
    }
    const internalLeadNotes = trimOrNull(context.leadNotes?.internalSalesNotes);
    if (internalLeadNotes) {
      sections.push(`Internal intake notes (staff-only, not verified facts):\n${internalLeadNotes}`);
    }
    if (context.latestVisit?.notes?.trim()) {
      sections.push(`Latest site visit findings (field-recorded):\n${context.latestVisit.notes.trim()}`);
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
