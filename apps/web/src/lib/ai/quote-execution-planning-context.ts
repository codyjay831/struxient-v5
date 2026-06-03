import { parseIntakeNotes } from "@/lib/lead-display";

export type ExecutionPlanningContextBucket =
  | "sold_scope"
  | "reusable_execution_guidance"
  | "job_technical_detail"
  | "site_access_schedule"
  | "customer_proposal"
  | "background";

export type ExecutionPlanningContextSource =
  | "line_internal_notes"
  | "customer_proposal"
  | "quote_internal_notes"
  | "lead_intake"
  | "manual"
  | "prior_missing";

export type ExecutionPlanningContextSourceFlags = {
  includeReusableExecutionGuidance?: boolean;
  includeJobTechnicalDetails?: boolean;
  includeSiteAccessSchedule?: boolean;
  includeCustomerProposal?: boolean;
  includeBackground?: boolean;
  includePriorMissingContext?: boolean;
};

export type ExecutionPlanningContextItem = {
  id: string;
  source: ExecutionPlanningContextSource;
  bucket: ExecutionPlanningContextBucket;
  label: string;
  content: string;
  includedByDefault: boolean;
};

export type ExecutionPlanningContextItemOverride = {
  include?: boolean;
  bucket?: ExecutionPlanningContextBucket;
};

export type ExecutionPlanningContextManifest = {
  items: ExecutionPlanningContextItem[];
};

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

function sectionizeInternalNotes(text: string): { heading: string | null; body: string }[] {
  const blocks = text
    .split(/\n{2,}/)
    .map((value) => value.trim())
    .filter(Boolean);
  if (blocks.length === 0) return [];
  return blocks.map((block) => {
    const lines = block.split("\n");
    const first = lines[0]?.trim() ?? "";
    const headingMatch = first.match(/^([A-Za-z][A-Za-z0-9 /()_-]{1,80}):$/);
    if (!headingMatch) {
      return { heading: null, body: block };
    }
    const body = lines.slice(1).join("\n").trim();
    return { heading: headingMatch[1], body: body || lines.slice(1).join("\n") };
  });
}

function toKnownHeading(heading: string | null): string | null {
  if (!heading) return null;
  const lower = heading.trim().toLowerCase();
  if (lower === "execution planning notes") return "Execution planning notes";
  if (lower === "line-specific details") return "Line-specific details";
  if (lower === "missing info (this line)") return "Missing info (this line)";
  return null;
}

export function resolveExecutionPlanningContextItemIncluded(
  bucket: ExecutionPlanningContextBucket,
  source: ExecutionPlanningContextSource,
  sourceFlags?: ExecutionPlanningContextSourceFlags,
): boolean {
  switch (bucket) {
    case "sold_scope":
      return true;
    case "reusable_execution_guidance":
      return sourceFlags?.includeReusableExecutionGuidance !== false;
    case "job_technical_detail":
      if (source === "prior_missing") {
        return sourceFlags?.includePriorMissingContext !== false;
      }
      return sourceFlags?.includeJobTechnicalDetails === true;
    case "site_access_schedule":
      return sourceFlags?.includeSiteAccessSchedule === true;
    case "customer_proposal":
      return sourceFlags?.includeCustomerProposal === true;
    case "background":
      return sourceFlags?.includeBackground === true;
    default:
      return false;
  }
}

function addItem(
  out: ExecutionPlanningContextItem[],
  counters: Record<ExecutionPlanningContextSource, number>,
  item: Omit<ExecutionPlanningContextItem, "id">,
) {
  counters[item.source] += 1;
  out.push({
    ...item,
    id: `${item.source}:${counters[item.source]}`,
  });
}

