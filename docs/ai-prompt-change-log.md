# AI Prompt Change Log

Purpose: track AI prompt behavior changes by user-facing button/workflow.

This file is implementation guidance, not product canon. For product intent and boundaries, use:
- `docs/canon/execution-engine-canon.md`
- `docs/canon/templates-and-execution-planning.md`
- `docs/source-of-truth-map.md`

## Global AI rules (applies to all prompts)

- AI proposals are review-then-apply; no silent persistence.
- AI output stays ephemeral until explicit human apply action.
- Prompts should prefer operational clarity over speculative detail.
- Prompt changes must include expected behavior and anti-behavior.

## AI button and prompt inventory

| Prompt ID | User-facing surface | Entry action/route | Prompt owner |
|---|---|---|---|
| `execution_plan_quote_line` | Quote line: generate draft execution plan | `generateQuoteLineExecutionAIProposalAction` in `apps/web/src/app/(workspace)/quotes/quote-line-execution-actions.ts` | `AIService.buildContractorRealismPrompt` in `apps/web/src/lib/ai/ai-service.ts` |
| `execution_plan_scope_library` | Scope Library line item: generate default execution | `generateLineItemTemplateAIProposalAction` in `apps/web/src/app/(workspace)/settings/scope-library/line-item-template-execution-actions.ts` | `AIService.buildContractorRealismPrompt` in `apps/web/src/lib/ai/ai-service.ts` |
| `execution_context_assessment_quote_line` | Quote line: assess missing execution context | `assessQuoteLineExecutionContextAction` in `apps/web/src/app/(workspace)/quotes/quote-line-execution-actions.ts` | `AIService.buildExecutionContextAssessmentPrompt` in `apps/web/src/lib/ai/ai-service.ts` |
| `execution_context_assessment_scope_library` | Scope Library line item: assess missing execution context | `assessLineItemTemplateExecutionContextAction` in `apps/web/src/app/(workspace)/settings/scope-library/line-item-template-execution-actions.ts` | `AIService.buildExecutionContextAssessmentPrompt` in `apps/web/src/lib/ai/ai-service.ts` |
| `execution_review_quote_wide` | Execution Review: whole-quote AI Secretary review | `generateQuoteExecutionReviewAIProposalAction` in `apps/web/src/app/(workspace)/quotes/quote-execution-secretary-actions.ts` | `AIService.generateQuoteExecutionReviewProposal` prompt in `apps/web/src/lib/ai/ai-service.ts` |
| `quote_scope_suggestions` | Quote authoring: generate line-item scope suggestions | `generateQuoteScopeSuggestionsAction` in `apps/web/src/app/(workspace)/quotes/quote-line-items-ai-actions.ts` | `AIService.generateScopeSuggestions` prompt in `apps/web/src/lib/ai/ai-service.ts` |
| `recovery_path_suggestions` | Job issue recovery: suggest recovery tasks | `suggestRecoveryPathAction` in `apps/web/src/app/(workspace)/jobs/recovery-actions.ts` | `AIService.suggestRecoveryPath` prompt in `apps/web/src/lib/ai/ai-service.ts` |
| `tag_suggestions` | Tag helper API: suggest tags from title/description/context | `POST /api/ai/suggest-tags` in `apps/web/src/app/api/ai/suggest-tags/route.ts` | `AIService.suggestTags` prompt in `apps/web/src/lib/ai/ai-service.ts` |
| `tag_merge_suggestions` | Scope Library tags: suggest merge candidates | `suggestTagMergesAction` in `apps/web/src/app/(workspace)/settings/scope-library/tag-actions.ts` | `AIService.suggestTagMerges` prompt in `apps/web/src/lib/ai/ai-service.ts` |

Note: `generateDailyJobLogDraft` in `apps/web/src/lib/daily-job-log-helper.ts` is deterministic and does not currently use AI.

## Prompt change record template

Use one section per behavior change.

```md
## [YYYY-MM-DD] <prompt_id> - <short title>

- Owner file/function: `path/to/file.ts` / `functionName`
- Entry surfaces: `<buttons/routes/actions>`
- Why this change:
  - <reason 1>
  - <reason 2>
- Intended behavior:
  - <what should happen>
  - <task granularity / tone expectations>
- Anti-behavior to block:
  - <what should stop happening>
- Input assumptions:
  - <what the prompt can assume>
  - <what must stay in missingContext instead>
- Output expectations:
  - <shape constraints>
  - <quality constraints>
- Test coverage updates:
  - `path/to/test-file.ts`: <what was asserted>
- Validation notes:
  - <manual checks / known residual risk>
```

## Change history

## [2026-06-03] execution_review_quote_wide - Whole-quote execution assembly proposals

- Owner file/function: `apps/web/src/lib/ai/ai-service.ts` / `generateQuoteExecutionReviewProposal`
- Entry surfaces:
  - Execution Review AI Secretary panel
- Why this change:
  - Line-level generation plus signal-only cross-line heuristics left real mixed-scope quotes with manual-only cleanup.
  - Users need quote-wide AI suggestions before activation when templates and ad hoc tasks are combined.
- Intended behavior:
  - Generate one quote-level proposal with explicit operations:
    - add missing provider tasks
    - patch task signals across lines
    - report consolidation hints
    - capture manual-decision items
  - Keep review-then-apply boundaries with selectable operations.
