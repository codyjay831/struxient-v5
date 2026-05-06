import { LineItemTemplateTaskSource } from "@prisma/client";

/** Staff-facing source line for quote draft execution — no internal jargon. */
export function quoteLineDraftExecutionSourceLabel(row: {
  sourceLineItemTemplateTaskId: string | null | undefined;
  sourceType: LineItemTemplateTaskSource;
}): string {
  if (row.sourceLineItemTemplateTaskId) {
    return "Copied from saved line item";
  }
  if (row.sourceType === LineItemTemplateTaskSource.CUSTOM) {
    return "Custom task";
  }
  return "Reusable task copy";
}
