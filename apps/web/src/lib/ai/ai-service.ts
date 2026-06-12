import {
  TaskTemplateCategory,
  JobIssueType,
  JobIssueSeverity,
  StaffRole,
  PaymentScheduleAnchorType,
  Prisma,
} from "@prisma/client";
import {
  AILibraryProposal,
  AILibraryProposalSchema,
  AILibraryProposedTaskSchema,
} from "./library-proposal-schema";
import {
  buildSimulatedGenerationMeta,
  buildValidGenerationMeta,
  isAiSimulatedExecutionPlansEnabled,
  type AILibraryProposalGenerationResult,
} from "./ai-execution-plan-generation";
import {
  AiExecutionPlanInvalidError,
  AiProviderTemporarilyUnavailableError,
  isAiProviderTemporarilyUnavailable,
} from "./ai-provider-errors";
import { mapAiStageToStageId, parseStageIntent, type StageIntent } from "./map-ai-stage";
import { 
  getStagesForAiExecutionPlanning, 
  filterCorrectionsStageTasksFromAiProposal 
} from "./ai-execution-plan-corrections";
import { normalizeExecutionProposalTasks } from "./normalize-execution-proposal";
import {
  collectExecutionPlanQualityWarnings,
  isCategoryLikeStageNameNotAllowed,
} from "./execution-plan-quality-warnings";
import { AIRecoveryProposal, AIRecoveryProposalSchema } from "./recovery-proposal-schema";
import {
  QuoteScopeSuggestionsProposalSchema,
  type CommercialLineItemSuggestion,
  type LineItemDetailSuggestion,
  type OptionalAddOnSuggestion,
  type QuoteScopeSuggestionsGenerationResult,
  type QuoteScopeSuggestionsProposal,
  type RecommendedTemplateSuggestion,
} from "./quote-line-items-proposal-schema";
import { normalizeScopeSuggestionGrouping } from "./normalize-scope-suggestion-grouping";
import {
  QuotePaymentScheduleProposalSchema,
  type PaymentScheduleMilestoneSuggestion,
  type QuotePaymentScheduleGenerationResult,
  type QuotePaymentScheduleProposal,
} from "./quote-payment-schedule-proposal-schema";
import type { RecommendedTemplateMatch } from "./recommend-line-item-templates";
import {
  QuoteExecutionReviewProposalSchema,
  type QuoteExecutionReviewProposal,
} from "./quote-execution-review-proposal-schema";
import {
  ClarificationAnswerProposalSchema,
  type ClarificationAnswerGenerationResult,
  type ClarificationAnswerProposal,
  type ClarificationAnswerSuggestion,
} from "./clarification-answer-proposal-schema";
import {
  ClarificationQuestionSetProposalSchema,
  type ClarificationQuestionSetGenerationResult,
  type ClarificationQuestionSetProposal,
} from "./clarification-question-set-proposal-schema";
import {
  ExecutionContextAssessmentSchema,
  type ExecutionContextAssessment,
} from "./execution-context-assessment-schema";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { db } from "@/lib/db";
import { decideGroundedApnCandidate } from "@/lib/site-details/apn-candidate";
import {
  decideGroundedElectricUtilityCandidate,
  type UtilityCandidateDecisionReason,
} from "@/lib/site-details/utility-candidate";
import { canonicalizeElectricUtilityName } from "@/lib/site-details/utility-name";
import { researchGroundedSiteDetailsSources } from "@/lib/ai/site-details-grounded-research";
import { extractSiteDetailsFromGroundedResearch } from "@/lib/ai/site-details-extraction";
import { isSiteDetailsProviderError } from "@/lib/ai/site-details-provider-error";
import {
  getApprovedGroundedSourceById,
  type ApprovedGroundedSource,
} from "@/lib/ai/site-details-approved-sources";

function buildScopeSuggestionsGenerationMeta(simulated: boolean): QuoteScopeSuggestionsGenerationResult["generation"] {
  if (simulated) {
    const canApply = process.env.AI_ALLOW_APPLY_SIMULATED_EXECUTION_PLANS === "1";
    return {
      isSimulated: true,
      canApply,
      applyBlockedReason: canApply
        ? undefined
        : "This is demo AI output. Apply is disabled until demo apply is explicitly enabled.",
    };
  }
  return { isSimulated: false, canApply: true };
}

function buildPaymentScheduleGenerationMeta(
  simulated: boolean,
): QuotePaymentScheduleGenerationResult["generation"] {
  if (simulated) {
    const canApply = process.env.AI_ALLOW_APPLY_SIMULATED_EXECUTION_PLANS === "1";
    return {
      isSimulated: true,
      canApply,
      applyBlockedReason: canApply
        ? undefined
        : "This is demo AI output. Apply is disabled until demo apply is explicitly enabled.",
    };
  }
  return { isSimulated: false, canApply: true };
}

function deriveApnEvidenceFromApprovedSources(
  approvedSources: ApprovedGroundedSource[],
  addressLine: string,
  groundedSummary: string,
): Array<{
  value: string;
  sourceId: string;
  addressMatched: boolean;
  apnShownOnSource: boolean;
  explanation: string;
}> {
  const summaryLines = groundedSummary
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const propertyZip = addressLine.match(/\b\d{5}\b/)?.[0] ?? null;
  const zipPlus4Regex = /^\d{5}-\d{4}$/;
  const apnMentions: Array<{ value: string; sourceId: string | null; text: string }> = [];
  const apnRegex = /\b\d{3,5}(?:[-\s]?\d{2,5}){2,3}\b/g;
  const collectApnMentions = (text: string, sourceId: string | null) => {
    const line = text.trim();
    if (!line) return;
    const lower = line.toLowerCase();
    if (lower.includes("nearby") || lower.includes("neighbor") || lower.includes("for instance")) return;
    const matches = line.match(apnRegex) ?? [];
    for (const match of matches) {
      const trimmedMatch = match.trim();
      // Reject ZIP+4 (e.g. "94533-6338") which is not an APN.
      if (zipPlus4Regex.test(trimmedMatch)) continue;
      const digits = match.replace(/\D/g, "");
      if (digits.length < 9 || digits.length > 14) continue;
      // Reject sequences that are just the property's own ZIP padded with extra digits.
      if (propertyZip && digits.startsWith(propertyZip) && digits.length <= 9) continue;
      apnMentions.push({ value: trimmedMatch, sourceId, text: line });
    }
  };
  for (const line of summaryLines) {
    collectApnMentions(line, null);
  }
  for (const source of approvedSources) {
    collectApnMentions(`${source.title} ${decodeURIComponent(source.url)}`, source.id);
    for (const supportLine of source.supportText) {
      collectApnMentions(supportLine, source.id);
    }
  }
  const selectedApn = apnMentions[0] ?? null;
  if (!selectedApn) return [];

  const normalizedAddress = addressLine.trim().toLowerCase();
  const houseNumber = normalizedAddress.match(/\b\d+\b/)?.[0] ?? null;
  const streetToken =
    normalizedAddress
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .find((token) => token.length >= 4 && !/^\d+$/.test(token)) ?? null;
  const matchesAddress = (text: string): boolean => {
    if (!houseNumber || !streetToken) return true;
    const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
    return normalized.includes(houseNumber) && normalized.includes(streetToken);
  };
  const isTrustedListing = (text: string): boolean => {
    const lower = text.toLowerCase();
    return (
      lower.includes("zillow.com") ||
      lower.includes("redfin.com") ||
      lower.includes("realtor.com") ||
      lower.includes("compass.com")
    );
  };

  const preferredSourceFromMention =
    selectedApn.sourceId ? approvedSources.find((source) => source.id === selectedApn.sourceId) ?? null : null;
  const preferredSource =
    preferredSourceFromMention ??
    approvedSources.find((source) => {
      const text = `${source.title} ${source.url} ${source.supportText.join(" ")}`;
      return isTrustedListing(text) && matchesAddress(text);
    }) ??
    approvedSources.find((source) => {
      const text = `${source.title} ${source.url} ${source.supportText.join(" ")}`;
      return matchesAddress(text);
    }) ??
    null;

  if (!preferredSource) return [];
  return [
    {
      value: selectedApn.value,
      sourceId: preferredSource.id,
      addressMatched: true,
      apnShownOnSource: true,
      explanation: "Derived from grounded APN mention in source support/summary with trusted/address-matched source.",
    },
  ];
}

/**
 * AI Service for Execution Planning
 * 
 * This service interfaces with an LLM (Gemini) to generate
 * realistic execution plans based on commercial line item descriptions.
 */

export type AIExecutionPlanContext = {
  organizationId: string;
  templateId: string;
  description: string;
  tags: string[];
  organizationName?: string;
  trade?: string;
  existingStages: { id: string; name: string }[];
  existingSignals: string[];
  userInstructions?: string;
};

export type AIQuoteExecutionReviewContext = {
  quoteId: string;
  quoteTitle: string;
  organizationId: string;
  existingStages: { id: string; name: string }[];
  lines: {
    id: string;
    description: string;
    tasks: {
      id: string;
      title: string;
      category: string;
      stageId: string | null;
      stageName: string | null;
      providesSignals: string[];
      requiresSignals: string[];
      hardSignal: boolean;
    }[];
  }[];
  currentSummary: {
    totalTasks: number;
    orphanCount: number;
    hardOrphanCount: number;
  };
  deterministicSuggestions: {
    signal: string;
    consumerTaskId: string;
    providerTaskId: string;
    consumerTaskTitle: string;
    providerTaskTitle: string;
  }[];
};

export type AIQuoteExecutionReviewProposalGenerationResult = {
  proposal: QuoteExecutionReviewProposal;
  generation: AILibraryProposalGenerationResult["generation"];
};

export type AISiteDetailsResearchResult = {
  electricUtilityCandidate: {
    name: string;
    officialWebsite: string | null;
    serviceUpgradeUrl: string | null;
    coverageSourceTitle: string;
    coverageSourceUrl: string;
    coverageBasis: "ZIP" | "CITY" | "COUNTY" | "ADDRESS";
    addressMatched: boolean;
    isElectric: boolean;
    explanation: string;
  } | null;
  jurisdictionName: string | null;
  jurisdictionType: "CITY" | "COUNTY" | "UNINCORPORATED_COUNTY" | "DISTRICT" | null;
  jurisdictionOfficialWebsite: string | null;
  countyAssessorCounty: string | null;
  countyAssessorState: string | null;
  countyAssessorSearchUrl: string | null;
  apnEvidence: Array<{
    value: string;
    sourceTitle: string;
    sourceUrl: string;
    addressMatched: boolean;
    apnShownOnSource: boolean;
    explanation: string;
  }>;
  apnCandidate: {
    value: string;
    sourceTitle: string;
    sourceUrl: string;
    addressMatched: boolean;
    apnShownOnSource: boolean;
    explanation: string;
  } | null;
  sourceLinks: Array<{ title: string; url: string }>;
  approvedSources: ApprovedGroundedSource[];
  scopeDecisions: {
    apn: SiteDetailsScopeDecision;
    electricUtility: SiteDetailsScopeDecision;
    jurisdiction: SiteDetailsScopeDecision;
    assessor: SiteDetailsScopeDecision;
  };
  diagnostics?: {
    normalizedAddress: string;
    requestedScopes: string[];
    groundingToolEnabled: boolean;
    groundingMetadataPresent: boolean;
    groundingSearchQueries: string[];
    groundingSourceUrls: string[];
    rawApnCandidate: string | null;
    normalizedApnCandidate: string | null;
    apnEvidenceSources: string[];
    exactAddressEvidenceMatch: boolean;
    neighborEvidenceDetected: boolean;
    apnDecision: "accepted" | "rejected" | "none";
    apnDecisionReason: string;
    rawUtilityCandidate: string | null;
    normalizedUtilityAlias: string | null;
    utilityDecision: "accepted" | "rejected" | "none";
    utilityDecisionReason: UtilityCandidateDecisionReason | "GROUNDING_METADATA_MISSING";
    overallOutcome: "FULL_SUCCESS" | "PARTIAL_RESEARCH_SUCCESS" | "NO_ACCEPTED_RESULTS";
  };
  usageLogId?: string;
};

type SiteDetailsScopeDecision = {
  outcome: "ACCEPTED" | "REJECTED" | "NOT_FOUND";
  decisionCode:
    | "ACCEPTED"
    | "NOT_FOUND"
    | "UNKNOWN_SOURCE_REFERENCE"
    | "APN_EVIDENCE_NOT_APPROVED"
    | "APN_ADDRESS_MISMATCH"
    | "APN_NEIGHBOR_EVIDENCE"
    | "APN_NOT_EXPLICITLY_SUPPORTED"
    | "UTILITY_COVERAGE_EVIDENCE_NOT_APPROVED"
    | "UTILITY_CANONICAL_MATCH_FAILED"
    | "OPTIONAL_RESOURCE_URL_DROPPED"
    | "PROTECTED_NOT_WRITTEN"
    | "PARTIAL_RESEARCH_SUCCESS";
  candidatePresent: boolean;
  sourceReferences: string[];
  sourceReferencesResolved: string[];
  writeAttempted: boolean;
  writeApplied: boolean;
  details?: Record<string, unknown>;
};

const SiteDetailsResearchSchema = z.object({
  electricUtilityCandidate: z
    .object({
      name: z.string().trim().min(1),
      coverageSourceId: z.string().trim().min(1).nullable(),
      coverageBasis: z.enum(["ZIP", "CITY", "COUNTY", "ADDRESS"]).nullable(),
      addressMatched: z.boolean(),
      isElectric: z.boolean(),
      explanation: z.string().trim().min(1).max(500),
    })
    .nullable(),
  jurisdictionName: z.string().trim().min(1).nullable(),
  jurisdictionType: z
    .enum(["CITY", "COUNTY", "UNINCORPORATED_COUNTY", "DISTRICT"])
    .nullable(),
  jurisdictionSourceId: z.string().trim().min(1).nullable().optional().default(null),
  countyAssessorCounty: z.string().trim().min(1).nullable(),
  countyAssessorState: z.string().trim().min(1).nullable(),
  countyAssessorSourceId: z.string().trim().min(1).nullable().optional().default(null),
  apnEvidence: z
    .array(
      z.object({
        value: z.string().trim().min(1),
        sourceId: z.string().trim().min(1),
        addressMatched: z.boolean(),
        apnShownOnSource: z.boolean(),
        explanation: z.string().trim().min(1).max(500),
      }),
    )
    .default([]),
  apnCandidate: z
    .object({
      value: z.string().trim().min(1),
      sourceId: z.string().trim().min(1),
      addressMatched: z.boolean(),
      apnShownOnSource: z.boolean(),
      explanation: z.string().trim().min(1).max(500),
    })
    .nullable()
    .optional()
    .default(null),
});

export class AIService {
  private static readonly DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
  /** Per-attempt ceiling so server actions do not hang until the client gives up. */
  private static readonly GEMINI_REQUEST_TIMEOUT_MS = 90_000;