export function buildQuoteExecutionPlanningContextManifest(
  input: BuildQuoteExecutionPlanningContextInput,
): ExecutionPlanningContextManifest {
  const items: ExecutionPlanningContextItem[] = [];
  const counters: Record<ExecutionPlanningContextSource, number> = {
    line_internal_notes: 0,
    customer_proposal: 0,
    quote_internal_notes: 0,
    lead_intake: 0,
    manual: 0,
    prior_missing: 0,
  };

  const userInstructions = trimOrNull(input.userInstructions);
  if (userInstructions) {
    addItem(items, counters, {
      source: "manual",
      bucket: "reusable_execution_guidance",
      label: "User clarifications",
      content: userInstructions,
      includedByDefault: true,
    });
  }

  const lineInternalNotes = trimOrNull(input.lineInternalNotes);
  if (lineInternalNotes) {
    const blocks = sectionizeInternalNotes(lineInternalNotes);
    if (blocks.length === 0) {
      addItem(items, counters, {
        source: "line_internal_notes",
        bucket: "background",
        label: "Line internal notes",
        content: lineInternalNotes,
        includedByDefault: false,
      });
    } else {
      for (const block of blocks) {
        const known = toKnownHeading(block.heading);
        if (known === "Execution planning notes") {
          addItem(items, counters, {
            source: "line_internal_notes",
            bucket: "reusable_execution_guidance",
            label: known,
            content: block.body,
            includedByDefault: true,
          });
          continue;
        }
        if (known === "Line-specific details" || known === "Missing info (this line)") {
          addItem(items, counters, {
            source: "line_internal_notes",
            bucket: "job_technical_detail",
            label: known,
            content: block.body,
            includedByDefault: false,
          });
          continue;
        }
        addItem(items, counters, {
          source: "line_internal_notes",
          bucket: "background",
          label: block.heading ? `Line note: ${block.heading}` : "Line internal notes",
          content: block.body,
          includedByDefault: false,
        });
      }
    }
  }

  const customerScopeTitle = trimOrNull(input.customerScopeTitle);
  if (customerScopeTitle) {
    addItem(items, counters, {
      source: "customer_proposal",
      bucket: "sold_scope",
      label: "Customer scope title",
      content: customerScopeTitle,
      includedByDefault: true,
    });
  }

  const customerScopeDescription = trimOrNull(input.customerScopeDescription);
  if (customerScopeDescription) {
    addItem(items, counters, {
      source: "customer_proposal",
      bucket: "sold_scope",
      label: "Customer scope description",
      content: customerScopeDescription,
      includedByDefault: true,
    });
  }

  const customerIncludedNotes = trimOrNull(input.customerIncludedNotes);
  if (customerIncludedNotes) {
    addItem(items, counters, {
      source: "customer_proposal",
      bucket: "customer_proposal",
      label: "Customer included notes",
      content: customerIncludedNotes,
      includedByDefault: false,
    });
  }

  const customerExcludedNotes = trimOrNull(input.customerExcludedNotes);
  if (customerExcludedNotes) {
    addItem(items, counters, {
      source: "customer_proposal",
      bucket: "customer_proposal",
      label: "Customer excluded notes",
      content: customerExcludedNotes,
      includedByDefault: false,
    });
  }

  const quoteInternalNotes = trimOrNull(input.quoteInternalNotes);
  if (quoteInternalNotes) {
    addItem(items, counters, {
      source: "quote_internal_notes",
      bucket: "site_access_schedule",
      label: "Quote internal notes",
      content: quoteInternalNotes,
      includedByDefault: false,
    });
  }

  const leadNotes = trimOrNull(input.leadNotes);
  if (leadNotes) {
    const parsed = parseIntakeNotes(leadNotes);
    if (parsed.isPublicIntake && parsed.parsedFields.length > 0) {
      const fieldLines = parsed.parsedFields.map((field) => `- ${field.label}: ${field.value}`);
      addItem(items, counters, {
        source: "lead_intake",
        bucket: "site_access_schedule",
        label: "Lead intake context",
        content: fieldLines.join("\n"),
        includedByDefault: false,
      });
      const cleanNotes = trimOrNull(parsed.cleanNotes);
      if (cleanNotes) {
        addItem(items, counters, {
          source: "lead_intake",
          bucket: "background",
          label: "Lead intake raw notes",
          content: cleanNotes,
          includedByDefault: false,
        });
      }
    } else {
      addItem(items, counters, {
        source: "lead_intake",
        bucket: "site_access_schedule",
        label: "Lead notes",
        content: leadNotes,
        includedByDefault: false,
      });
    }
  }

  const priorMissing = dedupeNonEmpty(input.priorMissingContext ?? []);
  if (priorMissing.length > 0) {
    addItem(items, counters, {
      source: "prior_missing",
      bucket: "job_technical_detail",
      label: "Previously flagged missing context",
      content: priorMissing.map((item) => `- ${item}`).join("\n"),
      includedByDefault: true,
    });
  }

  return { items: items.filter((item) => trimOrNull(item.content)) };
}

export function buildQuoteExecutionPlanningContextFromManifest(
  manifest: ExecutionPlanningContextManifest,
  options?: {
    sourceFlags?: ExecutionPlanningContextSourceFlags;
    itemOverrides?: Record<string, ExecutionPlanningContextItemOverride>;
  },
): string | undefined {
  const sections = manifest.items
    .map((item) => {
      const override = options?.itemOverrides?.[item.id];
      const bucket = override?.bucket ?? item.bucket;
      const included =
        override?.include ??
        resolveExecutionPlanningContextItemIncluded(bucket, item.source, options?.sourceFlags);
      if (!included) return null;
      const content = trimOrNull(item.content);
      if (!content) return null;
      return `${item.label}:\n${content}`;
    })
    .filter(Boolean) as string[];
  const merged = sections.join("\n\n---\n\n").trim();
  return merged.length > 0 ? merged : undefined;
}

export function buildQuoteExecutionPlanningContext(
  input: BuildQuoteExecutionPlanningContextInput,
  options?: {
    sourceFlags?: ExecutionPlanningContextSourceFlags;
    itemOverrides?: Record<string, ExecutionPlanningContextItemOverride>;
  },
): string | undefined {
  const manifest = buildQuoteExecutionPlanningContextManifest(input);
  return buildQuoteExecutionPlanningContextFromManifest(manifest, options);
}

