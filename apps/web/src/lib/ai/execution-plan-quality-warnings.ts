import { TaskTemplateCategory } from "@prisma/client";
import { normalizeStageLabel, type AllowedStage } from "./map-ai-stage";

/**
 * Quality / drift warnings for AI execution plans.
 *
 * These never block a proposal. They surface in the review panel so a human can
 * see when the model drifted away from the execution-gate posture (too many
 * tasks, invented payment work, filler tasks, mis-categorized inspection
 * scheduling, CamelCase signals, etc.). Real blocking happens at the apply
 * boundary in `validateQuoteAiExecutionPlanForApply`.
 */

/** Above this, simple single-trade plans should justify each extra task. */
export const SIMPLE_SCOPE_TASK_LIMIT = 8;

/** Titles that should not appear as standalone tasks by default. */
export const FORBIDDEN_FILLER_TASK_TITLES = [
  "Project Kickoff",
  "Scope Confirmation",
  "Crew Mobilization",
  "Site Setup",
  "Site Cleanup",
  "Final Cleanup",
  "Customer Walkthrough",
  "Customer Acceptance",
  "Final Documentation",
  "Project Closeout",
  "Archive Project",
  "Issue Final Invoice",
  "Collect Payment",
] as const;

const PAYMENT_MENTION_PATTERN =
  /\b(payment|billing|deposit|invoice|invoicing|collection|collect|payment hold|retainage|milestone payment)\b/i;

const INSPECTION_TITLE_PATTERN =
  /\b(inspection|ahj|authority having jurisdiction|rough[\s-]?in inspection|final inspection|sign[\s-]?off)\b/i;

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "will", "must",
  "have", "has", "are", "was", "were", "any", "all", "may", "can", "should",
  "could", "would", "before", "after", "during", "their", "there", "which",
  "when", "what", "whether", "confirm", "ensure", "needs", "need", "required",
  "require", "based", "about", "they", "them", "your", "yours",
]);

type QualityTask = {
  title: string;
  category: TaskTemplateCategory;
  instructions?: string | null;
  confidence?: number | null;
  providesSignals?: string[];
  requiresSignals?: string[];
};

export type ExecutionPlanQualityInput = {
  description: string;
  userInstructions?: string | null;
  assumptions: string[];
  missingContext: string[];
  tasks: QualityTask[];
  /** Pass true when payment/billing rules are known to apply to this scope. */
  paymentExplicitlyMentioned?: boolean;
};

function dedupe(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

/** True when the model used a category name as a stage that is not an allowed stage. */
export function isCategoryLikeStageNameNotAllowed(
  stageName: string | null | undefined,
  allowedStages: AllowedStage[],
): boolean {
  const raw = stageName?.trim();
  if (!raw) return false;

  const normalized = normalizeStageLabel(raw);
  const categoryLike = (Object.values(TaskTemplateCategory) as string[]).some(
    (category) => normalizeStageLabel(category.replace(/_/g, " ")) === normalized,
  );
  if (!categoryLike) return false;

  const isAllowed = allowedStages.some(
    (stage) => normalizeStageLabel(stage.name) === normalized,
  );
  return !isAllowed;
}

function isPaymentMentioned(input: ExecutionPlanQualityInput): boolean {
  if (input.paymentExplicitlyMentioned) return true;
  const haystack = `${input.description}\n${input.userInstructions ?? ""}`;
  return PAYMENT_MENTION_PATTERN.test(haystack);
}

function significantWords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !STOPWORDS.has(word));
  return new Set(words);
}

function sharesUnresolvedIssue(assumption: string, missing: string): boolean {
  const a = significantWords(assumption);
  const b = significantWords(missing);
  if (a.size === 0 || b.size === 0) return false;
  let overlap = 0;
  for (const word of a) {
    if (b.has(word)) overlap += 1;
  }
  return overlap >= 2;
}

/** Lowercase dot/underscore keys only (e.g. permit.approved). No CamelCase. */
function isCamelCaseSignal(signal: string): boolean {
  const trimmed = signal.trim();
  if (!trimmed) return false;
  return /[A-Z]/.test(trimmed);
}

export function collectExecutionPlanQualityWarnings(
  input: ExecutionPlanQualityInput,
): string[] {
  const warnings: string[] = [];
  const tasks = input.tasks ?? [];

  if (tasks.length > SIMPLE_SCOPE_TASK_LIMIT) {
    warnings.push(
      `Plan returned ${tasks.length} tasks. Simple single-trade scopes should target 5-8; confirm each extra task is a real execution gate.`,
    );
  }

  const overconfidentTitles = tasks
    .filter((task) => typeof task.confidence === "number" && task.confidence === 1)
    .map((task) => task.title);
  if (overconfidentTitles.length > 0) {
    warnings.push(
      `Tasks reported confidence 1.0 (no uncertainty): ${overconfidentTitles.join(", ")}. Review before trusting.`,
    );
  }

  const schedulingInspectionTitles = tasks
    .filter(
      (task) =>
        task.category === TaskTemplateCategory.SCHEDULING &&
        (INSPECTION_TITLE_PATTERN.test(task.title) ||
          INSPECTION_TITLE_PATTERN.test(task.instructions ?? "")),
    )
    .map((task) => task.title);
  if (schedulingInspectionTitles.length > 0) {
    warnings.push(
      `AHJ inspection scheduling should use category INSPECTION, not SCHEDULING: ${schedulingInspectionTitles.join(", ")}.`,
    );
  }

  if (!isPaymentMentioned(input)) {
    const paymentTitles = tasks
      .filter((task) => task.category === TaskTemplateCategory.PAYMENT)
      .map((task) => task.title);
    if (paymentTitles.length > 0) {
      warnings.push(
        `Payment tasks were generated but payment/billing is not mentioned in scope or instructions: ${paymentTitles.join(", ")}.`,
      );
    }
  }

  const fillerTitles = tasks
    .filter((task) => {
      const normalized = task.title.trim().toLowerCase();
      return FORBIDDEN_FILLER_TASK_TITLES.some((forbidden) =>
        normalized.includes(forbidden.toLowerCase()),
      );
    })
    .map((task) => task.title);
  if (fillerTitles.length > 0) {
    warnings.push(
      `Possible filler tasks that usually belong in checklist/proof/payment rules: ${fillerTitles.join(", ")}.`,
    );
  }

  const camelSignals = dedupe(
    tasks.flatMap((task) => [
      ...(task.providesSignals ?? []),
      ...(task.requiresSignals ?? []),
    ]),
  ).filter(isCamelCaseSignal);
  if (camelSignals.length > 0) {
    warnings.push(
      `Signals should use lowercase dot-key format (e.g. permit.approved). Found CamelCase: ${camelSignals.join(", ")}.`,
    );
  }

  const overlappingAssumptions = dedupe(
    input.assumptions.filter((assumption) =>
      input.missingContext.some((missing) =>
        sharesUnresolvedIssue(assumption, missing),
      ),
    ),
  );
  if (overlappingAssumptions.length > 0) {
    warnings.push(
      `These appear in both assumptions and missingContext — do not assume what is still unknown: ${overlappingAssumptions.join("; ")}.`,
    );
  }

  return dedupe(warnings);
}
