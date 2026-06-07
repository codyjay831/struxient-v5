import { PaymentScheduleAnchorType, Prisma } from "@prisma/client";
import { readRequest } from "@/lib/lead/lead-projection";
import { formatMoneyCents, formatPaymentAnchorLabel } from "@/lib/quote-display";

export type QuotePaymentSchedulePreflight = {
  hasLineItems: boolean;
  hasExecutionPlan: boolean;
  hasPaymentTermsInNotes: boolean;
  hasExistingSchedule: boolean;
  quoteTotalCents: number;
  hasMinimumContext: boolean;
};

export type QuotePaymentScheduleContextInput = {
  quoteTitle: string | null;
  quoteTotalCents: number;
  quoteSubtotalCents: number;
  quoteInternalNotes: string | null;
  leadNotes: string | null;
  leadScopeSummary: string | null;
  lineItems: {
    description: string;
    customerScopeTitle: string | null;
    customerScopeDescription: string | null;
    lineTotalCents: number;
    internalNotes: string | null;
  }[];
  executionTasks: {
    lineDescription: string;
    title: string;
    category: string;
    stageName: string | null;
  }[];
  stages: { id: string; name: string }[];
  existingSchedule: {
    title: string;
    anchorType: PaymentScheduleAnchorType;
    anchorStageName: string | null;
    amountCents: number | null;
    percentage: string | null;
  }[];
  userInstructions?: string | null;
};

const PAYMENT_TERMS_PATTERN =
  /\b(deposit|upfront|progress payment|milestone|final balance|net[- ]?\d+|payment terms?|50\/50|30\/70|pay at|due upon|invoice)\b/i;

function trimOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatLineItem(line: QuotePaymentScheduleContextInput["lineItems"][number]): string {
  const parts = [`- ${line.description}`];
  if (line.customerScopeTitle && line.customerScopeTitle !== line.description) {
    parts.push(`  Customer title: ${line.customerScopeTitle}`);
  }
  if (line.customerScopeDescription) {
    parts.push(`  Customer scope: ${line.customerScopeDescription}`);
  }
  if (line.lineTotalCents > 0) {
    parts.push(`  Line total: ${formatMoneyCents(line.lineTotalCents)}`);
  }
  if (line.internalNotes) {
    parts.push(`  Internal notes: ${line.internalNotes}`);
  }
  return parts.join("\n");
}

function groupExecutionTasksByStage(
  tasks: QuotePaymentScheduleContextInput["executionTasks"],
): string {
  const byStage = new Map<string, { tasks: string[]; lines: Set<string> }>();

  for (const task of tasks) {
    const stageKey = task.stageName?.trim() || "Unassigned";
    const bucket = byStage.get(stageKey) ?? { tasks: [], lines: new Set<string>() };
    bucket.tasks.push(`${task.title} (${task.category})`);
    bucket.lines.add(task.lineDescription);
    byStage.set(stageKey, bucket);
  }

  return [...byStage.entries()]
    .map(([stageName, bucket]) => {
      const lineList = [...bucket.lines].slice(0, 5).join("; ");
      const taskSample = bucket.tasks.slice(0, 8).join("; ");
      return `- ${stageName}: ${bucket.tasks.length} task(s) across ${bucket.lines.size} line(s)${lineList ? ` [${lineList}]` : ""}\n  Sample tasks: ${taskSample}`;
    })
    .join("\n");
}

export function assessQuotePaymentSchedulePreflight(
  input: Pick<
    QuotePaymentScheduleContextInput,
    | "quoteTotalCents"
    | "quoteInternalNotes"
    | "leadNotes"
    | "leadScopeSummary"
    | "lineItems"
    | "executionTasks"
    | "existingSchedule"
  >,
): QuotePaymentSchedulePreflight {
  const hasLineItems = input.lineItems.length > 0;
  const hasExecutionPlan = input.executionTasks.length > 0;
  const notesBlob = [input.quoteInternalNotes, input.leadNotes, input.leadScopeSummary]
    .filter(Boolean)
    .join("\n");
  const hasPaymentTermsInNotes = PAYMENT_TERMS_PATTERN.test(notesBlob);
  const hasMinimumContext =
    hasLineItems ||
    Boolean(trimOrNull(input.quoteInternalNotes)) ||
    Boolean(trimOrNull(input.leadScopeSummary)) ||
    Boolean(trimOrNull(input.leadNotes)) ||
    hasExecutionPlan;

  return {
    hasLineItems,
    hasExecutionPlan,
    hasPaymentTermsInNotes,
    hasExistingSchedule: input.existingSchedule.length > 0,
    quoteTotalCents: input.quoteTotalCents,
    hasMinimumContext,
  };
}

