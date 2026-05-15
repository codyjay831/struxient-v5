import { TaskTemplateCategory } from "@prisma/client";
import { AILibraryProposal, AILibraryProposalSchema } from "./library-proposal-schema";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";

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

export class AIService {
  private static readonly DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

  private static getGeminiClient() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    return new GoogleGenerativeAI(apiKey);
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
   * Returns true for errors that are worth retrying:
   * - Low-level fetch/network failures ("fetch failed", ECONNRESET, ETIMEDOUT, etc.)
   * - HTTP 5xx (server-side hiccups)
   * - HTTP 429 (rate limit)
   * Returns false for hard 4xx (auth, bad model, bad request) — those won't fix themselves.
   */
  private static isRetryableError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    // The Google SDK attaches `status` for HTTP-level errors.
    const status = (error as { status?: number }).status;
    if (typeof status === "number") {
      if (status === 429) return true;
      if (status >= 500 && status < 600) return true;
      return false;
    }

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

  /** Converts a thrown error into a short, user-friendly warning string. */
  private static friendlyErrorMessage(error: unknown): string {
    if (error instanceof z.ZodError) {
      const count = error.issues.length;
      const firstFew = error.issues
        .slice(0, 3)
        .map((i) => i.path.join(".") || "(root)")
        .join(", ");
      const suffix = count > 3 ? `, and ${count - 3} more` : "";
      return `The AI returned ${count} invalid field${count === 1 ? "" : "s"} (${firstFew}${suffix}). The plan was partially salvaged — please review before applying.`;
    }
    if (error instanceof Error) {
      // Strip noisy SDK preambles like "[GoogleGenerativeAI Error]: "
      return error.message.replace(/^\[[^\]]+\]:\s*/, "").trim() || "Unknown AI provider error.";
    }
    return "Unknown AI provider error.";
  }

  /**
   * Generates a realistic execution plan for a given line item template.
   */
  static async generateLibraryExecutionPlan(
    context: AIExecutionPlanContext
  ): Promise<AILibraryProposal> {
    const gemini = this.getGeminiClient();

    if (!gemini) {
      console.warn("GEMINI_API_KEY missing. Falling back to simulated output.");
      return this.simulateLibraryExecutionPlan(context, {
        reason: "GEMINI_API_KEY is missing.",
      });
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

    try {
      const modelName = process.env.GEMINI_MODEL?.trim() || this.DEFAULT_GEMINI_MODEL;
      const model = gemini.getGenerativeModel({ model: modelName });
      
      const prompt = this.buildContractorRealismPrompt(context, reusableTasks);

      const result = await this.retryWithBackoff(() => model.generateContent(prompt));
      const response = await result.response;
      const text = response.text();
      
      // Extract JSON from response (Gemini sometimes wraps in markdown blocks)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : text;
      
      const rawProposal = JSON.parse(jsonStr);

      // Normalize categories and track which ones we had to coerce.
      const normalizationWarnings: string[] = [];
      const normalizedTasks = (Array.isArray(rawProposal.tasks) ? rawProposal.tasks : []).map(
        (t: any, idx: number) => {
          const originalCategory = t?.category;
          const matched = this.normalizeCategory(originalCategory);
          const finalCategory = matched ?? TaskTemplateCategory.GENERAL;

          if (!matched && originalCategory != null && String(originalCategory).trim() !== "") {
            const taskLabel = t?.title ? `"${t.title}"` : `Task ${idx + 1}`;
            normalizationWarnings.push(
              `${taskLabel}: AI returned unknown category "${originalCategory}" — defaulted to General.`,
            );
          }

          return {
            ...t,
            category: finalCategory,
            tempId: crypto.randomUUID(),
            stageId:
              context.existingStages.find(
                (s) => s.name.toLowerCase() === t?.stageName?.toLowerCase(),
              )?.id ?? null,
          };
        },
      );

      const baseAssumptions = Array.isArray(rawProposal.assumptions) ? rawProposal.assumptions : [];
      const baseWarnings = Array.isArray(rawProposal.warnings) ? rawProposal.warnings : [];

      const proposal = {
        ...rawProposal,
        templateId: context.templateId,
        sourceContext: context.description,
        assumptions: baseAssumptions,
        warnings: [...baseWarnings, ...normalizationWarnings],
        tasks: normalizedTasks,
      };

      return AILibraryProposalSchema.parse(proposal);
    } catch (e) {
      console.error("Gemini generation failed, falling back to simulation", e);
      return this.simulateLibraryExecutionPlan(context, {
        reason: this.friendlyErrorMessage(e),
      });
    }
  }

  private static buildContractorRealismPrompt(
    context: AIExecutionPlanContext,
    reusableTasks: any[] = []
  ): string {
    const stageNames = context.existingStages.map(s => s.name).join(", ");
    const signalNames = context.existingSignals.join(", ");
    const allowedCategories = Object.values(TaskTemplateCategory).join(", ");

    const reusableTaskList = reusableTasks.map(t => 
      `- [ID: ${t.id}] "${t.title}" (Category: ${t.category}, Stage: ${t.stage?.name || 'None'}, Tags: ${t.tags.map((tg: any) => tg.name).join(", ")})`
    ).join("\n");

    return `
You are a realistic contractor execution planner. Your job is to draft a structured execution plan for a commercial line item.

LINE ITEM DESCRIPTION: "${context.description}"
LINE ITEM TAGS: [${context.tags.join(", ")}]
ORGANIZATION CONTEXT: "${context.organizationName || 'General Contractor'}"
EXISTING STAGES: [${stageNames}]
EXISTING SIGNALS: [${signalNames}]
USER INSTRUCTIONS: "${context.userInstructions || 'None'}"

AVAILABLE REUSABLE TASKS FROM LIBRARY (PRIORITIZE THESE):
${reusableTaskList || 'None matching current tags.'}

ALLOWED TASK CATEGORIES (use EXACTLY one of these, uppercase, no other values permitted):
${allowedCategories}

CATEGORY GUIDANCE:
- GENERAL: physical work, install, prep, demo, framing, finish, cleanup, safety briefings.
- PERMIT: permits, AHJ submissions, jurisdictional approvals, licensing checks.
- INSPECTION: rough/final inspections, sign-offs, QA checks by an inspector.
- MATERIAL: ordering, delivery, staging, procurement of physical materials/parts.
- PAYMENT: invoices, deposits, billing milestones, financial collection.
- CUSTOMER_COMMUNICATION: any email/phone/text/in-person contact with the homeowner or client.
- PHOTO_EVIDENCE: required photos, documentation uploads, visual proof of work.
- SCHEDULING: appointments, dispatching crews, calendar booking, coordination.

GOAL:
Propose a set of tasks that a real contractor would perform to execute this scope.
Avoid generic task lists. Think about permits, material orders, site prep, rough-in, inspections, and finish work.

RULES:
1. SELECT FROM REUSABLE TASKS FIRST. If an available reusable task fits the need, use its ID and title exactly.
2. ONLY GENERATE NEW TASKS for gaps not covered by the library.
3. Group tasks by STAGE. Use the existing stages provided if they fit, or suggest a logical stage name.
4. Define SIGNALS for dependencies. If Task B requires Task A to be done, Task A should "provide" a signal and Task B should "require" it.
5. Mark critical blockers as "hardSignal: true".
6. Include a checklist for each task.
7. List required resources/equipment.
8. Provide "reasoning" for each task and "assumptions" for the whole plan (especially regarding local codes/jurisdiction).
9. The "category" field MUST be exactly one of the ALLOWED TASK CATEGORIES above — uppercase, no spaces, no synonyms, no invented values. If unsure, use GENERAL.

OUTPUT FORMAT:
Return ONLY a valid JSON object matching this structure:
{
  "assumptions": ["string"],
  "warnings": ["string"],
  "tasks": [
    {
      "sourceTaskTemplateId": "string (ID from reusable tasks if selected, otherwise null)",
      "title": "string",
      "category": "one of: ${allowedCategories}",
      "instructions": "string",
      "stageName": "string",
      "providesSignals": ["string"],
      "requiresSignals": ["string"],
      "hardSignal": boolean,
      "checklist": [{"label": "string"}],
      "resources": [{"name": "string", "quantity": number, "isEquipment": boolean}],
      "reasoning": "string",
      "confidence": number (0-1)
    }
  ]
}
`;
  }

  /** Compatibility layer for existing Quote Mode */
  static async generateExecutionPlan(description: string) {
    const proposal = await this.generateLibraryExecutionPlan({
      templateId: "compat",
      description,
      existingStages: [],
      existingSignals: [],
    });
    return proposal;
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

  /** Simulated fallback for local dev */
  private static async simulateLibraryExecutionPlan(
    context: AIExecutionPlanContext,
    options: { reason?: string } = {}
  ): Promise<AILibraryProposal> {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const { templateId, description, existingStages } = context;
    const d = description.toLowerCase();
    
    const proposal: AILibraryProposal = {
      templateId,
      sourceContext: description,
      assumptions: [
        "Simulated: Assumed standard residential safety protocols apply.",
        "Simulated: Assumed typical crew size of 2-4 people."
      ],
      warnings: [options.reason || "This is a simulated response."],
      tasks: [],
    };

    const findStageId = (name: string) => {
      const match = existingStages.find(s => s.name.toLowerCase().includes(name.toLowerCase()));
      return match?.id || null;
    };

    if (d.includes("roof") || d.includes("shingle")) {
      proposal.tasks = [
        {
          tempId: crypto.randomUUID(),
          title: "Material Delivery & Roof Loading",
          category: TaskTemplateCategory.MATERIAL,
          instructions: "Ensure shingles are distributed across the ridge for weight balance.",
          stageName: "Preparation",
          stageId: findStageId("Prep"),
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
          stageName: "Rough-in",
          stageId: findStageId("Rough"),
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
      proposal.tasks = [
        {
          tempId: crypto.randomUUID(),
          title: `Setup for ${description}`,
          category: TaskTemplateCategory.GENERAL,
          stageName: "Preparation",
          stageId: findStageId("Prep"),
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
          stageName: "Installation",
          stageId: findStageId("Install"),
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

    return AILibraryProposalSchema.parse(proposal);
  }
}