- Anti-behavior to block:
  - Silent mutation of quote execution tasks.
  - Commercial line-item or pricing changes.
  - Stage IDs outside allowed organization stages.
- Output expectations:
  - `QuoteExecutionReviewProposalSchema` JSON payload with deterministic operation ids.
  - Clear warnings and missing-context lists when certainty is low.
- Test coverage updates:
  - `apps/web/src/lib/ai/quote-execution-review-proposal.test.ts`
- Validation notes:
  - Apply-time validation enforces line/task/stage ownership and simulated-output guardrails.
  - Consolidation remains recommendation-first; destructive merges are not automatic.

## [2026-06-03] execution_plan_quote_line + execution_plan_scope_library - Execution-gate planning + quality warnings

- Owner file/function: `apps/web/src/lib/ai/ai-service.ts` / `buildContractorRealismPrompt`
- Supporting code:
  - `apps/web/src/lib/ai/execution-plan-quality-warnings.ts` (new) — review-time drift warnings
  - JSON mode enabled on the execution-plan Gemini call (`responseMimeType: "application/json"`), regex extraction kept as fallback
- Entry surfaces:
  - Quote line draft execution generation
  - Scope Library default execution generation
- Why this change:
  - Even after the neutral-spine pass, output drifted into generic construction schedules: admin filler, technical details as top-level tasks, default payment/walkthrough/closeout tasks, and AHJ inspection scheduling mis-categorized as SCHEDULING.
- Intended behavior:
  - Shifted prompt from generic construction planning to **execution-gate planning**: top-level tasks must be real operational gates (site visit, permit submit/approve, material readiness, scheduling, install, inspection schedule/attend, explicit payment hold).
  - Technical details (breaker/wire size, charger specs, load calc, panel capacity, conduit route, measurements, mounting height, basic testing) are task instructions/checklist/missingContext, **not** top-level tasks by default.
  - Payment tasks require explicit payment/billing input in scope or instructions.
  - AHJ inspection scheduling is category INSPECTION (stage Inspection, OFFICE), not SCHEDULING; attendance is INSPECTION + FIELD.
  - Confidence must never be 1.0; reasoning is one sentence; resources stay minimal.
  - Dependency signals use lowercase dot-key format (e.g. `permit.approved`).
- Anti-behavior to block (now surfaced as review warnings):
  - Task count > 8 on simple single-trade scopes.
  - confidence === 1.
  - SCHEDULING category used for inspection/AHJ scheduling.
  - PAYMENT task without payment/billing mention.
  - Forbidden filler titles (Project Kickoff, Scope Confirmation, Crew Mobilization, Site Setup, Site/Final Cleanup, Customer Walkthrough/Acceptance, Final Documentation, Project Closeout, Archive Project, Issue Final Invoice, Collect Payment).
  - CamelCase dependency signals.
  - Same unresolved issue appearing in both assumptions and missingContext.
  - Category-like stageName that is not an allowed stage (e.g. "Scheduling").
- Output expectations:
  - Same JSON schema (`AILibraryProposalSchema`); generate → review → apply flow unchanged.
  - Simple EV charger: ~5-8 tasks, no default payment/cleanup/walkthrough/closeout, no standalone charger-spec/load-calc/breaker/wire task, inspection schedule + attend both INSPECTION/Inspection.
- Test coverage updates:
  - `apps/web/src/lib/ai/ai-service-prompt.test.ts`: asserts execution-gate prompt sections and rules.
  - `apps/web/src/lib/ai/execution-plan-quality-warnings.test.ts`: asserts each warning + clean EV plan produces none.
- Validation notes:
  - Warnings are non-blocking; apply-time blocking still lives in `validateQuoteAiExecutionPlanForApply`.
  - "Simple single-trade" is not auto-detected; the >8 warning is generic guidance, not a hard cap.

## [2026-06-03] execution_plan_quote_line + execution_plan_scope_library - MVP neutral execution spine

- Owner file/function: `apps/web/src/lib/ai/ai-service.ts` / `buildContractorRealismPrompt`
- Entry surfaces:
  - Quote line draft execution generation
  - Scope Library default execution generation
- Why this change:
  - EV charger and similar simple scopes were over-planned (too many tasks, too much technical specificity).
  - Prompt behavior drift made outputs broad and less assignable for office/field/customer operations.
- Intended behavior:
  - Produce a small, neutral operational execution path.
  - Keep office, field, and customer responsibilities visible.
  - Keep permits, inspections, material readiness, schedule/access blockers explicit when operationally required.
- Anti-behavior to block:
  - Engineering-spec task titles for details not explicitly provided.
  - Generic filler task sprawl (mobilization/cleanup/document upload as standalone tasks when not operational blockers).
  - End-of-job closeout duplication.
- Output expectations:
  - For simple single-trade scopes, target roughly 5-8 tasks.
  - Use checklist and missing context for unresolved technical specifics.
- Test coverage updates:
  - `apps/web/src/lib/ai/ai-service-prompt.test.ts` assertions for MVP constraints.
- Validation notes:
  - Re-run execution prompt-related tests and compare EV charger generation against gold behavior.