  private static getGeminiClient() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    return new GoogleGenerativeAI(apiKey);
  }

  /** Parse Gemini JSON output, repairing intermittent trailing commas before `}`/`]`. */
  private static parseGeminiJsonResponse(text: string): unknown {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : text.trim();
    try {
      return JSON.parse(jsonStr);
    } catch (firstError) {
      const repaired = jsonStr.replace(/,\s*([}\]])/g, "$1");
      try {
        return JSON.parse(repaired);
      } catch {
        throw firstError;
      }
    }
  }

  /**
   * Coerces a (possibly messy) AI-returned category string into a valid
   * TaskTemplateCategory enum value. Returns `null` if no plausible mapping
   * exists, so the caller can fall back to GENERAL and emit a warning.
   */
  private static normalizeCategory(raw: unknown): TaskTemplateCategory | null {
    if (raw == null) return null;

    let value = String(raw).trim();
    if (!value) return null;

    // Strip wrapping quotes/backticks the model sometimes adds.
    value = value.replace(/^["'`]+|["'`]+$/g, "").trim();
    if (!value) return null;

    const upper = value.toUpperCase().replace(/[\s-]+/g, "_");

    const validValues = Object.values(TaskTemplateCategory) as string[];
    if (validValues.includes(upper)) {
      return upper as TaskTemplateCategory;
    }

    // Fuzzy alias mapping for common AI hallucinations.
    if (/(PERMIT|AHJ|JURISDICTION|LICENS)/.test(upper)) return TaskTemplateCategory.PERMIT;
    if (/(INSPECT|SIGN_?OFF|FINAL_?CHECK)/.test(upper)) return TaskTemplateCategory.INSPECTION;
    if (/(MATERIAL|ORDER|DELIVERY|SUPPLY|PROCURE|STOCK|PARTS)/.test(upper)) return TaskTemplateCategory.MATERIAL;
    if (/(PAY|INVOICE|DEPOSIT|BILLING|FINANCE)/.test(upper)) return TaskTemplateCategory.PAYMENT;
    if (/(CUSTOMER|CLIENT|EMAIL|PHONE|CALL|COMMUNICAT|NOTIFY|MESSAGE|HOMEOWNER)/.test(upper)) return TaskTemplateCategory.CUSTOMER_COMMUNICATION;
    if (/(PHOTO|IMAGE|EVIDENCE|DOCUMENT|UPLOAD|PROOF)/.test(upper)) return TaskTemplateCategory.PHOTO_EVIDENCE;
    if (/(SCHEDUL|APPOINT|CALENDAR|BOOK|DISPATCH)/.test(upper)) return TaskTemplateCategory.SCHEDULING;
    if (/(GENERAL|MISC|OTHER|TASK|WORK|EXEC|INSTALL|PREP|DEMO|FRAMING|FINISH|SETUP|SAFETY|CLEAN)/.test(upper)) return TaskTemplateCategory.GENERAL;

    return null;
  }

  /**
   * Maps model-returned confidence (often 0–100) into [0, 1] for Zod.
   * Returns `undefined` when absent or non-numeric so schema defaults apply.
   */
  private static normalizeConfidenceToUnitInterval(raw: unknown): number | undefined {
    if (raw == null) return undefined;
    const n =
      typeof raw === "number"
        ? raw
        : typeof raw === "string" && String(raw).trim() !== ""
          ? Number(String(raw).trim())
          : NaN;
    if (!Number.isFinite(n)) return undefined;
    if (n >= 0 && n <= 1) return Math.min(1, Math.max(0, n));
    if (n > 1 && n <= 100) return Math.min(1, Math.max(0, n / 100));
    if (n > 100) return 1;
    return 0;
  }

  /**
   * Returns true for errors that are worth retrying:
   * - Low-level fetch/network failures ("fetch failed", ECONNRESET, ETIMEDOUT, etc.)
   * - HTTP 5xx (server-side hiccups)
   * - HTTP 429 (rate limit)
   * Returns false for hard 4xx (auth, bad model, bad request) — those won't fix themselves.
   */
  private static isRetryableError(error: unknown): boolean {
    if (isAiProviderTemporarilyUnavailable(error)) {
      return true;
    }

    if (!(error instanceof Error)) return false;

    const msg = error.message.toLowerCase();
    return (
      msg.includes("fetch failed") ||
      msg.includes("econnreset") ||
      msg.includes("etimedout") ||
      msg.includes("econnrefused") ||
      msg.includes("enotfound") ||
      msg.includes("network") ||
      msg.includes("socket hang up") ||
      msg.includes("und_err")
    );
  }

  private static async withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    message = "AI took too long to respond. Try again in a moment.",
  ): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timeoutId = setTimeout(
            () => reject(new AiProviderTemporarilyUnavailableError(message)),
            ms,
          );
        }),
      ]);
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Runs `op` with up to `maxAttempts` tries, backing off exponentially with
   * a small jitter. Only retries when `isRetryableError` returns true.
   */
  private static async retryWithBackoff<T>(
    op: () => Promise<T>,
    maxAttempts = 3,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await op();
      } catch (e) {
        lastError = e;
        if (attempt === maxAttempts || !this.isRetryableError(e)) {
          throw e;
        }
        const baseMs = 300 * Math.pow(3, attempt - 1); // 300, 900, 2700
        const jitter = Math.floor(Math.random() * 200);
        const delay = baseMs + jitter;
        console.warn(
          `Gemini call failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms:`,
          e instanceof Error ? e.message : e,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }

  private static logInvalidExecutionPlanDetails(error: unknown): void {
    if (error instanceof z.ZodError) {
      console.error(
        "AI execution plan validation failed",
        error.issues.map((i) => ({
          path: i.path.join(".") || "(root)",
          code: i.code,
          message: i.message,
        })),
      );
      return;
    }
    console.error("AI execution plan generation failed", error);
  }

  /**
   * Validate AI tasks against the proposed task schema and split into
   * accepted vs dropped. We do NOT throw on per-task failures — one bad
   * task from the model should not kill an otherwise usable plan. The
   * caller surfaces dropped-task warnings in the proposal, and only
   * throws if zero tasks survive.
   */
  private static partitionValidProposedTasks(
    tasks: Record<string, unknown>[],
  ): { validTasks: Record<string, unknown>[]; droppedWarnings: string[] } {
    const validTasks: Record<string, unknown>[] = [];
    const droppedWarnings: string[] = [];
    const droppedLogEntries: {
      taskIndex: number;
      title: string | null;
      issues: { path: string; message: string; code: string }[];
    }[] = [];

    for (let index = 0; index < tasks.length; index++) {
      const raw = tasks[index];
      const parsed = AILibraryProposedTaskSchema.safeParse(raw);
      if (parsed.success) {
        validTasks.push(raw);
        continue;
      }

      const title = typeof raw?.title === "string" && raw.title.trim() !== ""
        ? raw.title.trim()
        : null;
      const taskLabel = title ? `"${title}"` : `Task ${index + 1}`;
      const issueDescriptions = parsed.error.issues.map((i) => ({
        path: i.path.join(".") || "(root)",
        message: i.message,
        code: i.code,
      }));

      droppedLogEntries.push({
        taskIndex: index + 1,
        title,
        issues: issueDescriptions,
      });

      const issueSummary = issueDescriptions
        .map((i) => `${i.path}: ${i.message}`)
        .join("; ");
      droppedWarnings.push(
        `${taskLabel}: AI returned an invalid task and it was dropped (${issueSummary}).`,
      );
    }

    if (droppedLogEntries.length > 0) {
      console.error(
        "AI execution plan dropped invalid tasks",
        JSON.stringify(droppedLogEntries, null, 2),
      );
    }

    return { validTasks, droppedWarnings };
  }

  /**
   * Generates a realistic execution plan for a given line item template.
   */
  static async generateLibraryExecutionPlan(
    context: AIExecutionPlanContext
  ): Promise<AILibraryProposalGenerationResult> {
    const gemini = this.getGeminiClient();

    if (!gemini) {
      if (isAiSimulatedExecutionPlansEnabled()) {
        console.warn("GEMINI_API_KEY missing. Returning simulated demo output (dev flag enabled).");
        const proposal = await this.simulateLibraryExecutionPlan(context, {
          reason: "GEMINI_API_KEY is missing.",
        });
        return { proposal, generation: buildSimulatedGenerationMeta() };
      }
      console.error("GEMINI_API_KEY missing; refusing simulated execution plan fallback.");
      throw new AiProviderTemporarilyUnavailableError();
    }

    // Fetch reusable tasks that match the line item tags
    const reusableTasks = await db.taskTemplate.findMany({
      where: {
        organizationId: context.organizationId,
        tags: { some: { name: { in: context.tags.map(t => t.toLowerCase()) } } },
        archivedAt: null,
      },
      include: { stage: { select: { name: true } }, tags: { select: { name: true } } },
    });

    const planningStages = getStagesForAiExecutionPlanning(context.existingStages);

    try {
      const modelName = process.env.GEMINI_MODEL?.trim() || this.DEFAULT_GEMINI_MODEL;
      // JSON mode: ask the model to return raw application/json so we are not
      // dependent on stripping ```json fences. We keep the regex extraction
      // below as a belt-and-braces fallback for models/SDKs that ignore this.
      const model = gemini.getGenerativeModel({
        model: modelName,
        generationConfig: { responseMimeType: "application/json" },
      });

      const prompt = this.buildContractorRealismPrompt(context, planningStages, reusableTasks);

      const result = await this.retryWithBackoff(() =>
        this.withTimeout(model.generateContent(prompt), this.GEMINI_REQUEST_TIMEOUT_MS),
      );
      const response = await result.response;
      const text = response.text();
      
      // Extract JSON from response (Gemini sometimes wraps in markdown blocks)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : text;
      
      const rawProposal = JSON.parse(jsonStr);

      // Normalize categories and track which ones we had to coerce.
      const normalizationWarnings: string[] = [];
      const stageMappingWarnings: string[] = [];
      const normalizedTasks = (Array.isArray(rawProposal.tasks) ? rawProposal.tasks : []).map(
        (t: Record<string, unknown>, idx: number) => {
          const originalCategory = t?.category;
          const matched = this.normalizeCategory(originalCategory);
          const finalCategory = matched ?? TaskTemplateCategory.GENERAL;

          if (!matched && originalCategory != null && String(originalCategory).trim() !== "") {
            const taskLabel = t?.title ? `"${t.title}"` : `Task ${idx + 1}`;
            normalizationWarnings.push(
              `${taskLabel}: AI returned unknown category "${originalCategory}" — defaulted to General.`,
            );
          }

          const stageMapping = mapAiStageToStageId({
            stageName: t?.stageName as string | undefined,
            stageKey: t?.stageKey as string | undefined,
            stageIntent: parseStageIntent(t?.stageIntent),
            allowedStages: planningStages,
          });

          if (stageMapping.warning) {
            const taskLabel = t?.title ? `"${t.title}"` : `Task ${idx + 1}`;
            stageMappingWarnings.push(`${taskLabel}: ${stageMapping.warning}`);
          } else if (stageMapping.confidence === "unmapped" && stageMapping.reason) {
            const taskLabel = t?.title ? `"${t.title}"` : `Task ${idx + 1}`;
            stageMappingWarnings.push(`${taskLabel}: ${stageMapping.reason}`);
          }

          if (
            isCategoryLikeStageNameNotAllowed(
              t?.stageName as string | undefined,
              planningStages,
            )
          ) {
            const taskLabel = t?.title ? `"${t.title}"` : `Task ${idx + 1}`;
            stageMappingWarnings.push(
              `${taskLabel}: stage "${t?.stageName}" looks like a task category, not an allowed stage. Review the assigned stage before applying.`,
            );
          }

          return {
            ...t,
            category: finalCategory,
            tempId: crypto.randomUUID(),
            assigneeRole:
              typeof t?.assigneeRole === "string" &&
              (Object.values(StaffRole) as string[]).includes(t.assigneeRole)
                ? (t.assigneeRole as StaffRole)
                : null,
            stageId: stageMapping.stageId,
            stageName:
              stageMapping.stageId != null
                ? planningStages.find((s) => s.id === stageMapping.stageId)?.name ??
                  (t?.stageName as string | undefined)
                : (t?.stageName as string | undefined),
          };
        },
      );

      const baseAssumptions = Array.isArray(rawProposal.assumptions) ? rawProposal.assumptions : [];
      const baseWarnings = Array.isArray(rawProposal.warnings) ? rawProposal.warnings : [];
      const baseMissingContext = Array.isArray(rawProposal.missingContext)
        ? rawProposal.missingContext.filter((value: unknown) => typeof value === "string")
        : [];

      const { validTasks, droppedWarnings } = this.partitionValidProposedTasks(normalizedTasks);

      if (validTasks.length === 0 && normalizedTasks.length > 0) {
        throw new AiExecutionPlanInvalidError();
      }
      const normalizedResult = normalizeExecutionProposalTasks(
        validTasks.map((task) => AILibraryProposedTaskSchema.parse(task)),
      );

      const qualityWarnings = collectExecutionPlanQualityWarnings({
        description: context.description,
        userInstructions: context.userInstructions,
        assumptions: baseAssumptions,
        missingContext: baseMissingContext,
        tasks: normalizedResult.tasks.map((task) => ({
          title: task.title,
          category: task.category,
          instructions: task.instructions,
          confidence: task.confidence,
          providesSignals: task.providesSignals,
          requiresSignals: task.requiresSignals,
        })),
      });

      const proposal = {
        ...rawProposal,
        templateId: context.templateId,
        sourceContext: context.description,
        assumptions: baseAssumptions,
        missingContext: baseMissingContext,
        cleanupNotes: normalizedResult.cleanupNotes,
        warnings: [
          ...baseWarnings,
          ...normalizationWarnings,
          ...stageMappingWarnings,
          ...droppedWarnings,
          ...qualityWarnings,
        ],
        tasks: normalizedResult.tasks,
      };

      const { proposal: filteredProposal } = filterCorrectionsStageTasksFromAiProposal(
        proposal,
        context.existingStages
      );

      const parsedProposal = AILibraryProposalSchema.parse(filteredProposal);
      return { proposal: parsedProposal, generation: buildValidGenerationMeta() };
    } catch (e) {
      if (isAiProviderTemporarilyUnavailable(e)) {
        throw new AiProviderTemporarilyUnavailableError();
      }

      if (e instanceof AiExecutionPlanInvalidError) {
        throw e;
      }

      this.logInvalidExecutionPlanDetails(e);

      if (e instanceof z.ZodError || e instanceof SyntaxError) {
        throw new AiExecutionPlanInvalidError();
      }

      if (isAiSimulatedExecutionPlansEnabled()) {
        console.warn("Gemini generation failed; returning simulated demo output (dev flag enabled).", e);
        const proposal = await this.simulateLibraryExecutionPlan(context, {
          reason: e instanceof Error ? e.message : "Unknown AI provider error.",
        });
        return { proposal, generation: buildSimulatedGenerationMeta() };
      }

      throw new AiProviderTemporarilyUnavailableError();
    }
  }

  static async assessExecutionPlanningContext(
    context: AIExecutionPlanContext,
  ): Promise<ExecutionContextAssessment> {
    const gemini = this.getGeminiClient();
    const planningStages = getStagesForAiExecutionPlanning(context.existingStages);

    if (!gemini) {
      if (isAiSimulatedExecutionPlansEnabled()) {
        return this.simulateExecutionContextAssessment(context, {
          reason: "GEMINI_API_KEY is missing.",
        });
      }
      throw new AiProviderTemporarilyUnavailableError();
    }

    try {
      const modelName = process.env.GEMINI_MODEL?.trim() || this.DEFAULT_GEMINI_MODEL;
      const model = gemini.getGenerativeModel({ model: modelName });
      const prompt = this.buildExecutionContextAssessmentPrompt(context, planningStages);
      const result = await this.retryWithBackoff(() =>
        this.withTimeout(model.generateContent(prompt), this.GEMINI_REQUEST_TIMEOUT_MS),
      );
      const response = await result.response;
      const text = response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : text;
      const raw = JSON.parse(jsonStr);
      return ExecutionContextAssessmentSchema.parse(raw);
    } catch (e) {
      if (isAiProviderTemporarilyUnavailable(e)) {
        throw new AiProviderTemporarilyUnavailableError();
      }
      if (isAiSimulatedExecutionPlansEnabled()) {
        return this.simulateExecutionContextAssessment(context, {
          reason: e instanceof Error ? e.message : "Unknown AI provider error.",
        });
      }
      throw new AiProviderTemporarilyUnavailableError(
        "AI could not assess missing execution context right now. Try again shortly.",
      );
    }
  }

  private static buildExecutionContextAssessmentPrompt(
    context: AIExecutionPlanContext,
    planningStages: { id: string; name: string }[],
  ): string {
    const stageNames = planningStages.map((s) => s.name).join(", ");
    const signalNames = context.existingSignals.join(", ");
    return `
You are a contractor execution preflight assistant.
Determine what context is already known and what context is still missing BEFORE drafting execution tasks.

LINE ITEM DESCRIPTION: "${context.description}"
LINE ITEM TAGS: [${context.tags.join(", ")}]
ORGANIZATION CONTEXT: "${context.organizationName || "General Contractor"}"
EXISTING STAGES: [${stageNames || "None"}]
EXISTING SIGNALS: [${signalNames || "None"}]
MERGED NOTES / USER INSTRUCTIONS:
"""
${context.userInstructions || "None"}
"""

RULES:
1. Use ONLY facts explicitly present in the provided text.
2. Never invent details (panel size, utility policy, permit specifics, access constraints, etc.).
3. Put only explicit facts into "foundContext".
4. Put unanswered decisions required for reliable planning into "missingContext".
5. Keep each bullet concise, practical, and scoped to this line item.
6. If enough context exists, return an empty "missingContext" array.
7. "assumptions" should list minimal assumptions someone might accept if they proceed anyway.

OUTPUT FORMAT:
Return JSON only:
{
  "foundContext": ["string"],
  "missingContext": ["string"],
  "assumptions": ["string"]
}
`;
  }

  static buildExecutionContextAssessmentPromptForTest(
    context: AIExecutionPlanContext,
    planningStages: { id: string; name: string }[],
  ): string {
    return this.buildExecutionContextAssessmentPrompt(context, planningStages);
  }

  private static simulateExecutionContextAssessment(
    context: AIExecutionPlanContext,
    options: { reason?: string } = {},
  ): ExecutionContextAssessment {
    const source = `${context.description}\n${context.userInstructions ?? ""}`.toLowerCase();
    const foundContext: string[] = [];
    const missingContext: string[] = [];

    if (/\b(100a|125a|150a|200a|225a|400a)\b/.test(source)) {
      foundContext.push("Service/panel amperage appears to be specified.");
    } else {
      missingContext.push("Confirm existing and required service/panel amperage.");
    }
    if (/utility|power company|meter|service drop/.test(source)) {
      foundContext.push("Utility coordination appears to be acknowledged.");
    } else {
      missingContext.push("Confirm utility coordination requirements and lead time.");
    }
    if (/permit|inspection|ahj/.test(source)) {
      foundContext.push("Permit and inspection requirements are referenced.");
    } else {
      missingContext.push("Confirm permit and inspection path for this scope.");
    }
    if (/grounding|bonding|electrode/.test(source)) {
      foundContext.push("Grounding/bonding requirements are mentioned.");
    } else {
      missingContext.push("Confirm grounding and bonding upgrades required by local code.");
    }

    const assumptions = [
      "Assume standard scheduling and site access unless clarified.",
      "Assume no abnormal utility constraints unless stated otherwise.",
    ];
    if (options.reason) {
      assumptions.push(`Simulated fallback reason: ${options.reason}`);
    }

    return ExecutionContextAssessmentSchema.parse({
      foundContext,
      missingContext,
      assumptions,
    });
  }

  private static buildContractorRealismPrompt(
    context: AIExecutionPlanContext,
    planningStages: { id: string; name: string }[],
    reusableTasks: { id: string; title: string; category: string; stage?: { name: string } | null; tags: { name: string }[] }[] = []
  ): string {
    const stageListJson = JSON.stringify(
      planningStages.map((s) => ({ name: s.name })),
      null,
      2,
    );
    const stageNames = planningStages.map(s => s.name).join(", ");
    const signalNames = context.existingSignals.join(", ");
    const allowedCategories = Object.values(TaskTemplateCategory).join(", ");

    const reusableTaskList = reusableTasks.map(t => 
      `- [ID: ${t.id}] "${t.title}" (Category: ${t.category}, Stage: ${t.stage?.name || 'None'}, Tags: ${t.tags.map((tg) => tg.name).join(", ")})`
    ).join("\n");

    return `
You are Struxient's contractor execution planner.

Your job is to convert ONE contractor quote line item or scope library template into the smallest useful starter execution plan for human review.

This is NOT a full construction schedule.
This is NOT an engineering design document.
This is NOT a generic project-management checklist.
This is NOT customer-facing sales copy.

You are creating only the real operational tasks needed to execute the quoted scope safely, legally, and accountably.

LINE ITEM DESCRIPTION: "${context.description}"
LINE ITEM TAGS: [${context.tags.join(", ")}]
ORGANIZATION CONTEXT: "${context.organizationName || 'General Contractor'}"

ALLOWED STAGES:
${stageListJson}

EXISTING STAGES (summary): [${stageNames || "None — add stages in Scope Library before generating tasks."}]
EXISTING SIGNALS: [${signalNames}]

USER INSTRUCTIONS:
"${context.userInstructions || 'None'}"

AVAILABLE REUSABLE TASKS FROM LIBRARY (PRIORITIZE THESE):
${reusableTaskList || 'None matching current tags.'}

ALLOWED TASK CATEGORIES:
${allowedCategories}

CATEGORY GUIDANCE:
- GENERAL: physical work, install, prep, demo, repair, field verification, safety-critical field work.
- PERMIT: permit applications, AHJ submissions, permit approval, jurisdictional responses.
- INSPECTION: AHJ inspection scheduling, AHJ inspection attendance, inspection result/sign-off.
- MATERIAL: ordering, sourcing, delivery, staging, procurement of physical materials/parts.
- PAYMENT: invoices, deposits, billing milestones, payment holds, financial collection.
- CUSTOMER_COMMUNICATION: communication with homeowner/client that is itself the work.
- PHOTO_EVIDENCE: required photos or visual proof only when photo capture is the standalone work.
- SCHEDULING: customer appointments, crew dispatch, work windows, calendar coordination. Do not use this for AHJ inspection scheduling; use INSPECTION.

CORE GOAL:
Create the SMALLEST useful operational task path for this scope.

Think like contractor operations:
- Who owns the work?
- What blocks the next step?
- What must be scheduled?
- What requires external approval?
- What must be verified?
- What should be reviewed by a human before applying?

Do not create tasks just because a stage exists.
Do not fill every stage.
Do not create tasks to make the plan feel complete.
Do not turn customer proposal wording into tasks unless it changes actual execution work.

TASK EXISTENCE TEST:
Before creating any task, ask:

1. Does a real person need to intentionally do this work?
2. Can it be assigned to one role?
3. Can it be scheduled, completed, blocked, or verified?
4. Would skipping it create real operational, safety, scheduling, permit, payment, customer, material, inspection, or accountability risk?
5. Is this more than normal cleanup, normal professionalism, or generic documentation?

Only create a top-level task when the answer is clearly yes.

EXECUTION GATE RULE:
Top-level tasks should represent real execution gates, such as:
- site visit / field verification if needed
- permit submission
- permit approval or AHJ response
- material sourcing / material readiness
- customer/crew scheduling
- installation / field work
- inspection scheduling
- inspection attendance / result upload
- explicit payment hold only if payment or billing is provided in the scope/rules

Do not decompose technical details into top-level tasks.

TECHNICAL DETAIL RULE:
Technical details usually belong inside task instructions, checklist items, resources, missingContext, warnings, or notes.

Do NOT create standalone tasks by default for:
- breaker size
- wire size
- charger specs
- equipment model
- load calculation
- panel capacity
- conduit route
- measurements
- mounting height
- application fields
- parts list creation
- basic testing
- cleanup
- customer explanation
- photo upload
- final documentation

Only create a standalone technical task if it requires a separate site visit, separate responsible person, separate approval, or independently blocks execution.

TASK COUNT RULE:
For simple single-trade scopes, target 5-8 tasks.
Use 8-12 tasks only when the scope clearly requires multi-visit, multi-trade, rough + final inspections, utility coordination, engineering review, drywall/repair follow-up, external approvals, or real customer/access blockers.

If more than 8 tasks are returned, each extra task must have a clear operational reason.

FORBIDDEN DEFAULT TASKS:
Do not create these as standalone tasks by default:
- Project Kickoff
- Scope Confirmation
- Crew Mobilization
- Site Setup
- Site Cleanup
- Final Cleanup
- Customer Walkthrough
- Customer Acceptance
- Final Documentation
- Project Closeout
- Archive Project
- Issue Final Invoice
- Collect Payment

These may only become standalone tasks if the input explicitly requires them as separate operational work, or if they are true blockers that cannot be handled as checklist/proof/payment rules.

CHECKLIST VS TASK RULE:
Use checklist/proof fields for normal details inside a real task:
- protect work area
- confirm access instructions
- take before/after photos
- upload permit card
- upload inspection result
- label breaker/equipment
- confirm work area cleaned
- perform basic test
- explain basic operation to customer
- collect notes

Never hide high-risk or externally dependent work in checklist-only details:
- permit submission
- permit approval
- utility disconnect/reconnect
- inspection scheduling
- inspection attendance
- material readiness
- customer access blocker
- safety-critical verification
- explicit payment hold

INSPECTION RULE:
AHJ inspection scheduling and AHJ inspection attendance are real operational events and may remain separate.

For inspection scheduling:
- category = INSPECTION
- stageName = exact allowed Inspection stage
- assigneeRole = OFFICE

For inspection attendance/result:
- category = INSPECTION
- stageName = exact allowed Inspection stage
- assigneeRole = FIELD
- attachmentRequired = true when inspection result proof is expected

Do not use category SCHEDULING for AHJ inspection scheduling.

PAYMENT RULE:
Do not create PAYMENT tasks unless payment, billing, deposit, invoice, collection, or payment hold is explicitly mentioned in the scope, payment rules, quote rules, or user instructions.

Do not put payment collection inside closeout checklists unless explicitly provided.

ASSUMPTION SAFETY RULE:
Do not list the same unresolved issue in both assumptions and missingContext.

If a missing item could change safety, legality, schedule, material selection, inspection path, cost, or customer access, treat it as missingContext or checklist detail — not as a confident assumption.

Missing context is allowed. Do not invent certainty.

TITLE RULE:
Use neutral operational task titles.
Do not include exact specs in titles unless explicitly provided.

Good:
- Source and stage required materials
- Install EV charger circuit
- Prepare and submit electrical permit

Bad:
- Install 60A breaker with 6 AWG wire
- Confirm Tesla charger specs with customer
- Complete final project closeout

SIGNAL RULE:
Define dependency signals only when they help sequence work.
Use stable lowercase dot-key format.

Good examples:
- site_visit.decision_complete
- permit.submitted
- permit.approved
- material.ready
- install.scheduled
- install.completed
- inspection.final_scheduled
- inspection.final_passed

Bad examples:
- ScopeConfirmed
- PermitApproved
- MaterialsOnSite
- FinalInspectionApproved

REUSABLE TASK RULE:
Select from reusable tasks first.
If a reusable task fits the operational need, use its ID and title exactly.
Only generate new tasks for gaps not covered by reusable tasks.
Prefer refining checklist/instructions around reusable tasks instead of inventing duplicate tasks.

STAGE RULE:
Each task's stageName must be copied exactly from EXISTING STAGES.
Never invent stage names.
Never use category names as stageName.
"Scheduling" is not a stage unless it appears in the allowed stage list.
Do not assign tasks to Corrections. Correction tasks are created later from failed inspections, walkthrough findings, punch-list items, or job issues.

ASSIGNEE ROLE RULE:
Suggest assigneeRole conservatively using:
OWNER | ADMIN | OFFICE | FIELD | VIEWER | SUBCONTRACTOR

Defaults:
- PERMIT = OFFICE
- PAYMENT = OFFICE or ADMIN
- CUSTOMER_COMMUNICATION = OFFICE unless clearly field-owned
- SCHEDULING = OFFICE
- INSPECTION scheduling/request = OFFICE
- INSPECTION attendance/result = FIELD
- MATERIAL order/purchase = OFFICE
- MATERIAL staging/loading/delivery = FIELD or null
- GENERAL physical install/work = FIELD
- If uncertain, use null

CONFIDENCE RULE:
Never use confidence 1.0.
Use:
- 0.85–0.95 for obvious standard tasks with clear scope and no major missing context.
- 0.65–0.84 when task is likely needed but details depend on AHJ, site condition, equipment specs, or company process.
- 0.45–0.64 when the task may be needed but should be reviewed carefully.

OUTPUT STYLE:
Return concise task instructions.
Use one-sentence reasoning per task.
Keep resources minimal. Do not list generic tools unless meaningful.
Checklist items should be practical and not over-detailed.

FINAL SELF-AUDIT BEFORE OUTPUT:
Before returning JSON, silently remove any task that is:
- generic admin filler
- normal cleanup/professionalism
- duplicate closeout
- customer proposal wording turned into fake work
- technical detail pretending to be a task
- checklist item pretending to be a task
- payment task not backed by payment/billing input
- walkthrough task not explicitly required
- stage filler created only because the stage exists

OUTPUT FORMAT:
Return ONLY a valid JSON object matching this structure:
{
  "assumptions": ["string"],
  "warnings": ["string"],
  "cleanupNotes": ["string"],
  "missingContext": ["string"],
  "tasks": [
    {
      "sourceTaskTemplateId": "string (ID from reusable tasks if selected, otherwise null)",
      "title": "string",
      "category": "one of: ${allowedCategories}",
      "instructions": "string",
      "stageName": "string (exact copy of one ALLOWED STAGES name)",
      "stageIntent": "optional — PRE_CONSTRUCTION | PERMITTING | MOBILIZATION | SITE_PREP | ROUGH_IN | INSPECTION | WALKTHROUGH | INSTALL | FINISHES | CLOSEOUT",
      "providesSignals": ["string"],
      "requiresSignals": ["string"],
      "hardSignal": boolean,
      "assigneeRole": "optional one of OWNER | ADMIN | OFFICE | FIELD | VIEWER | SUBCONTRACTOR, or null",
      "noteRequired": "optional boolean",
      "photoRequired": "optional boolean",
      "attachmentRequired": "optional boolean",
      "checklist": [{"label": "string"}],
      "resources": [{"name": "string", "quantity": number, "isEquipment": boolean}],
      "reasoning": "string",
      "confidence": number (0-1)
    }
  ]
}
`;
  }

  static buildContractorRealismPromptForTest(
    context: AIExecutionPlanContext,
    planningStages: { id: string; name: string }[],
    reusableTasks: { id: string; title: string; category: string; stage?: { name: string } | null; tags: { name: string }[] }[] = [],
  ): string {
    return this.buildContractorRealismPrompt(context, planningStages, reusableTasks);
  }

  /**
   * Generates reviewable scope suggestions for Quick scope capture.
   * Does not set pricing — only drafts commercial scope candidates.
   */
  static async generateScopeSuggestions(params: {
    quoteId: string;
    contextText: string;
    organizationName?: string;
    recommendedTemplates: RecommendedTemplateMatch[];
    existingLineDescriptions?: string[];
  }): Promise<QuoteScopeSuggestionsGenerationResult> {
    const gemini = this.getGeminiClient();
    const recommendedSuggestions: RecommendedTemplateSuggestion[] =
      params.recommendedTemplates.map((match) => ({
        tempId: crypto.randomUUID(),
        templateId: match.templateId,
        templateDescription: match.templateDescription,
        confidence: match.confidence,
        reasoning: match.reasoning,
      }));

    if (!gemini) {
      if (isAiSimulatedExecutionPlansEnabled()) {
        const proposal = this.simulateScopeSuggestions({
          quoteId: params.quoteId,
          contextText: params.contextText,
          recommendedSuggestions,
          reason: "GEMINI_API_KEY is missing.",
        });
        return { proposal, generation: buildScopeSuggestionsGenerationMeta(true) };
      }
      throw new AiProviderTemporarilyUnavailableError();
    }

    const alreadyRecommended = recommendedSuggestions
      .map((item) => `- ${item.templateDescription}`)
      .join("\n");
    const existingLines = (params.existingLineDescriptions ?? [])
      .map((desc) => `- ${desc}`)
      .join("\n");

    const prompt = `
You are a contractor scope assistant. Group messy job notes into three layers:

1) TEMPLATE-GRADE commercial line items (what the customer is buying) — short reusable descriptions only.
2) LINE-SPECIFIC instance details — how that sold item applies on this job (under each commercial line).
3) QUOTE/JOB-WIDE context — site, access, schedule, pets, gates, whole-job preferences (NOT on every line).

CORE RULE:
A quote line item = what the customer is buying. Do NOT create one line item per execution step.

description MUST be a short, reusable-grade commercial label. Do NOT put in description:
- address, access notes, customer schedule, pets, locked gates, one-off site facts
- brand names (e.g. Zinsco) unless the brand IS the sellable product

Put LINE-SPECIFIC facts in lineItemDetails, executionPlanningNotes, or per-line missingInfo:
- remove/demo/install, utility, permit, inspection, grounding for THAT line
- panel brand/type, amperage questions for THAT line

Put JOB-WIDE facts in quoteJobContext only (do not duplicate on every line):
- locked gate, dog in yard, customer available after 3 PM, whole-job access preferences

Put whole-quote gaps in quoteMissingInfo (not repeated on every line).

Only create a SEPARATE commercialLineItem or optionalAddOn when scope is separately priced, optional/upsell, or materially distinct.

Do NOT create vague commercial rows like "manage project logistics".

NEVER include price, cost, dollar amounts, or unit rates.

ORGANIZATION: "${params.organizationName ?? "General Contractor"}"

JOB CONTEXT:
"""
${params.contextText}
"""

ALREADY RECOMMENDED FROM SCOPE LIBRARY (do not repeat as commercialLineItems):
${alreadyRecommended || "None"}

EXISTING QUOTE LINE ITEMS (do not repeat):
${existingLines || "None"}

EXAMPLE:
Messy: "Zinsco panel, 200A upgrade, utility, permit, locked gate, dog, after 3pm, EV prep, garage outlet"
GOOD:
- commercialLineItem description: "Main electrical service upgrade" (no Zinsco in title)
- lineItemDetails: Zinsco panel, utility, permit, grounding on THAT line
- quoteJobContext: locked gate, dog, customer after 3 PM
- optionalAddOns: EV-ready preparation, exterior garage outlet
BAD: Zinsco or gate in description; gate/dog on every line item

OUTPUT JSON ONLY:
{
  "assumptions": ["string"],
  "warnings": ["string"],
  "quoteJobContext": ["string"],
  "quoteMissingInfo": ["string"],
  "commercialLineItems": [
    {
      "description": "string (short reusable commercial label)",
      "customerScopeTitle": "optional string",
      "customerScopeDescription": "optional string",
      "reasoning": "optional string",
      "confidence": "high" | "medium" | "low",
      "missingInfo": ["string"],
      "lineItemDetails": [{ "label": "optional", "content": "string", "audience": "internal"|"customer"|"both" }],
      "executionPlanningNotes": ["string"]
    }
  ],
  "optionalAddOns": [{ "description": "string", "whySeparate": "string", "confidence": "high"|"medium"|"low" }]
}
`;

    try {
      const modelName = process.env.GEMINI_MODEL?.trim() || this.DEFAULT_GEMINI_MODEL;
      const model = gemini.getGenerativeModel({ model: modelName });
      const result = await this.retryWithBackoff(() =>
        this.withTimeout(model.generateContent(prompt), this.GEMINI_REQUEST_TIMEOUT_MS),
      );
      const response = await result.response;
      const text = response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : text;
      const raw = JSON.parse(jsonStr);

      const parseAudience = (value: unknown): LineItemDetailSuggestion["audience"] => {
        if (value === "customer" || value === "both" || value === "internal") {
          return value;
        }
        return "internal";
      };

      const parseDetails = (rawDetails: unknown): LineItemDetailSuggestion[] => {
        if (!Array.isArray(rawDetails)) return [];
        return rawDetails
          .filter((d: Record<string, unknown>) => typeof d?.content === "string")
          .map((d: Record<string, unknown>) => ({
            tempId: crypto.randomUUID(),
            label: typeof d.label === "string" ? d.label.slice(0, 200) : null,
            content: String(d.content).trim().slice(0, 5000),
            audience: parseAudience(d.audience),
          }))
          .filter((d) => d.content.length > 0);
      };

      const rawCommercial = Array.isArray(raw.commercialLineItems) ? raw.commercialLineItems : [];
      const commercialLineItems: CommercialLineItemSuggestion[] = rawCommercial
        .filter((item: Record<string, unknown>) => typeof item?.description === "string")
        .map((item: Record<string, unknown>) => ({
          tempId: crypto.randomUUID(),
          description: String(item.description).trim().slice(0, 2000),
          customerScopeTitle:
            typeof item.customerScopeTitle === "string"
              ? item.customerScopeTitle.slice(0, 500)
              : null,
          customerScopeDescription:
            typeof item.customerScopeDescription === "string"
              ? item.customerScopeDescription.slice(0, 10_000)
              : null,
          reasoning: typeof item.reasoning === "string" ? item.reasoning : null,
          confidence:
            item.confidence === "high" || item.confidence === "medium" || item.confidence === "low"
              ? item.confidence
              : "medium",
          lineItemDetails: parseDetails(item.lineItemDetails),
          executionPlanningNotes: Array.isArray(item.executionPlanningNotes)
            ? item.executionPlanningNotes
                .filter((v: unknown) => typeof v === "string")
                .map((v: string) => v.slice(0, 2000))
            : [],
          missingInfo: Array.isArray(item.missingInfo)
            ? item.missingInfo
                .filter((v: unknown) => typeof v === "string")
                .map((v: string) => v.slice(0, 2000))
            : [],
        }))
        .filter((item: CommercialLineItemSuggestion) => item.description.length > 0);

      const rawOptional = Array.isArray(raw.optionalAddOns) ? raw.optionalAddOns : [];
      const optionalAddOns: OptionalAddOnSuggestion[] = rawOptional
        .filter(
          (item: Record<string, unknown>) =>
            typeof item?.description === "string" && typeof item?.whySeparate === "string",
        )
        .map((item: Record<string, unknown>) => ({
          tempId: crypto.randomUUID(),
          description: String(item.description).trim().slice(0, 2000),
          whySeparate: String(item.whySeparate).trim().slice(0, 2000),
          reasoning: typeof item.reasoning === "string" ? item.reasoning : null,
          confidence:
            item.confidence === "high" || item.confidence === "medium" || item.confidence === "low"
              ? item.confidence
              : "medium",
        }))
        .filter((item: OptionalAddOnSuggestion) => item.description.length > 0);

      const parsed = QuoteScopeSuggestionsProposalSchema.parse({
        quoteId: params.quoteId,
        sourceContextSummary: params.contextText.slice(0, 500),
        assumptions: Array.isArray(raw.assumptions) ? raw.assumptions : [],
        warnings: Array.isArray(raw.warnings) ? raw.warnings : [],
        quoteJobContext: Array.isArray(raw.quoteJobContext)
          ? raw.quoteJobContext.filter((v: unknown) => typeof v === "string")
          : [],
        quoteMissingInfo: Array.isArray(raw.quoteMissingInfo)
          ? raw.quoteMissingInfo.filter((v: unknown) => typeof v === "string")
          : Array.isArray(raw.missingInfo)
            ? raw.missingInfo.filter((v: unknown) => typeof v === "string")
            : [],
        recommendedTemplates: recommendedSuggestions,
        commercialLineItems,
        optionalAddOns,
      });

      const proposal = normalizeScopeSuggestionGrouping(parsed);

      return { proposal, generation: buildScopeSuggestionsGenerationMeta(false) };
    } catch (e) {
      if (isAiProviderTemporarilyUnavailable(e)) {
        throw new AiProviderTemporarilyUnavailableError();
      }
      if (isAiSimulatedExecutionPlansEnabled()) {
        const proposal = this.simulateScopeSuggestions({
          quoteId: params.quoteId,
          contextText: params.contextText,
          recommendedSuggestions,
          reason: e instanceof Error ? e.message : "Unknown AI provider error.",
        });
        return { proposal, generation: buildScopeSuggestionsGenerationMeta(true) };
      }
      throw new AiProviderTemporarilyUnavailableError();
    }
  }

  private static simulateScopeSuggestions(params: {
    quoteId: string;
    contextText: string;
    recommendedSuggestions: RecommendedTemplateSuggestion[];
    reason?: string;
  }): QuoteScopeSuggestionsProposal {
    const contextLower = params.contextText.toLowerCase();
    const commercialLineItems: CommercialLineItemSuggestion[] = [];
    const optionalAddOns: OptionalAddOnSuggestion[] = [];
    const quoteJobContext: string[] = [];

    if (/locked|gate/i.test(contextLower)) {
      quoteJobContext.push("Locked side gate");
    }
    if (/dog/i.test(contextLower)) {
      quoteJobContext.push("Dog in yard");
    }
    if (/after 3|3\s*pm|3pm|weekday/i.test(contextLower)) {
      quoteJobContext.push("Customer available after 3 PM on weekdays");
    }

    if (/zinsco|panel|200a|service upgrade|main panel|utility|meter/i.test(contextLower)) {
      commercialLineItems.push({
        tempId: crypto.randomUUID(),
        description: "Main electrical service upgrade",
        confidence: "high",
        reasoning: "Grouped panel removal, install, utility, permit, and inspection under one commercial scope.",
        customerScopeTitle: "Main electrical service upgrade",
        customerScopeDescription: null,
        lineItemDetails: [
          {
            tempId: crypto.randomUUID(),
            label: "Panel",
            content: "Existing panel appears to be Zinsco",
            audience: "internal",
          },
          {
            tempId: crypto.randomUUID(),
            label: "Install",
            content: "Install new main panel and service equipment",
            audience: "internal",
          },
          {
            tempId: crypto.randomUUID(),
            label: "Utility",
            content: "Coordinate utility release and meter work",
            audience: "internal",
          },
          {
            tempId: crypto.randomUUID(),
            label: "Permit",
            content: "Obtain required electrical permit",
            audience: "internal",
          },
          {
            tempId: crypto.randomUUID(),
            label: "Inspection",
            content: "Schedule and pass required inspection",
            audience: "internal",
          },
          {
            tempId: crypto.randomUUID(),
            label: "Grounding",
            content: "Verify grounding and bonding per code",
            audience: "internal",
          },
        ],
        executionPlanningNotes: [
          "Confirm proposed service amperage with customer",
        ],
        missingInfo: /service size|amperage|200a/i.test(contextLower)
          ? ["Confirm existing service size if not verified on site"]
          : ["Confirm existing service size", "Confirm proposed amperage"],
      });
    } else if (
      !params.recommendedSuggestions.some((t) => /charger|ev/i.test(t.templateDescription)) &&
      /charger|ev|240|garage/i.test(contextLower)
    ) {
      commercialLineItems.push({
        tempId: crypto.randomUUID(),
        description: "EV charger installation",
        confidence: "medium",
        reasoning: "Grouped charger install scope with planning notes.",
        customerScopeTitle: null,
        customerScopeDescription: null,
        lineItemDetails: [
          {
            tempId: crypto.randomUUID(),
            label: "Install",
            content: "Install EV charger and dedicated circuit",
            audience: "customer",
          },
        ],
        executionPlanningNotes: [
          "Verify charger model and panel capacity",
          "Confirm route from panel to charger location",
        ],
        missingInfo: [],
      });
    }

    if (/ev.?ready|ev prep|future ev/i.test(contextLower)) {
      optionalAddOns.push({
        tempId: crypto.randomUUID(),
        description: "EV-ready preparation",
        whySeparate: "Optional future upgrade — customer may accept or decline independently",
        confidence: "medium",
        reasoning: "Distinct optional scope for future EV charging.",
      });
    }

    if (/garage outlet|exterior outlet/i.test(contextLower)) {
      optionalAddOns.push({
        tempId: crypto.randomUUID(),
        description: "Exterior garage outlet",
        whySeparate: "Separate optional scope — independently priced add-on",
        confidence: "medium",
        reasoning: "Garage outlet mentioned as optional separate work.",
      });
    }

    if (/surge|whole.?home/i.test(contextLower)) {
      optionalAddOns.push({
        tempId: crypto.randomUUID(),
        description: "Whole-home surge protection",
        whySeparate: "Optional upsell — customer may accept or decline independently",
        confidence: "medium",
        reasoning: "Distinct optional scope mentioned in notes.",
      });
    }

    if (commercialLineItems.length === 0 && params.recommendedSuggestions.length === 0) {
      const firstLine = params.contextText.split("\n")[0]?.trim().slice(0, 120);
      if (firstLine) {
        commercialLineItems.push({
          tempId: crypto.randomUUID(),
          description: firstLine,
          confidence: "low",
          reasoning: "Simulated fallback from capture text.",
          customerScopeTitle: null,
          customerScopeDescription: null,
          lineItemDetails: [],
          executionPlanningNotes: [],
          missingInfo: [],
        });
      }
    }

    const parsed = QuoteScopeSuggestionsProposalSchema.parse({
      quoteId: params.quoteId,
      sourceContextSummary: params.contextText.slice(0, 500),
      assumptions: ["Simulated: demo scope suggestions for local development."],
      warnings: [
        "Demo AI output — not from the live provider.",
        ...(params.reason ? [`Simulated fallback reason: ${params.reason}`] : []),
      ],
      quoteJobContext,
      quoteMissingInfo: [],
      recommendedTemplates: params.recommendedSuggestions,
      commercialLineItems,
      optionalAddOns,
    });

    return normalizeScopeSuggestionGrouping(parsed);
  }

  /**
   * AI assist for Scope Clarification. Suggests likely answers for an EXISTING
   * canonical question set, read from the line text. Strictly review-then-apply:
   * the model may only reference the provided question/option keys; it never
   * invents questions or persists anything.
   */
  static async generateClarificationAnswerSuggestions(params: {
    set: {
      key: string;
      version: number;
      label: string;
      questions: {
        key: string;
        label: string;
        inputType: string;
        allowOther?: boolean;
        unit?: string;
        options?: { key: string; label: string }[];
      }[];
    };
    lineText: string;
    organizationName?: string;
  }): Promise<ClarificationAnswerGenerationResult> {
    const { set } = params;
    const questionKeySet = new Set(set.questions.map((q) => q.key));
    const optionKeysByQuestion = new Map(
      set.questions.map((q) => [q.key, new Set((q.options ?? []).map((o) => o.key))]),
    );
    const allowOtherByQuestion = new Map(
      set.questions.map((q) => [q.key, Boolean(q.allowOther)]),
    );

    const gemini = this.getGeminiClient();
    if (!gemini) {
      if (isAiSimulatedExecutionPlansEnabled()) {
        return {
          proposal: this.simulateClarificationAnswers(params),
          generation: this.buildClarificationGenerationMeta(true),
        };
      }
      throw new AiProviderTemporarilyUnavailableError();
    }

    const catalog = set.questions
      .map((q) => {
        const opts =
          q.options && q.options.length > 0
            ? ` options: ${q.options.map((o) => `${o.key}=${o.label}`).join(", ")}`
            : "";
        const other = q.allowOther ? " (allows other text)" : "";
        return `- key: ${q.key} | label: ${q.label} | type: ${q.inputType}${opts}${other}`;
      })
      .join("\n");

    const prompt = `
You help a contractor pre-fill scope clarification answers for a quote line.
Read the LINE TEXT and suggest the most likely answer for each QUESTION.

STRICT RULES:
- Only use questionKey values from the QUESTIONS list.
- For choice questions, only use option keys exactly as listed.
- For yes/no questions, optionKeys must be ["yes"] or ["no"].
- If the text does not clearly indicate an answer, set "unknown": true (do not guess wildly).
- Never invent new questions or options.
- Put a value in "text" only for short_text/notes questions, or as an "other" value when no option fits and the question allows other.

ORGANIZATION: "${params.organizationName ?? "General Contractor"}"

QUESTION SET: ${set.label} (${set.key})

QUESTIONS:
${catalog}

LINE TEXT:
"""
${params.lineText.slice(0, 4000)}
"""

OUTPUT JSON ONLY:
{
  "suggestions": [
    { "questionKey": "string", "optionKeys": ["string"], "text": "optional string", "number": null, "unknown": false, "confidence": "high"|"medium"|"low", "reasoning": "optional string" }
  ],
  "unresolvedQuestionKeys": ["string"],
  "notes": ["string"]
}
`;

    try {
      const modelName = process.env.GEMINI_MODEL?.trim() || this.DEFAULT_GEMINI_MODEL;
      const model = gemini.getGenerativeModel({ model: modelName });
      const result = await this.retryWithBackoff(() =>
        this.withTimeout(model.generateContent(prompt), this.GEMINI_REQUEST_TIMEOUT_MS),
      );
      const response = await result.response;
      const text = response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const raw = JSON.parse(jsonMatch ? jsonMatch[0] : text);

      const rawSuggestions = Array.isArray(raw.suggestions) ? raw.suggestions : [];
      const suggestions: ClarificationAnswerSuggestion[] = rawSuggestions
        .filter(
          (s: Record<string, unknown>) =>
            typeof s?.questionKey === "string" && questionKeySet.has(s.questionKey),
        )
        .map((s: Record<string, unknown>) => {
          const questionKey = String(s.questionKey);
          const allowedOptions = optionKeysByQuestion.get(questionKey) ?? new Set<string>();
          const rawKeys = Array.isArray(s.optionKeys) ? s.optionKeys : [];
          const allowOther = allowOtherByQuestion.get(questionKey) ?? false;
          const optionKeys = rawKeys
            .filter((k: unknown): k is string => typeof k === "string")
            .filter(
              (k: string) =>
                k === "yes" ||
                k === "no" ||
                (k === "__other__" && allowOther) ||
                allowedOptions.has(k),
            );
          return {
            questionKey,
            optionKeys,
            // Free text is valid for short_text/notes questions and "other" values.
            text: typeof s.text === "string" ? s.text.slice(0, 2000) : null,
            number: typeof s.number === "number" && Number.isFinite(s.number) ? s.number : null,
            unknown: Boolean(s.unknown),
            confidence:
              s.confidence === "high" || s.confidence === "medium" || s.confidence === "low"
                ? s.confidence
                : "medium",
            reasoning: typeof s.reasoning === "string" ? s.reasoning.slice(0, 500) : null,
          };
        });

      const proposal = ClarificationAnswerProposalSchema.parse({
        questionSetKey: set.key,
        questionSetVersion: set.version,
        suggestions,
        unresolvedQuestionKeys: Array.isArray(raw.unresolvedQuestionKeys)
          ? raw.unresolvedQuestionKeys.filter(
              (k: unknown): k is string => typeof k === "string" && questionKeySet.has(k),
            )
          : [],
        notes: Array.isArray(raw.notes)
          ? raw.notes.filter((n: unknown): n is string => typeof n === "string")
          : [],
      });

      return { proposal, generation: this.buildClarificationGenerationMeta(false) };
    } catch (e) {
      if (isAiProviderTemporarilyUnavailable(e)) {
        throw new AiProviderTemporarilyUnavailableError();
      }
      if (isAiSimulatedExecutionPlansEnabled()) {
        return {
          proposal: this.simulateClarificationAnswers(params),
          generation: this.buildClarificationGenerationMeta(true),
        };
      }
      throw new AiProviderTemporarilyUnavailableError();
    }
  }

  private static buildClarificationGenerationMeta(
    simulated: boolean,
  ): ClarificationAnswerGenerationResult["generation"] {
    if (simulated) {
      const canApply = process.env.AI_ALLOW_APPLY_SIMULATED_EXECUTION_PLANS === "1";
      return {
        isSimulated: true,
        canApply,
        applyBlockedReason: canApply
          ? undefined
          : "This is demo AI output. Apply is disabled until demo apply is explicitly enabled.",
      };
    }
    return { isSimulated: false, canApply: true };
  }

  static async generateClarificationQuestionSet(params: {
    lineText: string;
    organizationName?: string;
    missingContext?: string[];
  }): Promise<ClarificationQuestionSetGenerationResult> {
    const gemini = this.getGeminiClient();
    if (!gemini) {
      if (isAiSimulatedExecutionPlansEnabled()) {
        return {
          proposal: this.simulateClarificationQuestionSetProposal(params),
          generation: this.buildClarificationGenerationMeta(true),
        };
      }
      throw new AiProviderTemporarilyUnavailableError();
    }

    const prompt = `
You are helping a contractor build a scope clarification question set.
Generate a reusable, canonical question set from the line text and optional missing context.

RULES:
- Output keys in stable snake_or_dot style.
- Keep labels contractor-friendly and mobile-friendly.
- Prefer click answers (single/multi/yes_no_unknown) when possible.
- Use short_text/number/notes only when needed.
- Include aliases/keywords for vocabulary normalization.
- Suggest tag names (display names) in suggestedTags.
- Do not include execution tasks.

ORGANIZATION: "${params.organizationName ?? "General Contractor"}"
LINE TEXT:
"""
${params.lineText.slice(0, 4000)}
"""
MISSING CONTEXT:
${(params.missingContext ?? []).join("\n") || "None"}

OUTPUT JSON ONLY:
{
  "key": "trade.scope_key",
  "label": "Question set label",
  "description": "optional text",
  "aliases": ["string"],
  "keywords": ["string"],
  "suggestedTags": ["string"],
  "warnings": ["string"],
  "questions": [
    {
      "key": "trade.scope.field",
      "label": "Question",
      "inputType": "single_choice|multi_choice|yes_no_unknown|short_text|number|notes",
      "helpText": null,
      "allowOther": false,
      "unit": null,
      "customerFacing": true,
      "aliases": ["string"],
      "options": [{ "key": "choice_key", "label": "Choice", "aliases": [] }]
    }
  ]
}
`;

    try {
      const modelName = process.env.GEMINI_MODEL?.trim() || this.DEFAULT_GEMINI_MODEL;
      const model = gemini.getGenerativeModel({ model: modelName });
      const result = await this.retryWithBackoff(() =>
        this.withTimeout(model.generateContent(prompt), this.GEMINI_REQUEST_TIMEOUT_MS),
      );
      const response = await result.response;
      const text = response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const raw = JSON.parse(jsonMatch ? jsonMatch[0] : text);
      const proposal = ClarificationQuestionSetProposalSchema.parse(raw);
      return {
        proposal,
        generation: this.buildClarificationGenerationMeta(false),
      };
    } catch (e) {
      if (isAiProviderTemporarilyUnavailable(e)) {
        throw new AiProviderTemporarilyUnavailableError();
      }
      if (isAiSimulatedExecutionPlansEnabled()) {
        return {
          proposal: this.simulateClarificationQuestionSetProposal(params, {
            reason: e instanceof Error ? e.message : "Unknown AI provider error.",
          }),
          generation: this.buildClarificationGenerationMeta(true),
        };
      }
      throw new AiProviderTemporarilyUnavailableError();
    }
  }

  private static simulateClarificationQuestionSetProposal(
    params: { lineText: string; missingContext?: string[] },
    options: { reason?: string } = {},
  ): ClarificationQuestionSetProposal {
    const text = params.lineText.toLowerCase();
    const isService = /service|panel|meter|amperage|underground|trench/.test(text);
    return ClarificationQuestionSetProposalSchema.parse({
      key: isService ? "electrical.service_upgrade" : "general.scope_clarification",
      label: isService ? "Electrical service upgrade" : "Scope clarification",
      description: "Generated from line description for review.",
      aliases: isService ? ["service upgrade", "panel upgrade"] : ["scope clarification"],
      keywords: isService ? ["service upgrade", "panel"] : ["scope"],
      suggestedTags: isService ? ["service-upgrade", "electrical-service"] : ["scope-clarification"],
      warnings: [
        "Demo AI output — not from the live provider.",
        ...(options.reason ? [`Simulated fallback reason: ${options.reason}`] : []),
      ],
      questions: isService
        ? [
            {
              key: "electrical.service.new_service_size",
              label: "New service size",
              inputType: "single_choice",
              allowOther: true,
              customerFacing: true,
              aliases: ["new amp size", "service amperage"],
              options: [
                { key: "100a", label: "100A", aliases: [] },
                { key: "125a", label: "125A", aliases: [] },
                { key: "200a", label: "200A", aliases: [] },
                { key: "320a", label: "320A", aliases: [] },
                { key: "400a", label: "400A", aliases: [] },
              ],
            },
            {
              key: "electrical.service.service_feed",
              label: "Service feed",
              inputType: "single_choice",
              allowOther: false,
              customerFacing: true,
              aliases: ["overhead or underground"],
              options: [
                { key: "overhead", label: "Overhead", aliases: [] },
                { key: "underground", label: "Underground", aliases: [] },
              ],
            },
            {
              key: "electrical.service.trenching_required",
              label: "Trenching required",
              inputType: "yes_no_unknown",
              allowOther: false,
              customerFacing: true,
              aliases: ["trench"],
              options: [],
            },
          ]
        : [
            {
              key: "general.scope.notes",
              label: "Additional scope notes",
              inputType: "notes",
              allowOther: false,
              customerFacing: false,
              aliases: ["notes"],
              options: [],
            },
          ],
    });
  }

  /** Deterministic keyword-based suggestion fallback for local/demo use. */
  private static simulateClarificationAnswers(params: {
    set: { key: string; version: number; questions: { key: string; inputType: string }[] };
    lineText: string;
  }): ClarificationAnswerProposal {
    const text = params.lineText.toLowerCase();
    const suggestions: ClarificationAnswerSuggestion[] = [];

    const push = (s: Partial<ClarificationAnswerSuggestion> & { questionKey: string }) =>
      suggestions.push({
        questionKey: s.questionKey,
        optionKeys: s.optionKeys ?? [],
        text: s.text ?? null,
        number: s.number ?? null,
        unknown: s.unknown ?? false,
        confidence: s.confidence ?? "medium",
        reasoning: s.reasoning ?? "Simulated from line text keywords.",
      });

    const has = (key: string) => params.set.questions.some((q) => q.key === key);

    const ampMatch = text.match(/\b(100|125|200|320|400)\s*a(mp)?\b/);
    if (ampMatch && has("electrical.service.new_service_size")) {
      push({
        questionKey: "electrical.service.new_service_size",
        optionKeys: [`${ampMatch[1]}a`],
        confidence: "high",
      });
    }
    if (/underground|trench|ug\b/.test(text)) {
      if (has("electrical.service.service_feed")) {
        push({
          questionKey: "electrical.service.service_feed",
          optionKeys: ["underground"],
          confidence: "high",
        });
      }
      if (/trench/.test(text) && has("electrical.service.trenching_required")) {
        push({
          questionKey: "electrical.service.trenching_required",
          optionKeys: ["yes"],
          confidence: "medium",
        });
      }
    } else if (/overhead|weatherhead|mast/.test(text) && has("electrical.service.service_feed")) {
      push({
        questionKey: "electrical.service.service_feed",
        optionKeys: ["overhead"],
        confidence: "high",
      });
    }
    if (/permit/.test(text) && has("electrical.service.permit_required")) {
      push({
        questionKey: "electrical.service.permit_required",
        optionKeys: ["yes"],
        confidence: "medium",
      });
    }

    return ClarificationAnswerProposalSchema.parse({
      questionSetKey: params.set.key,
      questionSetVersion: params.set.version,
      suggestions,
      unresolvedQuestionKeys: [],
      notes: ["Demo AI output — not from the live provider."],
    });
  }

  /** Compatibility layer for quote-line AI execution planning */
  static async generateExecutionPlan(
    description: string,
    organizationId: string,
    tags: string[] = [],
    existingStages: { id: string; name: string }[] = [],
    existingSignals: string[] = [],
    organizationName?: string,
    userInstructions?: string,
  ): Promise<AILibraryProposalGenerationResult> {
    return this.generateLibraryExecutionPlan({
      templateId: "compat",
      description,
      organizationId,
      tags,
      organizationName,
      existingStages,
      existingSignals,
      userInstructions,
    });
  }

  static async generateQuoteExecutionReviewProposal(
    context: AIQuoteExecutionReviewContext,
    mode: "signals" | "tasks" = "signals",
  ): Promise<AIQuoteExecutionReviewProposalGenerationResult> {
    const gemini = this.getGeminiClient();
    if (!gemini) {
      throw new AiProviderTemporarilyUnavailableError();
    }

    const modelName = process.env.GEMINI_MODEL?.trim() || this.DEFAULT_GEMINI_MODEL;
    const model = gemini.getGenerativeModel({
      model: modelName,
      generationConfig: { responseMimeType: "application/json" },
    });

    const stageList = context.existingStages
      .map((stage) => `- ${stage.name} (id: ${stage.id})`)
      .join("\n");
    const lineContext = context.lines
      .map((line) => {
        const taskLines = line.tasks
          .map(
            (task) =>
              `  - Task ${task.id}: "${task.title}" [${task.category}] stage=${task.stageName ?? "None"}(${task.stageId ?? "None"}) provides=[${task.providesSignals.join(", ")}] requires=[${task.requiresSignals.join(", ")}] hard=${task.hardSignal}`,
          )
          .join("\n");
        return `- Line ${line.id}: "${line.description}"\n${taskLines || "  - No tasks"}`;
      })
      .join("\n");
    const deterministicHints = context.deterministicSuggestions
      .map(
        (s) =>
          `- signal=${s.signal} consumer=${s.consumerTaskTitle}(${s.consumerTaskId}) provider=${s.providerTaskTitle}(${s.providerTaskId})`,
      )
      .join("\n");

    const prompt = `
You are the Struxient AI Secretary. Create a WHOLE-QUOTE execution review proposal.
Current mode: ${mode}.

OUTPUT RULES:
- Return ONLY valid JSON matching this structure:
{
  "quoteId": "string",
  "summary": "string",
  "assumptions": ["string"],
  "warnings": ["string"],
  "missingContext": ["string"],
  "operations": [
    {
      "opId": "string",
      "type": "add_task",
      "lineItemId": "string",
      "reason": "string",
      "task": {
        "title": "string",
        "category": "GENERAL|PERMIT|INSPECTION|MATERIAL|PAYMENT|CUSTOMER_COMMUNICATION|PHOTO_EVIDENCE|SCHEDULING",
        "stageId": "string",
        "instructions": "string|null",
        "providesSignals": ["string"],
        "requiresSignals": ["string"],
        "hardSignal": true,
        "checklist": [{"label":"string"}],
        "resources": [{"name":"string","quantity":1,"unit":"string","isEquipment":false}]
      }
    },
    {
      "opId": "string",
      "type": "patch_task_signals",
      "taskId": "string",
      "reason": "string",
      "addProvides": ["string"],
      "removeProvides": ["string"],
      "addRequires": ["string"],
      "removeRequires": ["string"]
    }
  ],
  "consolidationHints": [{"hintId":"string","title":"string","taskIds":["string"],"recommendation":"string"}],
  "manualDecisions": [{"decisionId":"string","title":"string","detail":"string","lineItemId":"string","taskId":"string"}]
}

BEHAVIOR RULES:
- In "signals" mode, ONLY return "patch_task_signals" operations.
- In "tasks" mode, ONLY return "add_task" operations.
- Prefer minimal, safe operations that reduce activation blockers.
- Do NOT change commercial line items.
- Use only stage IDs from the allowed list.
- For duplicate permit coordination work, prefer consolidationHints unless confidence is very high.
- Limit operations to at most 8.

QUOTE:
- id: ${context.quoteId}
- title: ${context.quoteTitle}
- totals: tasks=${context.currentSummary.totalTasks}, orphans=${context.currentSummary.orphanCount}, hardOrphans=${context.currentSummary.hardOrphanCount}

ALLOWED STAGES:
${stageList || "- none"}

CURRENT LINES AND TASKS:
${lineContext || "- none"}

DETERMINISTIC SIGNAL HINTS:
${deterministicHints || "- none"}
`;

    try {
      const result = await this.retryWithBackoff(() =>
        this.withTimeout(model.generateContent(prompt), this.GEMINI_REQUEST_TIMEOUT_MS),
      );
      const response = await result.response;
      const text = response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : text;
      const parsed = JSON.parse(jsonStr);
      const proposal = QuoteExecutionReviewProposalSchema.parse(parsed);
      return { proposal, generation: buildValidGenerationMeta() };
    } catch (e) {
      if (isAiProviderTemporarilyUnavailable(e)) {
        throw new AiProviderTemporarilyUnavailableError();
      }
      console.error("AI quote execution review proposal failed", e);
      throw new AiExecutionPlanInvalidError();
    }
  }

  /**
   * Suggests tags for a given title and description.
   */
  async suggestTags(params: {
    title: string;
    description?: string;
    context?: string;
    existingTags: { name: string; aliases: string[] }[];
  }): Promise<string[]> {
    const gemini = AIService.getGeminiClient();
    if (!gemini) return [];

    const { title, description, context, existingTags } = params;
    const modelName = process.env.GEMINI_MODEL?.trim() || AIService.DEFAULT_GEMINI_MODEL;
    const model = gemini.getGenerativeModel({ model: modelName });

    const tagList = existingTags.map(t => t.name).join(", ");
    const aliasMap = existingTags.flatMap(t => t.aliases.map(a => `${a} -> ${t.name}`)).join("\n");

    const prompt = `
You are an expert contractor metadata assistant. Your goal is to suggest relevant tags for a line item or task.

TITLE: "${title}"
DESCRIPTION: "${description || 'None'}"
CONTEXT: "${context || 'None'}"

EXISTING TAGS IN LIBRARY:
${tagList || 'None'}

KNOWN ALIASES (map these to the canonical name):
${aliasMap || 'None'}

RULES:
1. Suggest 2-5 relevant tags.
2. Prioritize EXISTING TAGS from the library if they fit.
3. If you suggest something that matches a KNOWN ALIAS, use the canonical name instead.
4. Only suggest NEW tags if the library doesn't cover the scope.
5. Keep tags short, lowercase, and hyphenated if multiple words (e.g. "roof-mounted").

OUTPUT:
Return ONLY a comma-separated list of tag names.
`;

    try {
      const result = await AIService.retryWithBackoff(() => model.generateContent(prompt));
      const response = await result.response;
      const text = response.text();
      return text.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
    } catch (e) {
      console.error("AI Tag Suggestion failed", e);
      return [];
    }
  }

  /**
   * Analyzes existing tags and suggests potential merges for cleanup.
   */
  async suggestTagMerges(params: {
    existingTags: { id: string; name: string; aliases: string[] }[];
  }): Promise<{ sourceTagId: string; targetTagId: string; reason: string }[]> {
    const gemini = AIService.getGeminiClient();
    if (!gemini || params.existingTags.length < 2) return [];

    const modelName = process.env.GEMINI_MODEL?.trim() || AIService.DEFAULT_GEMINI_MODEL;
    const model = gemini.getGenerativeModel({ model: modelName });

    const tagList = params.existingTags.map(t => 
      `- [ID: ${t.id}] "${t.name}" (Aliases: ${t.aliases.join(", ") || 'None'})`
    ).join("\n");

    const prompt = `
You are an expert data cleanup assistant. Your goal is to identify duplicate or highly similar tags in a contractor's library that should be merged.

EXISTING TAGS:
${tagList}

RULES:
1. Identify tags that represent the same concept (e.g., "roofing" and "roof-work").
2. Identify tags that are misspellings or minor variations.
3. For each pair, suggest which one should be the "source" (to be removed) and which should be the "target" (the canonical one).
4. Provide a brief "reason" for the merge.
5. Only suggest high-confidence merges. If tags are distinct, do not suggest a merge.

OUTPUT:
Return ONLY a valid JSON array of objects:
[
  { "sourceTagId": "string", "targetTagId": "string", "reason": "string" }
]
`;

    try {
      const result = await AIService.retryWithBackoff(() => model.generateContent(prompt));
      const response = await result.response;
      const text = response.text();
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      const jsonStr = jsonMatch ? jsonMatch[0] : text;
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error("AI Tag Merge Suggestion failed", e);
      return [];
    }
  }

  /**
   * Suggests a recovery path for a job issue.
   */
  async suggestRecoveryPath(params: {
    issue: {
      id: string;
      title: string;
      type: JobIssueType;
      severity: JobIssueSeverity;
      description?: string | null;
    };
    blockedTask?: { title: string; category: string; instructions?: string | null } | null;
    jobContext: {
      title: string;
      trade?: string;
      organizationName?: string;
      stages: { title: string; tasks: { title: string; status: string }[] }[];
    };
  }): Promise<AIRecoveryProposal> {
    const gemini = AIService.getGeminiClient();

    if (!gemini) {
      throw new Error("GEMINI_API_KEY missing.");
    }

    const modelName = process.env.GEMINI_MODEL?.trim() || AIService.DEFAULT_GEMINI_MODEL;
    const model = gemini.getGenerativeModel({ model: modelName });

    const jobStagesContext = params.jobContext.stages
      .map(
        (s) =>
          `- Stage: "${s.title}"\n  Tasks: ${s.tasks
            .map((t) => `"${t.title}" (${t.status})`)
            .join(", ")}`,
      )
      .join("\n");

    const prompt = `
You are a contractor operations expert. A job is blocked by an issue, and you need to suggest a "Recovery Path" (a sequence of tasks) to resolve the issue and resume work.

JOB: "${params.jobContext.title}" (${params.jobContext.trade || "General"})
ISSUE: "${params.issue.title}" (Type: ${params.issue.type}, Severity: ${params.issue.severity})
ISSUE DESCRIPTION: "${params.issue.description || "None"}"
BLOCKED TASK: ${
      params.blockedTask
        ? `"${params.blockedTask.title}" (${params.blockedTask.category})`
        : "None specified"
    }

JOB CONTEXT (STAGES & TASKS):
${jobStagesContext}

GOAL:
Suggest 1-4 specific tasks to resolve this issue. 
Think about:
- Field corrections (re-work)
- Office/Admin (permits, scheduling, ordering)
- Customer communication
- Inspections/Sign-offs

RULES:
1. Suggest tasks in a logical order.
2. Assign a category to each task (GENERAL, PERMIT, INSPECTION, MATERIAL, PAYMENT, CUSTOMER_COMMUNICATION, PHOTO_EVIDENCE, SCHEDULING).
3. Provide clear instructions for each task.
4. Suggest if a task is a "hardSignal" (meaning the original job path cannot resume until this is done).
5. Include a checklist for completion.
6. Specify proof requirements (noteRequired, photoRequired, attachmentRequired).
7. Assign a classification (FIELD, OFFICE, CUSTOMER, MATERIAL, PERMIT, INSPECTION).
8. Provide "reasoning" for why this recovery step is necessary.
9. "confidence" must be a decimal between 0 and 1 inclusive (model certainty for that step), e.g. 0.85 — not a percent.

OUTPUT FORMAT:
Return ONLY a valid JSON object:
{
  "summary": "string",
  "assumptions": ["string"],
  "warnings": ["string"],
  "tasks": [
    {
      "title": "string",
      "category": "string",
      "classification": "FIELD | OFFICE | CUSTOMER | MATERIAL | PERMIT | INSPECTION",
      "instructions": "string",
      "proofRequirements": {
        "noteRequired": boolean,
        "photoRequired": boolean,
        "attachmentRequired": boolean
      },
      "providesSignals": ["string"],
      "requiresSignals": ["string"],
      "hardSignal": boolean,
      "checklist": [{"label": "string"}],
      "reasoning": "string",
      "confidence": 0.85
    }
  ]
}
`;

    try {
      const result = await AIService.retryWithBackoff(() => model.generateContent(prompt));
      const response = await result.response;
      const text = response.text();
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : text;
      const raw = JSON.parse(jsonStr);

      // Normalize categories and confidence (models often emit 0–100).
      const normalizedTasks = (Array.isArray(raw.tasks) ? raw.tasks : []).map((t: Record<string, unknown>) => {
        const { confidence: rawConfidence, ...rest } = t;
        const confidence = AIService.normalizeConfidenceToUnitInterval(rawConfidence);
        return {
          ...rest,
          ...(confidence !== undefined ? { confidence } : {}),
          tempId: crypto.randomUUID(),
          category: AIService.normalizeCategory(t.category) || TaskTemplateCategory.GENERAL,
        };
      });

      const proposal = {
        ...raw,
        issueId: params.issue.id,
        tasks: normalizedTasks,
      };

      return AIRecoveryProposalSchema.parse(proposal);
    } catch (e) {
      console.error("AI Recovery Path Suggestion failed", e);
      if (isAiProviderTemporarilyUnavailable(e)) {
        throw new AiProviderTemporarilyUnavailableError();
      }
      throw e;
    }
  }

  /** Simulated fallback for local dev */

  private static async simulateLibraryExecutionPlan(
    context: AIExecutionPlanContext,
    options: { reason?: string } = {}
  ): Promise<AILibraryProposal> {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const { templateId, description, existingStages } = context;
    const d = description.toLowerCase();
    const planningStages = getStagesForAiExecutionPlanning(existingStages);
    
    const proposal: AILibraryProposal = {
      templateId,
      sourceContext: description,
      assumptions: [
        "Simulated: Assumed standard residential safety protocols apply.",
        "Simulated: Assumed typical crew size of 2-4 people.",
      ],
      warnings: [
        "Demo AI output — not from the live provider. Apply is disabled unless demo apply is explicitly enabled.",
        ...(options.reason ? [`Simulated fallback reason: ${options.reason}`] : []),
      ],
      cleanupNotes: [],
      missingContext: [],
      tasks: [],
    };

    const mapSimStage = (stageName: string, intent?: StageIntent) =>
      mapAiStageToStageId({ stageName, stageIntent: intent, allowedStages: planningStages });

    if (d.includes("roof") || d.includes("shingle")) {
      const prepStage = mapSimStage("Preparation", "SITE_PREP");
      const roughStage = mapSimStage("Rough-in", "ROUGH_IN");
      proposal.tasks = [
        {
          tempId: crypto.randomUUID(),
          title: "Material Delivery & Roof Loading",
          category: TaskTemplateCategory.MATERIAL,
          instructions: "Ensure shingles are distributed across the ridge for weight balance.",
          stageName: prepStage.stageId
            ? planningStages.find((s) => s.id === prepStage.stageId)?.name ?? "Preparation"
            : "Preparation",
          stageId: prepStage.stageId,
          providesSignals: ["materials-on-site"],
          requiresSignals: [],
          hardSignal: false,
          checklist: [{ label: "Verify shingle color matches order" }, { label: "Check for driveway protection" }],
          resources: [
            { name: "Conveyor Truck", quantity: 1, isEquipment: true },
            { name: "Roofing Brackets", quantity: 12, isEquipment: true }
          ],
          reasoning: "Materials must be on-site and loaded before work can begin.",
          confidence: 0.95,
        },
        {
          tempId: crypto.randomUUID(),
          title: "Tear-off & Deck Inspection",
          category: TaskTemplateCategory.GENERAL,
          instructions: "Remove existing shingles down to the wood deck. Report any rot immediately.",
          stageName: roughStage.stageId
            ? planningStages.find((s) => s.id === roughStage.stageId)?.name ?? "Rough-in"
            : "Rough-in",
          stageId: roughStage.stageId,
          providesSignals: ["demo-complete"],
          requiresSignals: ["materials-on-site"],
          hardSignal: true,
          checklist: [{ label: "Remove all old felt" }, { label: "Inspect plywood for soft spots" }, { label: "Sweep deck clean" }],
          resources: [
            { name: "Dump Trailer", quantity: 1, isEquipment: true },
            { name: "Shingle Tear-off Tool", quantity: 4, isEquipment: true }
          ],
          reasoning: "Demolition is the first step of field work.",
          confidence: 0.9,
        }
      ];
    } else {
      const prepStage = mapSimStage("Preparation", "SITE_PREP");
      const installStage = mapSimStage("Installation", "INSTALL");
      proposal.tasks = [
        {
          tempId: crypto.randomUUID(),
          title: `Setup for ${description}`,
          category: TaskTemplateCategory.GENERAL,
          stageName: prepStage.stageId
            ? planningStages.find((s) => s.id === prepStage.stageId)?.name ?? "Preparation"
            : "Preparation",
          stageId: prepStage.stageId,
          providesSignals: ["setup-complete"],
          requiresSignals: [],
          hardSignal: false,
          checklist: [{ label: "Safety briefing" }, { label: "Mobilize tools" }],
          resources: [],
          reasoning: "Initial mobilization and safety check.",
          confidence: 0.8,
        },
        {
          tempId: crypto.randomUUID(),
          title: `Execute ${description}`,
          category: TaskTemplateCategory.GENERAL,
          stageName: installStage.stageId
            ? planningStages.find((s) => s.id === installStage.stageId)?.name ?? "Installation"
            : "Installation",
          stageId: installStage.stageId,
          providesSignals: ["execution-complete"],
          requiresSignals: ["setup-complete"],
          hardSignal: false,
          checklist: [{ label: "Perform work per specs" }, { label: "Quality check" }],
          resources: [],
          reasoning: "Primary execution of the scope.",
          confidence: 0.8,
        }
      ];
    }

    const { proposal: filteredProposal } = filterCorrectionsStageTasksFromAiProposal(
      proposal,
      existingStages
    );

    return AILibraryProposalSchema.parse(filteredProposal);
  }

  static buildPaymentSchedulePromptForTest(params: {
    quoteId: string;
    quoteTotalCents: number;
    contextText: string;
    allowedStages: { id: string; name: string }[];
    organizationName?: string;
    userInstructions?: string | null;
  }): string {
    return this.buildPaymentSchedulePrompt(params);
  }

  private static buildPaymentSchedulePrompt(params: {
    quoteId: string;
    quoteTotalCents: number;
    contextText: string;
    allowedStages: { id: string; name: string }[];
    organizationName?: string;
    userInstructions?: string | null;
  }): string {
    const stageList = params.allowedStages.map((stage) => `- ${stage.name}`).join("\n");
    const instructions = params.userInstructions?.trim()
      ? `\nUSER INSTRUCTIONS:\n"""\n${params.userInstructions.trim()}\n"""`
      : "";

    return `
You are Struxient's contractor payment schedule assistant.
Propose a commercial payment schedule (milestones/deposits) for a quote — NOT execution tasks.

ORGANIZATION: "${params.organizationName ?? "General Contractor"}"
QUOTE TOTAL CENTS: ${params.quoteTotalCents}

INDUSTRY DEFAULT (use unless quote context explicitly says otherwise):
- Target 2-4 milestones total.
- Deposit on UPON_APPROVAL (commonly 25-50%).
- Progress payment(s) on major execution phases using AFTER_STAGE when an execution plan exists.
- FINAL_BALANCE for the remainder (no fixed amount or percentage on final balance).
- Prefer percentages for non-final rows so totals stay aligned with the quote total.
- Use fixed amountCents only when context specifies a dollar deposit.

CONTEXT OVERRIDES:
- Honor explicit payment terms in quote/lead notes, customer scope, or user instructions.
- Examples: "50% upfront", "no deposit", "pay at inspection", "30/40/30".

EXECUTION ALIGNMENT:
- When draft execution tasks exist, tie progress milestones to significant stage transitions only.
- Do NOT create one milestone per line item.
- Use anchorStageName that exactly matches an allowed stage name when anchoring to a stage.

ANCHOR TYPES (use only these):
- UPON_APPROVAL — deposit due when quote is approved
- BEFORE_STAGE — due before work in a stage begins
- AFTER_STAGE — due after a stage completes
- FINAL_BALANCE — remainder upon completion (exactly one recommended)

CONSTRAINTS:
- Milestone titles max 200 characters.
- Non-final milestones need percentage OR amountCents (prefer percentage).
- Scheduled non-final amounts must not exceed quote total when materialized.
- Do NOT invent payment terms unsupported by anchors.
- This is commercial schedule only — do NOT propose PAYMENT execution tasks.

ALLOWED STAGES:
${stageList || "None configured"}

QUOTE CONTEXT:
"""
${params.contextText}
"""
${instructions}

OUTPUT JSON ONLY:
{
  "scheduleRationale": "string",
  "assumptions": ["string"],
  "warnings": ["string"],
  "missingInfo": ["string"],
  "milestones": [
    {
      "title": "string",
      "percentage": "optional string like 30 or 30.5",
      "amountCents": "optional integer cents",
      "anchorType": "UPON_APPROVAL" | "BEFORE_STAGE" | "AFTER_STAGE" | "FINAL_BALANCE",
      "anchorStageName": "optional stage name when BEFORE_STAGE or AFTER_STAGE",
      "reasoning": "optional string"
    }
  ]
}
`;
  }

  /**
   * Generates a reviewable payment schedule proposal for a quote.
   */
  static async generatePaymentScheduleProposal(params: {
    quoteId: string;
    quoteTotalCents: number;
    contextText: string;
    allowedStages: { id: string; name: string }[];
    organizationName?: string;
    userInstructions?: string | null;
  }): Promise<QuotePaymentScheduleGenerationResult> {
    const gemini = this.getGeminiClient();

    if (!gemini) {
      if (isAiSimulatedExecutionPlansEnabled()) {
        const proposal = this.simulatePaymentScheduleProposal({
          ...params,
          reason: "GEMINI_API_KEY is missing.",
        });
        return { proposal, generation: buildPaymentScheduleGenerationMeta(true) };
      }
      throw new AiProviderTemporarilyUnavailableError();
    }

    const prompt = this.buildPaymentSchedulePrompt(params);

    try {
      const modelName = process.env.GEMINI_MODEL?.trim() || this.DEFAULT_GEMINI_MODEL;
      const model = gemini.getGenerativeModel({
        model: modelName,
        generationConfig: { responseMimeType: "application/json" },
      });
      const result = await this.retryWithBackoff(() =>
        this.withTimeout(model.generateContent(prompt), this.GEMINI_REQUEST_TIMEOUT_MS),
      );
      const response = await result.response;
      const text = response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : text;
      const raw = JSON.parse(jsonStr);

      const parseAnchorType = (value: unknown): PaymentScheduleAnchorType => {
        if (
          value === PaymentScheduleAnchorType.UPON_APPROVAL ||
          value === PaymentScheduleAnchorType.BEFORE_STAGE ||
          value === PaymentScheduleAnchorType.AFTER_STAGE ||
          value === PaymentScheduleAnchorType.FINAL_BALANCE
        ) {
          return value;
        }
        return PaymentScheduleAnchorType.UPON_APPROVAL;
      };

      const rawMilestones = Array.isArray(raw.milestones) ? raw.milestones : [];
      const milestones: PaymentScheduleMilestoneSuggestion[] = rawMilestones
        .filter((item: Record<string, unknown>) => typeof item?.title === "string")
        .map((item: Record<string, unknown>) => ({
          tempId: crypto.randomUUID(),
          title: String(item.title).trim().slice(0, 200),
          percentage:
            typeof item.percentage === "string" || typeof item.percentage === "number"
              ? String(item.percentage).trim().slice(0, 20)
              : null,
          amountCents:
            typeof item.amountCents === "number" && Number.isInteger(item.amountCents)
              ? Math.max(0, item.amountCents)
              : null,
          anchorType: parseAnchorType(item.anchorType),
          anchorStageName:
            typeof item.anchorStageName === "string"
              ? item.anchorStageName.trim().slice(0, 200)
              : null,
          reasoning: typeof item.reasoning === "string" ? item.reasoning.slice(0, 2000) : null,
        }))
        .filter((item: PaymentScheduleMilestoneSuggestion) => item.title.length > 0);

      const proposal = QuotePaymentScheduleProposalSchema.parse({
        quoteId: params.quoteId,
        sourceContextSummary: params.contextText.slice(0, 500),
        scheduleRationale:
          typeof raw.scheduleRationale === "string" ? raw.scheduleRationale.slice(0, 5000) : null,
        assumptions: Array.isArray(raw.assumptions)
          ? raw.assumptions.filter((v: unknown) => typeof v === "string")
          : [],
        warnings: Array.isArray(raw.warnings)
          ? raw.warnings.filter((v: unknown) => typeof v === "string")
          : [],
        missingInfo: Array.isArray(raw.missingInfo)
          ? raw.missingInfo.filter((v: unknown) => typeof v === "string")
          : [],
        milestones,
      });

      return { proposal, generation: buildPaymentScheduleGenerationMeta(false) };
    } catch (e) {
      if (isAiProviderTemporarilyUnavailable(e)) {
        throw new AiProviderTemporarilyUnavailableError();
      }
      if (isAiSimulatedExecutionPlansEnabled()) {
        const proposal = this.simulatePaymentScheduleProposal({
          ...params,
          reason: e instanceof Error ? e.message : "Unknown AI provider error.",
        });
        return { proposal, generation: buildPaymentScheduleGenerationMeta(true) };
      }
      throw new AiProviderTemporarilyUnavailableError();
    }
  }

  private static simulatePaymentScheduleProposal(params: {
    quoteId: string;
    quoteTotalCents: number;
    contextText: string;
    allowedStages: { id: string; name: string }[];
    reason?: string;
  }): QuotePaymentScheduleProposal {
    const contextLower = params.contextText.toLowerCase();
    const milestones: PaymentScheduleMilestoneSuggestion[] = [];

    const depositPct =
      /\b50\s*%|\b50\/50|\bhalf upfront\b/i.test(contextLower)
        ? "50"
        : /\bno deposit\b|\b0%\s*deposit\b/i.test(contextLower)
          ? null
          : "30";

    if (depositPct) {
      milestones.push({
        tempId: crypto.randomUUID(),
        title: "Deposit",
        percentage: depositPct,
        amountCents: null,
        anchorType: PaymentScheduleAnchorType.UPON_APPROVAL,
        anchorStageName: null,
        reasoning: "Standard deposit due upon quote approval.",
      });
    }

    const progressStage =
      params.allowedStages.find((stage) => /field|install|production/i.test(stage.name)) ??
      params.allowedStages.find((stage) => /inspection/i.test(stage.name)) ??
      params.allowedStages[params.allowedStages.length - 1];

    if (progressStage && milestones.length > 0 && !/\bno progress\b/i.test(contextLower)) {
      milestones.push({
        tempId: crypto.randomUUID(),
        title: "Progress payment",
        percentage: depositPct === "50" ? "40" : "40",
        amountCents: null,
        anchorType: PaymentScheduleAnchorType.AFTER_STAGE,
        anchorStageName: progressStage.name,
        reasoning: `Progress payment after ${progressStage.name} completes.`,
      });
    } else if (milestones.length === 0) {
      milestones.push({
        tempId: crypto.randomUUID(),
        title: "Deposit",
        percentage: "50",
        amountCents: null,
        anchorType: PaymentScheduleAnchorType.UPON_APPROVAL,
        anchorStageName: null,
        reasoning: "Simulated default deposit.",
      });
    }

    milestones.push({
      tempId: crypto.randomUUID(),
      title: "Final balance",
      percentage: null,
      amountCents: null,
      anchorType: PaymentScheduleAnchorType.FINAL_BALANCE,
      anchorStageName: null,
      reasoning: "Remainder due upon completion.",
    });

    return QuotePaymentScheduleProposalSchema.parse({
      quoteId: params.quoteId,
      sourceContextSummary: params.contextText.slice(0, 500),
      scheduleRationale: "Simulated industry-standard deposit, progress, and final balance schedule.",
      assumptions: ["Simulated: demo payment schedule for local development."],
      warnings: [
        "Demo AI output — not from the live provider.",
        ...(params.reason ? [`Simulated fallback reason: ${params.reason}`] : []),
      ],
      missingInfo: [],
      milestones,
    });
  }

  static async researchSiteDetails(params: {
    organizationId: string;
    serviceLocationId: string;
    addressLine: string;
    missingScopes: string[];
    existingOfficialVerificationUrl?: string | null;
  }): Promise<AISiteDetailsResearchResult> {
    const startedAt = new Date();
    const modelName = process.env.GEMINI_MODEL?.trim() || this.DEFAULT_GEMINI_MODEL;
    const groundedResearchPrompt = `Research contractor site details for:
Address: ${params.addressLine}
Requested scopes: ${params.missingScopes.join(", ")}

Rules:
- Focus on electric utility, building jurisdiction, county assessor resource, and explicit APN evidence.
- Include street number, city, state, and ZIP in your checks.
- Reject neighboring properties and mismatched ZIP evidence.
- Do not fabricate URLs.
- Summarize findings with source-backed notes.

APN (Assessor's Parcel Number) instructions — follow exactly:
- The APN is almost always shown directly in the search-result snippets for this address on real-estate listing sites such as Zillow, Redfin, Realtor.com, and Compass, and on county GIS/parcel viewers. You do NOT need to fill out any government search form to read it.
- Report the literal APN digits exactly as they appear in the search results for THIS exact address (e.g. "0137-081-100" or "0137081100"). An APN is a parcel id, NOT a ZIP code, NOT a ZIP+4 (a 5-digit ZIP followed by 4 digits), and NOT a phone number — never report those as the APN.
- State the APN value explicitly in your summary, and name which source it came from.
- Also provide the official county assessor parcel-search URL as the verification link, even when the actual APN value came from a listing site.
- Only if no source anywhere shows an APN for this exact address should you say the APN was not found; do not decline merely because the value lives on a listing site rather than a government page.`;

    const usage = await db.aiUsageLog.create({
      data: {
        organizationId: params.organizationId,
        serviceLocationId: params.serviceLocationId,
        feature: "site_details_research",
        provider: "gemini",
        model: modelName,
        requestKind: "missing_scope_grounded_research",
        status: "started",
        promptChars: groundedResearchPrompt.length,
        requestPayload: {
          addressLine: params.addressLine,
          missingScopes: params.missingScopes,
          configuredModel: modelName,
        } as unknown as Prisma.InputJsonValue,
        startedAt,
      },
      select: { id: true },
    });
    // #region agent log
    console.error("[agent-debug] a9eae3 aiServiceEntry reached", {
      runId: "pre-fix-3",
      hypothesisId: "H11",
      usageLogId: usage.id,
      serviceLocationId: params.serviceLocationId,
      requestedScopes: params.missingScopes,
    });
    // #endregion
    // #region agent log
    await fetch("http://127.0.0.1:7937/ingest/24410f3e-b077-4c1d-af62-4457af9c97bc", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a9eae3" },
      body: JSON.stringify({
        sessionId: "a9eae3",
        runId: "pre-fix-2",
        hypothesisId: "H9",
        location: "ai-service.ts:usageCreated",
        message: "Entered AIService.researchSiteDetails",
        data: {
          usageLogId: usage.id,
          serviceLocationId: params.serviceLocationId,
          requestedScopes: params.missingScopes,
        },
        timestamp: Date.now(),
      }),
    }).catch((error) => {
      console.error(
        "[agent-debug] a9eae3 log send failed",
        error instanceof Error ? error.message : String(error),
      );
    });
    // #endregion

    try {
      const apiKey = process.env.GEMINI_API_KEY?.trim();
      if (!apiKey) {
        throw new AiProviderTemporarilyUnavailableError("GEMINI_API_KEY missing.");
      }
      const groundedResearch = await this.retryWithBackoff(() =>
        this.withTimeout(
          researchGroundedSiteDetailsSources({
            apiKey,
            model: modelName,
            prompt: groundedResearchPrompt,
            timeoutMs: this.GEMINI_REQUEST_TIMEOUT_MS,
          }),
          this.GEMINI_REQUEST_TIMEOUT_MS,
        ),
      );

      const approvedSources = [...groundedResearch.approvedSources];
      let schemaParsed = SiteDetailsResearchSchema.parse({
        electricUtilityCandidate: null,
        jurisdictionName: null,
        jurisdictionType: null,
        jurisdictionSourceId: null,
        countyAssessorCounty: null,
        countyAssessorState: null,
        countyAssessorSourceId: null,
        apnEvidence: [],
        apnCandidate: null,
      });

      if (groundedResearch.groundingMetadataPresent && approvedSources.length > 0) {
        const extractionRaw = await this.retryWithBackoff(() =>
          this.withTimeout(
            extractSiteDetailsFromGroundedResearch({
              apiKey,
              model: modelName,
              timeoutMs: this.GEMINI_REQUEST_TIMEOUT_MS,
              addressLine: params.addressLine,
              missingScopes: params.missingScopes,
              groundedSummary: groundedResearch.groundedSummary,
              approvedSources,
            }),
            this.GEMINI_REQUEST_TIMEOUT_MS,
          ),
        );
        // #region agent log
        await fetch("http://127.0.0.1:7937/ingest/24410f3e-b077-4c1d-af62-4457af9c97bc", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a9eae3" },
          body: JSON.stringify({
            sessionId: "a9eae3",
            runId: "pre-fix-1",
            hypothesisId: "H1",
            location: "ai-service.ts:extractionRaw",
            message: "Extraction raw utility candidate payload",
            data: {
              hasElectricUtilityCandidate: Boolean(
                (extractionRaw as { electricUtilityCandidate?: unknown } | null)?.electricUtilityCandidate,
              ),
              extractedCoverageSourceId:
                (
                  extractionRaw as {
                    electricUtilityCandidate?: { coverageSourceId?: string | null } | null;
                  } | null
                )?.electricUtilityCandidate?.coverageSourceId ?? null,
              approvedSourceCount: approvedSources.length,
            },
            timestamp: Date.now(),
          }),
        }).catch((error) => {
          console.error(
            "[agent-debug] a9eae3 log send failed",
            error instanceof Error ? error.message : String(error),
          );
        });
        // #endregion
        schemaParsed = SiteDetailsResearchSchema.parse(extractionRaw);
      }

      const assessorSource = getApprovedGroundedSourceById(
        approvedSources,
        schemaParsed.countyAssessorSourceId,
      );
      const assessorAccepted = Boolean(
        schemaParsed.countyAssessorCounty && schemaParsed.countyAssessorState,
      );
      const countyAssessorSearchUrl = assessorSource?.url ?? null;
      const assessorScopeDecision: SiteDetailsScopeDecision = {
        outcome: assessorAccepted ? "ACCEPTED" : "NOT_FOUND",
        decisionCode: assessorAccepted
          ? schemaParsed.countyAssessorSourceId && !assessorSource
            ? "OPTIONAL_RESOURCE_URL_DROPPED"
            : "ACCEPTED"
          : "NOT_FOUND",
        candidatePresent: assessorAccepted,
        sourceReferences: schemaParsed.countyAssessorSourceId ? [schemaParsed.countyAssessorSourceId] : [],
        sourceReferencesResolved: assessorSource ? [assessorSource.id] : [],
        writeAttempted: false,
        writeApplied: false,
      };

      const extractedApnEvidence =
        schemaParsed.apnEvidence.length > 0
          ? schemaParsed.apnEvidence
          : schemaParsed.apnCandidate
            ? [schemaParsed.apnCandidate]
            : [];

      // When the general grounded pass does not surface an actual parcel number,
      // run a dedicated APN-only grounded search aimed at listing sites (Zillow,
      // Redfin, Realtor, county GIS) that display the APN directly in snippets.
      let apnSearchSummary = groundedResearch.groundedSummary;
      const apnScopeRequested = params.missingScopes.some(
        (scope) => scope.trim().toUpperCase() === "APN",
      );
      if (extractedApnEvidence.length === 0 && apnScopeRequested) {
        const apnFocusedPrompt = `What is the Assessor's Parcel Number (APN), also called the parcel number, for this exact property?
Address: ${params.addressLine}

Instructions:
- The APN is displayed directly in the property details on real-estate listing sites such as Zillow, Redfin, Realtor.com, and Compass, and on county GIS/parcel viewers. Read the value straight from those search results; you do not need to submit any government search form.
- Reply with the exact APN digits for THIS address (for example "0137-081-100" or "0137081100") and name the source that shows it.
- An APN is a parcel id. It is NOT a ZIP code, NOT a ZIP+4, and NOT a phone number.
- Only state that the APN was not found if no source anywhere shows an APN for this exact address.`;
        try {
          const apnFocused = await this.retryWithBackoff(() =>
            this.withTimeout(
              researchGroundedSiteDetailsSources({
                apiKey,
                model: modelName,
                prompt: apnFocusedPrompt,
                timeoutMs: this.GEMINI_REQUEST_TIMEOUT_MS,
              }),
              this.GEMINI_REQUEST_TIMEOUT_MS,
            ),
          );
          for (const focusedSource of apnFocused.approvedSources) {
            if (!approvedSources.some((existing) => existing.id === focusedSource.id)) {
              approvedSources.push(focusedSource);
            }
          }
          apnSearchSummary = `${groundedResearch.groundedSummary}\n${apnFocused.groundedSummary}`;
        } catch {
          // APN-focused search is best-effort when the general grounded pass misses parcel numbers.
        }
      }

      const trustedSourceLinks = approvedSources.map((source) => ({
        title: source.title,
        url: source.url,
      }));
      const fallbackApnEvidence =
        extractedApnEvidence.length > 0
          ? []
          : deriveApnEvidenceFromApprovedSources(
              approvedSources,
              params.addressLine,
              apnSearchSummary,
            );
      const apnEvidenceCandidates =
        extractedApnEvidence.length > 0 ? extractedApnEvidence : fallbackApnEvidence;
      const resolvedApnEvidence: Array<{
        value: string;
        sourceTitle: string;
        sourceUrl: string;
        addressMatched: boolean;
        apnShownOnSource: boolean;
        explanation: string;
      }> = [];
      const resolvedApnSourceIds: string[] = [];
      for (const item of apnEvidenceCandidates) {
        const source = getApprovedGroundedSourceById(approvedSources, item.sourceId);
        if (!source) continue;
        resolvedApnEvidence.push({
          value: item.value,
          sourceTitle: source.title,
          sourceUrl: source.url,
          addressMatched: item.addressMatched,
          apnShownOnSource: item.apnShownOnSource,
          explanation: item.explanation,
        });
        resolvedApnSourceIds.push(source.id);
      }

      const apnDecision = decideGroundedApnCandidate({
        apnEvidence: resolvedApnEvidence,
        sourceLinks: trustedSourceLinks,
        countyAssessorSearchUrl,
        existingOfficialVerificationUrl: params.existingOfficialVerificationUrl ?? null,
        addressLine: params.addressLine,
      });
      const apnScopeDecision: SiteDetailsScopeDecision = {
        outcome: "NOT_FOUND",
        decisionCode: "NOT_FOUND",
        candidatePresent: apnEvidenceCandidates.length > 0,
        sourceReferences: apnEvidenceCandidates.map((item) => item.sourceId),
        sourceReferencesResolved: resolvedApnSourceIds,
        writeAttempted: false,
        writeApplied: false,
      };
      if (apnEvidenceCandidates.length > 0 && resolvedApnEvidence.length === 0) {
        apnScopeDecision.outcome = "REJECTED";
        apnScopeDecision.decisionCode = "UNKNOWN_SOURCE_REFERENCE";
      } else if (apnDecision.candidate) {
        apnScopeDecision.outcome = "ACCEPTED";
        apnScopeDecision.decisionCode = "ACCEPTED";
      } else if (resolvedApnEvidence.length > 0) {
        apnScopeDecision.outcome = "REJECTED";
        if (apnDecision.neighborEvidenceDetected) {
          apnScopeDecision.decisionCode = "APN_NEIGHBOR_EVIDENCE";
        } else if (!apnDecision.exactAddressEvidenceMatch) {
          apnScopeDecision.decisionCode = "APN_ADDRESS_MISMATCH";
        } else if (
          apnDecision.reason === "NO_GROUNDED_EVIDENCE" ||
          apnDecision.reason === "INSUFFICIENT_GROUNDED_SOURCES" ||
          apnDecision.reason === "NO_OFFICIAL_VERIFICATION_URL" ||
          apnDecision.reason === "INVALID_OFFICIAL_VERIFICATION_URL"
        ) {
          apnScopeDecision.decisionCode = "APN_EVIDENCE_NOT_APPROVED";
        } else {
          apnScopeDecision.decisionCode = "APN_NOT_EXPLICITLY_SUPPORTED";
        }
      }

      const utilitySource = getApprovedGroundedSourceById(
        approvedSources,
        schemaParsed.electricUtilityCandidate?.coverageSourceId ?? null,
      );
      const utilityCandidateForDecision = schemaParsed.electricUtilityCandidate
        ? {
            name: schemaParsed.electricUtilityCandidate.name,
            officialWebsite: null,
            serviceUpgradeUrl: null,
            coverageSourceTitle: utilitySource?.title ?? "Grounded source",
            coverageSourceUrl: utilitySource?.url ?? "",
            coverageBasis: schemaParsed.electricUtilityCandidate.coverageBasis ?? "ADDRESS",
            addressMatched: schemaParsed.electricUtilityCandidate.addressMatched,
            isElectric: schemaParsed.electricUtilityCandidate.isElectric,
            explanation: schemaParsed.electricUtilityCandidate.explanation,
          }
        : null;
      const utilityDecision = groundedResearch.groundingMetadataPresent
        ? decideGroundedElectricUtilityCandidate({
            candidate: utilityCandidateForDecision,
            sourceLinks: trustedSourceLinks,
          })
        : { candidate: null, reason: "NO_CANDIDATE" as const };
      const utilityScopeDecision: SiteDetailsScopeDecision = {
        outcome: "NOT_FOUND",
        decisionCode: "NOT_FOUND",
        candidatePresent: Boolean(schemaParsed.electricUtilityCandidate),
        sourceReferences: schemaParsed.electricUtilityCandidate?.coverageSourceId
          ? [schemaParsed.electricUtilityCandidate.coverageSourceId]
          : [],
        sourceReferencesResolved: utilitySource ? [utilitySource.id] : [],
        writeAttempted: false,
        writeApplied: false,
      };
      if (schemaParsed.electricUtilityCandidate && !schemaParsed.electricUtilityCandidate.coverageSourceId) {
        utilityScopeDecision.outcome = "REJECTED";
        utilityScopeDecision.decisionCode = "UTILITY_COVERAGE_EVIDENCE_NOT_APPROVED";
      } else if (schemaParsed.electricUtilityCandidate && !utilitySource) {
        utilityScopeDecision.outcome = "REJECTED";
        utilityScopeDecision.decisionCode = "UTILITY_COVERAGE_EVIDENCE_NOT_APPROVED";
      } else if (utilityDecision.candidate) {
        utilityScopeDecision.outcome = "ACCEPTED";
        utilityScopeDecision.decisionCode = "ACCEPTED";
      } else if (schemaParsed.electricUtilityCandidate) {
        utilityScopeDecision.outcome = "REJECTED";
        utilityScopeDecision.decisionCode = "UTILITY_CANONICAL_MATCH_FAILED";
      }
      // #region agent log
      await fetch("http://127.0.0.1:7937/ingest/24410f3e-b077-4c1d-af62-4457af9c97bc", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a9eae3" },
        body: JSON.stringify({
          sessionId: "a9eae3",
          runId: "pre-fix-1",
          hypothesisId: "H2",
          location: "ai-service.ts:utilityScopeDecision",
          message: "Utility scope decision computed",
          data: {
            candidatePresent: utilityScopeDecision.candidatePresent,
            decisionCode: utilityScopeDecision.decisionCode,
            outcome: utilityScopeDecision.outcome,
            sourceReferences: utilityScopeDecision.sourceReferences,
            sourceReferencesResolved: utilityScopeDecision.sourceReferencesResolved,
            utilityDecisionReason: groundedResearch.groundingMetadataPresent
              ? utilityDecision.reason
              : "GROUNDING_METADATA_MISSING",
          },
          timestamp: Date.now(),
        }),
      }).catch((error) => {
        console.error(
          "[agent-debug] a9eae3 log send failed",
          error instanceof Error ? error.message : String(error),
        );
      });
      // #endregion

      const jurisdictionSource = getApprovedGroundedSourceById(
        approvedSources,
        schemaParsed.jurisdictionSourceId,
      );
      const jurisdictionAccepted = Boolean(schemaParsed.jurisdictionName && schemaParsed.jurisdictionType);
      const jurisdictionScopeDecision: SiteDetailsScopeDecision = {
        outcome: jurisdictionAccepted ? "ACCEPTED" : "NOT_FOUND",
        decisionCode: jurisdictionAccepted
          ? schemaParsed.jurisdictionSourceId && !jurisdictionSource
            ? "OPTIONAL_RESOURCE_URL_DROPPED"
            : "ACCEPTED"
          : "NOT_FOUND",
        candidatePresent: jurisdictionAccepted,
        sourceReferences: schemaParsed.jurisdictionSourceId ? [schemaParsed.jurisdictionSourceId] : [],
        sourceReferencesResolved: jurisdictionSource ? [jurisdictionSource.id] : [],
        writeAttempted: false,
        writeApplied: false,
      };

      const acceptedCount = [
        apnScopeDecision.outcome,
        utilityScopeDecision.outcome,
        jurisdictionScopeDecision.outcome,
        assessorScopeDecision.outcome,
      ].filter((outcome) => outcome === "ACCEPTED").length;
      const overallOutcome =
        acceptedCount === 0
          ? "NO_ACCEPTED_RESULTS"
          : acceptedCount === 4
            ? "FULL_SUCCESS"
            : "PARTIAL_RESEARCH_SUCCESS";

      const parsed: AISiteDetailsResearchResult = {
        electricUtilityCandidate: utilityDecision.candidate,
        jurisdictionName: schemaParsed.jurisdictionName,
        jurisdictionType: schemaParsed.jurisdictionType,
        jurisdictionOfficialWebsite: jurisdictionSource?.url ?? null,
        countyAssessorCounty: schemaParsed.countyAssessorCounty,
        countyAssessorState: schemaParsed.countyAssessorState,
        countyAssessorSearchUrl,
        apnEvidence: resolvedApnEvidence,
        apnCandidate: apnDecision.candidate,
        sourceLinks: trustedSourceLinks,
        approvedSources,
        scopeDecisions: {
          apn: apnScopeDecision,
          electricUtility: utilityScopeDecision,
          jurisdiction: jurisdictionScopeDecision,
          assessor: assessorScopeDecision,
        },
        diagnostics: {
          normalizedAddress: params.addressLine.trim(),
          requestedScopes: params.missingScopes,
          groundingToolEnabled: true,
          groundingMetadataPresent: groundedResearch.groundingMetadataPresent,
          groundingSearchQueries: groundedResearch.groundingSearchQueries,
          groundingSourceUrls: trustedSourceLinks.map((source) => source.url),
          rawApnCandidate: extractedApnEvidence[0]?.value ?? null,
          normalizedApnCandidate: apnDecision.normalizedCandidate,
          apnEvidenceSources: apnDecision.evidenceSourceUrls,
          exactAddressEvidenceMatch: apnDecision.exactAddressEvidenceMatch,
          neighborEvidenceDetected: apnDecision.neighborEvidenceDetected,
          apnDecision: apnDecision.candidate
            ? "accepted"
            : apnEvidenceCandidates.length > 0
              ? "rejected"
              : "none",
          apnDecisionReason: apnDecision.reason,
          rawUtilityCandidate: schemaParsed.electricUtilityCandidate?.name ?? null,
          normalizedUtilityAlias: schemaParsed.electricUtilityCandidate
            ? canonicalizeElectricUtilityName(schemaParsed.electricUtilityCandidate.name)
            : null,
          utilityDecision: utilityDecision.candidate
            ? "accepted"
            : schemaParsed.electricUtilityCandidate
              ? "rejected"
              : "none",
          utilityDecisionReason: groundedResearch.groundingMetadataPresent
            ? utilityDecision.reason
            : "GROUNDING_METADATA_MISSING",
          overallOutcome,
        },
      };
      // #region agent log
      await fetch("http://127.0.0.1:7937/ingest/24410f3e-b077-4c1d-af62-4457af9c97bc", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a9eae3" },
        body: JSON.stringify({
          sessionId: "a9eae3",
          runId: "pre-fix-1",
          hypothesisId: "H5",
          location: "ai-service.ts:parsedResult",
          message: "Research result before persistence layer",
          data: {
            overallOutcome: parsed.diagnostics?.overallOutcome ?? null,
            utilityScopeOutcome: parsed.scopeDecisions.electricUtility.outcome,
            jurisdictionScopeOutcome: parsed.scopeDecisions.jurisdiction.outcome,
            assessorScopeOutcome: parsed.scopeDecisions.assessor.outcome,
            apnScopeOutcome: parsed.scopeDecisions.apn.outcome,
            hasUtilityCandidate: Boolean(parsed.electricUtilityCandidate),
          },
          timestamp: Date.now(),
        }),
      }).catch((error) => {
        console.error(
          "[agent-debug] a9eae3 log send failed",
          error instanceof Error ? error.message : String(error),
        );
      });
      // #endregion
      const responsePayload = {
        ...parsed,
        groundedSummary: groundedResearch.groundedSummary.slice(0, 2_000),
      };

      await db.aiUsageLog.update({
        where: { id: usage.id },
        data: {
          status: "success",
          responseChars: JSON.stringify(responsePayload).length,
          responsePayload: responsePayload as unknown as Prisma.InputJsonValue,
          finishedAt: new Date(),
        },
      });
      return { ...parsed, usageLogId: usage.id };
    } catch (error) {
      const providerDetails = isSiteDetailsProviderError(error) ? error.details : null;
      // #region agent log
      await fetch("http://127.0.0.1:7937/ingest/24410f3e-b077-4c1d-af62-4457af9c97bc", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a9eae3" },
        body: JSON.stringify({
          sessionId: "a9eae3",
          runId: "pre-fix-2",
          hypothesisId: "H10",
          location: "ai-service.ts:catch",
          message: "AIService.researchSiteDetails caught error",
          data: {
            errorName: error instanceof Error ? error.name : "unknown",
            errorMessage: error instanceof Error ? error.message : String(error),
            providerStage: providerDetails?.stage ?? null,
            providerCode: providerDetails?.code ?? null,
            providerStatus: providerDetails?.status ?? null,
          },
          timestamp: Date.now(),
        }),
      }).catch((fetchError) => {
        console.error(
          "[agent-debug] a9eae3 log send failed",
          fetchError instanceof Error ? fetchError.message : String(fetchError),
        );
      });
      // #endregion
      await db.aiUsageLog.update({
        where: { id: usage.id },
        data: {
          status: "error",
          errorMessage: providerDetails
            ? JSON.stringify(providerDetails)
            : error instanceof Error
              ? error.message
              : "Unknown AI error",
          responsePayload: providerDetails ? (providerDetails as unknown as Prisma.InputJsonValue) : undefined,
          finishedAt: new Date(),
        },
      });
      if (isAiProviderTemporarilyUnavailable(error)) {
        throw new AiProviderTemporarilyUnavailableError();
      }
      throw error;
    }
  }
}