export function buildQuotePaymentScheduleContextText(
  input: QuotePaymentScheduleContextInput,
): string {
  const sections: string[] = [];

  sections.push("COMMERCIAL SUMMARY");
  sections.push(`Quote title: ${input.quoteTitle?.trim() || "Untitled quote"}`);
  sections.push(`Quote total: ${formatMoneyCents(input.quoteTotalCents)}`);
  if (input.quoteSubtotalCents !== input.quoteTotalCents) {
    sections.push(`Quote subtotal: ${formatMoneyCents(input.quoteSubtotalCents)}`);
  }

  if (input.leadScopeSummary) {
    sections.push("\nLEAD SCOPE SUMMARY");
    sections.push(input.leadScopeSummary);
  }

  if (input.leadNotes) {
    sections.push("\nLEAD NOTES");
    sections.push(input.leadNotes);
  }

  if (input.quoteInternalNotes) {
    sections.push("\nQUOTE INTERNAL NOTES");
    sections.push(input.quoteInternalNotes);
  }

  if (input.lineItems.length > 0) {
    sections.push("\nSCOPE / LINE ITEMS");
    sections.push(input.lineItems.map(formatLineItem).join("\n"));
  }

  if (input.executionTasks.length > 0) {
    sections.push("\nEXECUTION PLAN (draft tasks by stage)");
    sections.push(groupExecutionTasksByStage(input.executionTasks));
  }

  if (input.stages.length > 0) {
    sections.push("\nAVAILABLE STAGES (for milestone anchors)");
    sections.push(input.stages.map((stage) => `- ${stage.name}`).join("\n"));
  }

  if (input.existingSchedule.length > 0) {
    sections.push("\nEXISTING PAYMENT SCHEDULE (will be replaced if user confirms)");
    sections.push(
      input.existingSchedule
        .map((item) => {
          const amount =
            item.anchorType === "FINAL_BALANCE"
              ? "Final balance (remainder)"
              : item.amountCents != null
                ? formatMoneyCents(item.amountCents)
                : item.percentage
                  ? `${item.percentage}% of total`
                  : "Amount TBD";
          return `- ${item.title}: ${amount} — ${formatPaymentAnchorLabel(item.anchorType, item.anchorStageName)}`;
        })
        .join("\n"),
    );
  }

  const instructions = trimOrNull(input.userInstructions);
  if (instructions) {
    sections.push("\nUSER INSTRUCTIONS");
    sections.push(instructions);
  }

  return sections.join("\n").trim();
}

export function buildQuotePaymentScheduleContextFromQuoteRow(row: {
  title: string | null;
  totalCents: number;
  subtotalCents: number;
  internalNotes: string | null;
  lead: { notes: string | null; request: Prisma.JsonValue | null } | null;
  lineItems: {
    description: string;
    customerScopeTitle: string | null;
    customerScopeDescription: string | null;
    lineTotalCents: number;
    internalNotes: string | null;
    draftExecutionTasks: {
      title: string;
      category: string;
      stage: { name: string } | null;
    }[];
  }[];
  paymentSchedule: {
    title: string;
    anchorType: PaymentScheduleAnchorType;
    anchorStageId: string | null;
    amountCents: number | null;
    percentage: { toString(): string } | null;
    anchorStage: { name: string } | null;
  }[];
  stages: { id: string; name: string }[];
}): QuotePaymentScheduleContextInput {
  const leadRequest = row.lead ? readRequest(row.lead.request) : null;

  return {
    quoteTitle: row.title,
    quoteTotalCents: row.totalCents,
    quoteSubtotalCents: row.subtotalCents,
    quoteInternalNotes: row.internalNotes,
    leadNotes: row.lead?.notes ?? null,
    leadScopeSummary: leadRequest?.scope ?? null,
    lineItems: row.lineItems.map((line) => ({
      description: line.description,
      customerScopeTitle: line.customerScopeTitle,
      customerScopeDescription: line.customerScopeDescription,
      lineTotalCents: line.lineTotalCents,
      internalNotes: line.internalNotes,
    })),
    executionTasks: row.lineItems.flatMap((line) =>
      line.draftExecutionTasks.map((task) => ({
        lineDescription: line.description,
        title: task.title,
        category: task.category,
        stageName: task.stage?.name ?? null,
      })),
    ),
    stages: row.stages,
    existingSchedule: row.paymentSchedule.map((item) => ({
      title: item.title,
      anchorType: item.anchorType,
      anchorStageName: item.anchorStage?.name ?? null,
      amountCents: item.amountCents,
      percentage: item.percentage?.toString() ?? null,
    })),
  };
}
