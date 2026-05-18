# Current Execution Engine Audit

> **Mode:** Read-only / current-state. Code is treated as source of truth; docs are referenced only to flag potential drift.
>
> **Generated:** 2026-05-18 (Cursor Ask-mode audit).
>
> **Scope:** Quote line items → execution review → activation → job tasks/stages → readiness/blocking → issues → recovery → payments → workstation → AI execution generation → activity/logs.

---

## 0. Files inspected

Schema & rules
- `apps/web/prisma/schema.prisma`
- `docs/source-of-truth-map.md`
- `docs/architecture-guardrails.md`
- `docs/workstation-guardrails.md`
- `.cursor/rules/no-schema-without-approval.mdc`

Canonical helpers
- `apps/web/src/lib/db.ts`
- `apps/web/src/lib/task-readiness.ts`
- `apps/web/src/lib/job-payment-readiness.ts`
- `apps/web/src/lib/resolve-job-issue-core.ts`
- `apps/web/src/lib/job-execution-health.ts`
- `apps/web/src/lib/workstation-query.ts`
- `apps/web/src/lib/workstation/rank.ts`
- `apps/web/src/lib/quote-readiness.ts`
- `apps/web/src/lib/quote-job-activation-readiness.ts`
- `apps/web/src/lib/job-task-execution-loader.ts`
- `apps/web/src/lib/job-task-override-guard.ts`
- `apps/web/src/lib/signal-bus.ts`
- `apps/web/src/lib/record-workflow-surface.ts`
- `apps/web/src/lib/quote-line-item-template-apply-tx.ts`

Server actions
- `apps/web/src/app/(workspace)/quotes/quote-job-activation-actions.ts`
- `apps/web/src/app/(workspace)/quotes/quote-line-execution-actions.ts`
- `apps/web/src/app/(workspace)/jobs/job-task-actions.ts`
- `apps/web/src/app/(workspace)/jobs/job-issue-actions.ts`
- `apps/web/src/app/(workspace)/jobs/recovery-actions.ts`
- `apps/web/src/app/(workspace)/settings/scope-library/line-item-template-execution-actions.ts`

AI
- `apps/web/src/lib/ai/ai-service.ts`
- `apps/web/src/lib/ai/ai-execution-plan-generation.ts`
- `apps/web/src/lib/ai/quote-ai-execution-plan.ts`
- `apps/web/src/lib/ai/library-ai-execution-plan.ts`
- `apps/web/src/lib/ai/library-proposal-schema.ts`
- `apps/web/src/lib/ai/ai-execution-plan-corrections.ts`

UI / pages
- `apps/web/src/app/(workspace)/workstation/page.tsx`
- `apps/web/src/app/(workspace)/jobs/[jobId]/page.tsx`
- `apps/web/src/app/(workspace)/quotes/[quoteId]/execution-review/page.tsx`
- `apps/web/src/components/jobs/task-work-surface.tsx`
- `apps/web/src/components/jobs/job-task-card.tsx`
- `apps/web/src/components/jobs/job-issue-manager.tsx`
- `apps/web/src/components/jobs/recovery-flow-builder.tsx`

---

## 1. Current Data Model Map

Models below are listed in execution-relevance order. For each: what it is today, owner, who creates/updates/reads it, what is stored vs derived, and risky fields.

### 1.1 `Stage` (library, org-scoped)
- **Represents:** A reusable named bucket on the org (e.g. "Site Prep", "Rough-in", "Corrections"). Has `sortOrder` and `archivedAt`.
- **Owner:** Org settings → Scope Library.
- **Created by:** `stage-actions.ts`; auto-created on demand for `"Corrections"` by `recovery-actions.ts` and `job-issue-actions.ts`.
- **Updated by:** Scope Library settings.
- **Read by:** Quote execution editing, AI plan stage mapping, activation, recovery task creation.
- **Source of truth:** Yes — for stage *identity and presets*.
- **Derived?** No.
- **Risk fields:** None. But the `"Corrections"` string is a magic value resolved with both literal compare and (in some places) `normalizeStageLabel`. There is a `CORRECTIONS_STAGE_NAME` constant in `job-payment-readiness.ts` and a separate literal `"Corrections"` in `recovery-actions.ts` and `job-issue-actions.ts`. Drift detector exists (`detect-corrections-constant-drift.mjs`, warn-only).

### 1.2 `TaskTemplate` (library, org-scoped)
- **Represents:** Reusable task preset with completion requirements, signals, default stage.
- **Owner:** Scope Library.
- **Created by:** `task-template-actions.ts`.
- **Read by:** quote-line `addQuoteLineExecutionTaskFromReusableAction`, AI prompt (reusable tasks list), execution review picker.
- **SoT?** Yes for the *preset itself*. Live edits do **not** propagate to copied rows (`QuoteLineExecutionTask`, `JobTask`).
- **Reserved fields (declared but not used by execution today):** `assigneeRole`, `costBudgetCents`, `estimatedMinutes`, `partsRequiredJson`. Comments mark them "Reserved". They show in `lineItemTemplateTask` / `quoteLineExecutionTask` / `jobTask` too.
- **Risk:** `requirementsJson` accepts an opaque JSON blob. Schema doesn't constrain shape — `task-readiness.ts` defines `TaskCompletionRequirements` as the implicit contract.

### 1.3 `LineItemTemplate` (library, org-scoped)
- **Represents:** Reusable commercial line preset (price + presentation + tags) with optional default execution tasks.
- **Owner:** Scope Library.
- **Read by:** Quote creation (apply template), AI prompt (tags → reusable tasks).
- **Risk:** `priceBufferPercentage` exists but I did not see it consumed in apply or quote-money rollup; warrants follow-up.

### 1.4 `LineItemTemplateTask` (library)
- **Represents:** Default execution preset attached to a saved line item.
- **Created/updated by:** `line-item-template-execution-actions.ts` (manual + AI apply path).
- **Copied from:** Optional `sourceTaskTemplateId` (snapshot — not live-linked).
- **Copied to:** `QuoteLineExecutionTask` on `performApplyLineItemTemplateToQuoteTx` (`quote-line-item-template-apply-tx.ts`).
- **SoT?** Yes for *what default execution a line preset proposes*.

### 1.5 `Quote` / `QuoteLineItem`
- **Represents:** Working commercial record. Lines drive both customer-facing pricing and the *seed* for execution planning.
- **Stored:** `subtotalCents`, `totalCents` (rolled up by `recalculateQuoteRollupsInTx`), customer-facing snippets, internal notes.
- **Derived:** Readiness (`getQuoteReadiness`), commercial progress (`getLeadCommercialProgress`), activation readiness (`evaluateQuoteJobActivationReadiness`).
- **Risk:** No denormalized `organizationId` on `QuoteLineItem` (intentional). Editing line items must reach through `quote.organizationId` (and does, consistently).

### 1.6 `QuoteLineExecutionTask` ★ central execution authoring row
- **Represents:** A draft execution task attached to a quote line — the planned work that will materialize into a `JobTask` at activation.
- **Created by:**
  - `addQuoteLineExecutionTaskFromReusableAction`
  - `addQuoteLineExecutionTaskCustomAction`
  - `generateQuoteLineExecutionPlanAction` (AI; **direct persist**, see §8)
  - `performApplyLineItemTemplateToQuoteTx` (copy from `LineItemTemplateTask`)
- **Updated by:** `updateQuoteLineExecutionTaskAction`, `moveQuoteLineExecutionTaskAction` (sort), `deleteQuoteLineExecutionTaskAction`.
- **Read by:** Quote execution review page, activation, workstation `evaluateQuoteJobActivationReadiness`.
- **SoT?** Yes for *the plan to execute this line of work* until activation. After activation, the job copy is the SoT.
- **Risk fields:** Same "Reserved" fields as TaskTemplate (`assigneeRole`, etc.) — pulled forward but unused. `partsRequiredJson` is consumed by neither readiness nor activation today.
- **Risk linkage:** `stageId` may be null at any point; `quote-job-activation-readiness.ts` rejects activation with `TASK_MISSING_STAGE` if so.

### 1.7 `PaymentScheduleItem`
- **Represents:** Commercial commitments parsed at quote time: deposit, milestone, final balance.
- **Stored:** `anchorType` (UPON_APPROVAL / BEFORE_STAGE / AFTER_STAGE / FINAL_BALANCE), `anchorStageId`, `amountCents` or `percentage`.
- **Read by:** activation (creates `JobPaymentRequirement`), `job-payment-readiness.ts` (via `loadScheduleAnchorsByIds`).
- **SoT?** Yes for commercial schedule; once activation runs, `JobPaymentRequirement` becomes the runtime SoT.
- **Risk:** `percentage` exists but I did not see it normalized into `amountCents` at activation. Activation falls back to raw `amountCents` (so percentage-only items create $0 requirements).

### 1.8 `Job`
- **Represents:** Runtime container materialized at activation. One job per quote (`@@unique` on `quoteId`).
- **Stored:** `status` (`ACTIVE` | `ARCHIVED`), `activatedAt`, denormalized `customerId` / `leadId` snapshots.
- **Derived:** Health (`deriveJobExecutionHealth`), execution progress, blocked state.
- **Risk:** Only two statuses. No "completed/closed/in correction" state — derived purely from task/payment/issue state, which is what canon intends, but it means "job done" relies entirely on `deriveJobExecutionHealth.primaryState === "COMPLETE"`.

### 1.9 `JobStage`
- **Represents:** Materialized stage on a job.
- **Created by:** Activation (from distinct `stageId`s referenced by tasks); recovery + follow-up actions (lazily create the `Corrections` JobStage when first needed).
- **Stored:** `stageId` (FK to org `Stage`, nullable on `SetNull`), `title`, `sortOrder`, `sourceQuoteLineItemId` (nullable).
- **Risk: dead-fields drift (HIGH).** `providesSignals` and `requiresSignals` exist on `JobStage` and are *read* by `deriveTaskState`, `deriveStageState`, `deriveJobExecutionHealth`, `signal-bus.publishSignal` (stage-complete promotion), but are **never written** at activation or anywhere else in the code. Activation only writes signals on `JobTask`. So stage-level signal logic is a real, executed code path that operates against permanently empty arrays. The signal-promotion code in `completeJobTaskAction` reads `task.jobStage.providesSignals` and publishes nothing because it is `[]`. This is dead infrastructure with a latent bug.
- **Risk:** `sourceQuoteLineItemId` is nullable + `SetNull` so it can orphan silently when a quote line is later deleted. There is no `sortOrder` field on the *source line* used to disambiguate ordering when multiple lines map to the same stage.

### 1.10 `JobTask` ★ central runtime row
- **Represents:** Runtime task on a job — copied from `QuoteLineExecutionTask` at activation OR created from recovery/issue follow-up.
- **Stored:** `status` (TODO/DONE only), `completedAt`, `completedByUserId`, `completionNote`, `completionRequirementsJson` (proof), `providesSignals`, `requiresSignals`, `hardSignal`, `sortOrder` (within stage), `recoveryFlowId` (nullable), `recoveryFlowOrder`, `sourceJobIssueId` (nullable), `sourceQuoteLineItemId`/`sourceQuoteLineExecutionTaskId` (nullable lineage), `sourceTaskTemplateId` (nullable, was-from-library), `stageId` (org stage FK, nullable), `actualMinutes` (unused), reserved fields (unused).
- **Created by:** Activation; `createFollowUpTaskFromIssueAction`; `addRecoveryTaskAction`.
- **Updated by:** `completeJobTaskAction`, `overrideJobTaskReadinessAction`, `toggleJobTaskChecklistItemAction`, `updateJobTaskStatusAction` (internal-only, can revert DONE → TODO but does **not** retract signals).
- **Read by:** Job detail, task work surface, workstation, execution health, payment hold.
- **SoT?** Yes for runtime work.
- **Derived?** Readiness, blocker reasons, proof gaps.
- **Risk:** `JobTaskStatus` enum has only TODO/DONE — no IN_PROGRESS. No "skipped/canceled" terminal state. Tasks moved away from quote-line execution **don't auto-clean** if the quote line is later deleted (`SetNull`), but the job is supposed to be independent post-activation, so this is intentional but worth noting.
- **Risk:** `recoveryFlowOrder` is a parallel sort key to `sortOrder` — both populated for recovery tasks. `workstation-query.ts` sorts by `jobStage.sortOrder` then `task.sortOrder`, ignoring `recoveryFlowOrder`. The execution-health code sorts main vs recovery using different keys (main → sortOrder, recovery → recoveryFlowOrder).
- **Risk:** No `assigneeUserId` exists at runtime today — only `assigneeRole?` reserved-but-unused.

### 1.11 `JobSignal`
- **Represents:** Per-job fact bus. Unique on `(jobId, name)`.
- **Stored:** `publishedAt`, `sourceJobTaskId`, `sourceJobStageId`.
- **Created/updated by:** `publishSignal` (upsert) called from activation (auto-satisfy soft orphans), task completion, override completion, manager override.
- **Retracted by:** `retractSignal` (defined, but **not invoked anywhere** in the running code).
- **Read by:** `getLiveSignals`, which filters out signals whose source task/stage has an OPEN BLOCKS_WORK issue ("muted"). The mute logic is critical to readiness behavior.
- **Risk:** Signals once published live forever unless the source task/stage gets a blocking issue. There is no path to retract a signal when a task is reverted (`updateJobTaskStatusAction` says "Signal retraction on revert is not implemented in v1.").

### 1.12 `JobIssue`
- **Represents:** A discovered problem on a job/stage/task.
- **Stored:** `type` (enum), `severity` (BLOCKS_WORK / DOES_NOT_BLOCK), `status` (OPEN/RESOLVED/CANCELLED), optional linkage to `jobStage`, `jobTask`, `recoveryFlow`.
- **Created by:** `createJobIssueAction`.
- **Updated by:** `resolveJobIssueAction` (standard), `forceResolveJobIssueAction` (force), `resolveIssueAndResumeAction` (resume). All call `resolveJobIssueWithRecoveryHandling`.
- **Read by:** task readiness (blocks task and stage), execution health, workstation.
- **SoT?** Yes for "is there a problem here right now?"
- **Risk: severity is binary.** Recovery rules and workstation only react to BLOCKS_WORK + OPEN issues. `DOES_NOT_BLOCK` issues do almost nothing — they are recorded but neither surface in workstation as warnings nor influence execution health (only as `PAYMENT_ATTENTION_ONLY` warning kind for unrelated reasons).

### 1.13 `JobRecoveryFlow`
- **Represents:** Structured multi-task recovery plan attached to an issue (1:1).
- **Stored:** `status` (DRAFT/ACTIVE/COMPLETED/CANCELLED), source-context fields (`sourceFailedTaskId`, `sourceChecklistItemId`, `sourcePermitEventId`, `sourceInspectionEventId` — only `sourceFailedTaskId` is wired in `recovery-actions.ts`, the others are accepted but not used).
- **Created by:** `createRecoveryFlowAction` (idempotent per issue via `@@unique`).
- **Status transitions:**
  - DRAFT → ACTIVE: `activateRecoveryFlowAction`.
  - ACTIVE → COMPLETED: only inside `resolveJobIssueWithRecoveryHandling` when caller passes `mode: "resume" | "standard"` and all recovery tasks DONE.
  - any → CANCELLED: only inside the same helper with `mode: "force"`.
- **Read by:** task readiness (`recoveryFlowIssueId` bypass), execution health (RECOVERY_ACTIVE / RECOVERY_READY_TO_RESUME / STALE_RECOVERY_FLOW), workstation issue card next step.

### 1.14 `JobPaymentRequirement`
- **Represents:** Runtime payment requirement copied from `PaymentScheduleItem` at activation, plus manual additions.
- **Stored:** `status` (PENDING/DUE/PAID/WAIVED/CANCELED), `paidAt`/`waivedAt`/`canceledAt`, `requiredBeforeStageId` (FK to `JobStage`, nullable), `sourcePaymentScheduleItemId` (lineage; **no Prisma relation**).
- **Created by:** `activateQuoteJobAction`, `job-payment-actions.ts` (manual).
- **Updated by:** `job-payment-actions.ts`; status auto-promoted by `promotePendingPaymentsToDue` after task completion.
- **Read by:** `isPaymentEffectivelyDue` / `getUnsettledEffectivelyDueRequirements`, workstation, job detail, task hold.
- **SoT for stored status:** Yes; SoT for *due-ness*: derived via `isPaymentEffectivelyDue` (which combines stored status + anchor rules + main-path stage completion).
- **Risk:** No Prisma relation back to `PaymentScheduleItem`. Anchor is loaded via separate `loadScheduleAnchorsByIds` lookup. Acceptable but easy to misuse if a future caller forgets to enrich.

### 1.15 `JobActivity`
- **Represents:** Audit/history log on a job.
- **Stored:** `type` (enum), `title`, `details`, `entityType`/`entityId`, `metadataJson`.
- **Created by:** `recordJobActivity` (helper). Called from activation, task completion, issue lifecycle, recovery lifecycle, payment lifecycle, visit lifecycle.
- **Read by:** job detail, workstation sidebar.
- **Risk:** The `JobActivityType` enum lists `EVENT_CREATED` and `EVENT_RESOLVED` — these correspond to a `job-event-actions.ts` flow but no schema model for `JobEvent` exists. So these enum entries refer to an external/legacy concept that doesn't have a stored counterpart (or refers to issues — naming overlap with `createJobIssueAction` which uses `ISSUE_CREATED`/`ISSUE_RESOLVED`). Worth confirming.

### 1.16 `JobVisit`
- **Represents:** Scheduled site visit. Independent from execution readiness today.
- **Read by:** workstation (`schedule` kind items), job detail visit manager.
- **Note:** Does not affect task readiness directly. Workstation surfaces missed/upcoming/unscheduled, but execution health does not.

### 1.17 `DailyJobLog`
- **Represents:** Per-day record of work done.
- **Stored:** `status` (DRAFT/REVIEWED/VOID), `summary`, `internalNotes`.
- **Read by:** workstation (DRAFT logs needing review), job detail log manager.
- **Note:** Does not feed back into task readiness. `generateDailyJobLogDraft` in `daily-job-log-helper.ts` synthesizes drafts from activity but I did not trace this as part of execution gating.

### 1.18 `Attachment` (with `jobTaskId`)
- **Represents:** Uploaded file. Can be tied to job task, job, quote, lead, customer.
- **Used by execution:** `attachments[].status === "READY"` count drives `photoRequired`/`attachmentRequired` proof in `deriveTaskState` and `validateTaskCompletionReadiness`.
- **Risk:** No content-type / classification on attachments. A non-photo file can satisfy `photoRequired` because the readiness check counts attachments generically.

### 1.19 `JobTask.completionRequirementsJson` (checklist sub-structure)
- **Represents:** Per-task proof requirements + structured checklist items.
- **Stored shape:** `{ noteRequired, photoRequired, attachmentRequired, checklist: [{ id, label, completedAt, completedByUserId }] }`.
- **Created from:** AI plan (`generateQuoteLineExecutionPlanAction` builds checklists with new UUIDs), template apply (copies whatever was on template), manual editor, recovery builder.
- **Updated by:** `toggleJobTaskChecklistItemAction` (writes back into the JSON).
- **Risk:** Schema does not enforce the shape. `toggleJobTaskChecklistItemAction` casts `task.completionRequirementsJson` to `TaskCompletionRequirements` and mutates the JSON in place. Two open issues:
  - The action does **not** check whether the task is currently in a blocked-by-issue state before allowing checklist toggles. (See §5.)
  - There is no schema migration story if `TaskCompletionRequirements` ever changes shape — existing rows would silently mismatch.

---

## 2. Current Execution Flow

Code paths traced end-to-end.

### A. Quote / line item creation
- `quote-form-actions.ts` (not read deeply, but referenced) creates `Quote` and `QuoteLineItem` rows in DRAFT.
- `performApplyLineItemTemplateToQuoteTx` (`quote-line-item-template-apply-tx.ts`) is the canonical "apply preset" path. It:
  1. Loads the template scoped by org + non-archived.
  2. Creates a `QuoteLineItem` from template defaults.
  3. Copies each `LineItemTemplateTask` (sorted by `stage.sortOrder` then `sortOrder`) into a `QuoteLineExecutionTask` row.
  4. Recalculates rollups (`recalculateQuoteRollupsInTx`).
- **Assumption:** Quote is in DRAFT (enforced via `findFirst` filter).
- **Failure cases:** Returns `{ ok:false }` with optional message. UI must propagate.

### B. Execution task/stage creation (manual + AI)
Stages are **not created per-quote**. Quotes reference org `Stage`s by id on each execution task (`stageId?: string`). Stages are an org-level reusable list.

Manual:
- `addQuoteLineExecutionTaskFromReusableAction`: copies a `TaskTemplate` into a new `QuoteLineExecutionTask` (snapshot). Org-scoped, requires editable quote.
- `addQuoteLineExecutionTaskCustomAction`: validates body via `parseTaskBodyFromForm`, validates stage via `validateExecutionTaskStage` (rejects Corrections stage, blocks empty stage in the editor path).
- `updateQuoteLineExecutionTaskAction` / `moveQuoteLineExecutionTaskAction` / `deleteQuoteLineExecutionTaskAction` — all gated by `QUOTE_STATUSES_EXECUTION_EDITABLE` and `job: { is: null }`.

AI:
- `generateQuoteLineExecutionPlanAction` (in `quote-line-execution-actions.ts`):
  1. Loads line and org stages.
  2. Calls `AIService.generateExecutionPlan` → `AIService.generateLibraryExecutionPlan` (Gemini, with retry/backoff, simulated fallback gated by env flag).
  3. If `generation.canApply` false → return error (blocks simulated plans unless dev flag set).
  4. `validateQuoteAiExecutionPlanForPersist` (every task must have a mapped `stageId`; Corrections-stage tasks rejected with required warning).
  5. **Directly creates** `QuoteLineExecutionTask` rows in a transaction. There is **no separate review-then-apply step** for quote-line AI — the proposal flows straight into draft rows.
  6. Returns `{ warnings? }`.

UI components/inputs involved
- Quote detail page (`/quotes/[quoteId]/page.tsx` — not fully read but referenced by routes).
- Execution review page (`/quotes/[quoteId]/execution-review/page.tsx`).
- `quote-line-draft-execution-panel.tsx` (referenced) for task editor.

### C. Execution review
- Route: `/quotes/[quoteId]/execution-review/page.tsx`.
- Loads quote, line items, draft execution tasks (with stages, sort orders), all org stages.
- `quoteAllowsQuoteLineExecutionPlanning(status, hasJob)` gates editability.
- Calls `evaluateQuoteJobActivationReadiness` to compute `QuoteActivationStatus`:
  - `activated` (job exists)
  - `ready_to_activate` (readiness.ready)
  - `blocked` (carries block reasons + whether quote is approved)
- Renders `QuoteExecutionReviewPreviewView` with `model` from `buildQuoteExecutionReviewPreviewModel`.
- Reusable task picker options loaded from `TaskTemplate` for inline picker.
- **No mutations** happen on review page itself; mutations route back to `quote-line-execution-actions.ts`.

### D. Quote approval / job activation
- Quote is moved to `APPROVED` by `quote-form-actions.ts` (not read in detail), which also creates `QuoteCheckpoint` rows of kind `APPROVAL`.
- `activateQuoteJobAction` (`quote-job-activation-actions.ts`):
  1. Loads quote in tx with line items, execution tasks, payment schedule.
  2. Rejects if not APPROVED, no approval checkpoint, or already activated.
  3. Re-runs `evaluateQuoteJobActivationReadiness` (server-side) — single SoT.
  4. Validates customer/lead belong to org (defensive `safeCustomerId`/`safeLeadId`).
  5. Creates `Job` row.
  6. Materializes `JobStage` rows from the distinct `stageId`s referenced by execution tasks. Each `JobStage.sortOrder` is **assigned by iteration order over `Stage` rows ordered by `Stage.sortOrder`** — so org stage order is preserved.
  7. Creates one `JobTask` per `QuoteLineExecutionTask` (copies signals, requirements, category, instructions, task-template lineage, line item lineage). Throws `NOT_READY` if a task has no stage mapping (shouldn't happen because readiness gated it, but defensive).
  8. Computes "orphan signals" — required signals not provided by any task. If not `hardSignal`, **auto-publishes** that signal to satisfy it (this is intentional; canon calls it "soft signal auto-satisfaction").
  9. Materializes `JobPaymentRequirement` per `PaymentScheduleItem`:
     - For `FINAL_BALANCE`, computes a remainder = `quote.totalCents − sum(non-final scheduled amounts)`.
     - Other anchor types use raw `amountCents` (no percentage normalization).
     - `requiredBeforeStageId` mapped only for `BEFORE_STAGE` anchor type; AFTER_STAGE anchors store `anchorStageId` on the source schedule item and are resolved via `loadScheduleAnchorsByIds` at read time.
     - Status starts `PENDING`.
  10. Records `JOB_ACTIVATED` activity with `activatedTaskCount`, source quote id, approval checkpoint id.
  11. Catches `ActivationError` (typed) and `P2002` (concurrent activation). All other errors rethrow → 500.
- **Assumptions:**
  - Approval checkpoint exists for any APPROVED quote (enforced).
  - Quote totals were rolled up correctly before activation (no recompute at activation time).
- **Failure cases:**
  - `QUOTE_NOT_FOUND`, `ALREADY_ACTIVATED`, `NOT_APPROVED`, `NOT_READY`, and concurrent `P2002` (returns "A job for this quote was created at the same moment.").
- **Crucially missing:** Activation does **not** populate `JobStage.providesSignals` / `requiresSignals` despite the schema fields existing and downstream code (`getLiveSignals`, `deriveTaskState`, `completeJobTaskAction`) reading and acting on them. See §4 (HIGH risk).
- **Crucially missing:** Activation does **not** create a `Corrections` `JobStage` upfront. It is created lazily by issue follow-up or recovery actions, with `sortOrder = (max + 10)` — so it ends up at the end of the stages list each time. If created multiple times in race, there is no unique guard (the action does a `findFirst`+`create` pattern without `upsert`).
- **Crucially missing:** Percentage-only `PaymentScheduleItem` rows become $0 requirements; there is no percent → cents materialization at activation.

### E. Conversion into job tasks / runtime objects
Already covered in D step 7-9. Worth noting:
- `JobTask.sortOrder` is copied **straight from** `QuoteLineExecutionTask.sortOrder` (which is per-line). After activation, ordering across the whole stage may collide because two source lines mapping to the same stage will produce competing `sortOrder` values starting at 0. Workstation sorts by `(jobStage.sortOrder, task.sortOrder)`. There is no global renumber pass at activation.

### F. Job task readiness/completion
- `deriveTaskState` (canonical, `task-readiness.ts`).
- `completeJobTaskAction` (canonical write path):
  1. Loads task with stage issues, attachments, task issues, recovery flow link.
  2. Gets live signals.
  3. Derives state. Rejects with explicit error for BLOCKED_BY_ISSUE / BLOCKED_BY_SIGNAL.
  4. Validates proof via `validateTaskCompletionReadiness` (NEEDS_PROOF cases).
  5. In a transaction: marks DONE, sets `completedAt`/`completedByUserId`, publishes task `providesSignals`, checks if stage is now all-done and publishes `jobStage.providesSignals` (but this is always `[]`, see §4), records `TASK_COMPLETED` activity, calls `promotePendingPaymentsToDue`.
- `overrideJobTaskReadinessAction` (manager override):
  - Gated by `assertCanOverrideTaskReadiness`: rejects if any open BLOCKS_WORK issue on task **or** stage. So override can bypass missing signals but **not** issues.
  - On success: same signal publication + activity log (with `metadataJson.override=true`, `forced=true`). **Skips proof validation** entirely — even if `photoRequired`, override marks DONE.
  - **Skips** `promotePendingPaymentsToDue` (an inconsistency vs. normal completion).
- `toggleJobTaskChecklistItemAction`:
  - Loads task by `(id, job.organizationId)`.
  - Mutates `completionRequirementsJson` directly to flip the checklist item.
  - **No readiness gate** — a checklist item can be toggled on a task that is BLOCKED_BY_ISSUE.
- `updateJobTaskStatusAction` (internal helper, prefer `completeJobTaskAction`):
  - Rejects `status: DONE`.
  - For TODO, clears `completedAt`/`completedByUserId`/`completionNote` but **does not retract signals** (comment: "Signal retraction on revert is not implemented in v1.").

### G. Issue creation
- `createJobIssueAction`:
  1. Verifies job belongs to org.
  2. Verifies optional `jobStageId`/`jobTaskId` belong to the job.
  3. Creates issue with default `severity = BLOCKS_WORK`, `status = OPEN`.
  4. Records `ISSUE_CREATED` activity.
- **No automatic recovery flow.** UI must explicitly invoke recovery builder.

### H. Recovery task/flow creation
- `createRecoveryFlowAction`: creates `JobRecoveryFlow` (DRAFT) for an issue. Idempotent on `jobIssueId` (`@@unique`).
- `addRecoveryTaskAction`:
  - Resolves or creates the `Corrections` `Stage` (org-scoped, name-based).
  - Resolves or creates the `Corrections` `JobStage` (`sortOrder = maxJobStageSort + 10`).
  - Creates a `JobTask` with `recoveryFlowId = flow.id`, `recoveryFlowOrder = input.sortOrder ?? 0`, `sortOrder = input.sortOrder ?? 0`, `sourceType = CUSTOM`, `category = input.category`, etc.
- `activateRecoveryFlowAction`: DRAFT → ACTIVE; records `RECOVERY_FLOW_ACTIVATED` activity.
- **Issue follow-up tasks (alternate parallel path):** `createFollowUpTaskFromIssueAction` (in `job-issue-actions.ts`) creates a single `JobTask` linked to the issue via `sourceJobIssueId`, with no `recoveryFlowId`. It does the same "resolve Corrections stage" dance.
  - Behavior diverges: a follow-up task is **not** in a `JobRecoveryFlow`. It does **not** bypass the task-readiness blocker (since `deriveTaskState` only bypasses blockers via `recoveryFlowIssueId`).
  - This is dual-system drift. See §5.

### I. Recovery flow execution / resume
- Recovery tasks render in `RecoveryFlowBuilder` and (after activation) appear as normal `JobTask` rows in the `Corrections` `JobStage`.
- Completing each recovery task uses the same `completeJobTaskAction`. Readiness for a recovery task bypasses the parent issue blocker because the task carries `recoveryFlow.jobIssueId` and `deriveTaskState` passes `recoveryFlowIssueId`.
- Once all recovery tasks are DONE, `resolveIssueAndResumeAction` (mode=`resume`) closes the issue and sets recovery flow → COMPLETED. This is the canonical "resume original path" path.
- Force resolve (mode=`force`) cancels the recovery flow without finishing tasks.

### J. Resume original path
- After issue is RESOLVED, the original task no longer has an OPEN BLOCKS_WORK issue, so `deriveTaskState` returns READY (assuming signals satisfied). No explicit "resume" action mutates the original task — it's purely derived.
- `JobActivity` records `RECOVERY_FLOW_COMPLETED` with `originalPathResumed: true` metadata.

### K. Workstation surfacing
- `queryWorkstationWorkItems` is the single emission point. It produces work items for:
  1. Leads (pipeline + visit requests, only when no active quote)
  2. Quotes (DRAFT/SENT/APPROVED, hides JOB_ACTIVE/ARCHIVED via readiness state)
  3. Jobs (active) — emits multiple sub-items per job:
     - Execution health investigate item if state ∈ {NO_NEXT_ACTION, STALE_RECOVERY_FLOW, BROKEN_REFERENCE} or `!invariantSatisfied`.
     - Missed visit item per missed visit.
     - Upcoming visit item per upcoming visit.
     - Unscheduled job item (if active, has open tasks, has no future visit, not blocked).
     - Per-task work items for every open task on every active job. **First task in sorted order gets priority bump; others are demoted to `low`.**
     - "Job has no tasks" investigate item if there are zero open tasks.
  4. Job Issues (OPEN + BLOCKS_WORK, top 50 by createdAt).
  5. Job Payment Requirements (effectively due, single emission path with `emittedPaymentIds` set).
  6. Draft Daily Job Logs needing review.
- Ranking: `rank(item, role, now)` in `workstation/rank.ts` maps to lanes (`critical`/`due`/`upcoming`/`watch`).
- Page `/workstation/page.tsx` filters by `lens` + `filterCategory`, groups by lane, and renders focus + queue cards.

---

## 3. Source-of-Truth Analysis

| Concept | Stored | Derived | Canonical | Notes |
|---|---|---|---|---|
| Job scope | `QuoteLineItem` rows on the quote (commercial), and after activation, `JobTask` + `JobStage` rows on the job | "How many lines" (count), "totalCents" (rollup) — both are stored values | `Quote.lineItems` pre-activation; `Job.stages.tasks` post-activation | Copy-on-activate; quote edits post-activation do NOT mutate runtime |
| Work that must be done | `QuoteLineExecutionTask` (pre-activate) → `JobTask` (post-activate) | — | Same | One execution-task row per future job task; lineage retained via `sourceQuoteLineExecutionTaskId` |
| Stage/task order | Stage: `Stage.sortOrder` (org) → propagated as `JobStage.sortOrder` at activation; Task: `QuoteLineExecutionTask.sortOrder` → `JobTask.sortOrder` (copied) | Workstation final ordering = `(jobStage.sortOrder, task.sortOrder)` | Activation logic in `quote-job-activation-actions.ts` | **Risk:** Cross-line collisions on same stage produce duplicate `task.sortOrder` values (HIGH) |
| Task readiness | — | `deriveTaskState` | `task-readiness.ts` | Reused by 7 files, including server actions and workstation. |
| Task status | `JobTask.status` (TODO/DONE), `completedAt`, `completedByUserId`, `completionNote`, `completionRequirementsJson.checklist[].completedAt` | "Completed" badge | `completeJobTaskAction` writes; UI displays from row | Only two enum states |
| Blocking state | `JobIssue.status` + `severity`; `JobPaymentRequirement.status` + anchors; `JobSignal` presence/absence/muting | "Is task blocked", "is job blocked" | `deriveTaskState`, `deriveJobExecutionHealth`, `getUnsettledEffectivelyDueRequirements` | Three independent stored systems (issues / payments / signals); derivation is centralized but the *input* fields are spread |
| Issue state | `JobIssue.status`/`severity` | open count, resolved count | `JobIssue` row | Resolution writes via canonical helper |
| Recovery flow state | `JobRecoveryFlow.status` | Recovery progress = derived from recovery `JobTask.status` | `resolve-job-issue-core.ts` (writes); `job-execution-health.ts` (reads) | Status transitions ONLY via this helper for COMPLETED/CANCELLED |
| Payment blocking | `JobPaymentRequirement.status` (audit) + `PaymentScheduleItem` anchor | "Effectively due" + "task hold" | `job-payment-readiness.ts` | Conservative `FINAL_BALANCE` rule documented in code |
| Workstation urgency | — | All derived | `workstation-query.ts` + `rank.ts` | No persisted ranks |
| Task proof / completion evidence | `JobTask.completionRequirementsJson`, `JobTask.attachments` (count of READY attachments), `JobTask.completionNote` | "NEEDS_PROOF" | `validateTaskCompletionReadiness` / `deriveTaskState` (same proof rules) | Override skips this validation |
| AI proposal vs accepted work | **Mixed** — library AI: ephemeral `AILibraryProposal` (review-then-apply); quote-line AI: directly persisted `QuoteLineExecutionTask` rows (no separate review state) | — | `applyLineItemTemplateAIProposalAction` (review-apply); `generateQuoteLineExecutionPlanAction` (generate-and-persist) | **Inconsistent.** See §8 |
| Live signals | `JobSignal` rows | "Live" excludes signals whose source has open BLOCKS_WORK issue | `signal-bus.ts` (`getLiveSignals`) | No retraction path; signals are persistently published |

**Source-of-truth red flags (currently unclear / duplicated / split):**

1. **Stage signals.** `JobStage.providesSignals/requiresSignals` exist in schema, are read by readiness/health/promotion logic, but are *never written* — neither by activation, nor by recovery, nor by any settings UI. The org-level `Stage` model does not even have signal fields. → Stored field with no input path; consumed as if it were source of truth.
2. **Issue mitigation.** A blocking issue can be addressed by (a) `createFollowUpTaskFromIssueAction` (single linked task, **does not unblock**) or (b) `createRecoveryFlowAction` + `addRecoveryTaskAction` (multi-task structured plan that **does unblock** via `recoveryFlowIssueId`). Both write to JobTask with different conventions. No single SoT for "how to recover from an issue".
3. **Sorting between recovery and main path.** `JobTask.sortOrder` and `JobTask.recoveryFlowOrder` are independent integers. Different consumers use different keys (workstation = sortOrder, execution-health = recoveryFlowOrder for recovery tasks). Risk of inconsistent display order across surfaces.
4. **`JobIssueSeverity.DOES_NOT_BLOCK`** is essentially unused — does not surface in workstation, does not appear in execution health, but is a writable enum value.
5. **`PaymentScheduleItem.percentage`** — stored but never converted to amount at activation. SoT is effectively `amountCents`; percentage is documentation-only.

---

## 4. Duplicate Logic / Drift Search

I searched for duplicated implementations of each concept. The codebase is unusually disciplined here — canonical helpers are reused — but the following drift items exist.

| # | Concern | Files / Sites | Each copy does | Agree? | Risk | Recommended consolidation |
|---|---|---|---|---|---|---|
| D1 | **Task readiness derivation** | `task-readiness.ts` (canonical) used by: `job-task-actions.ts`, `task-work-surface.tsx`, `job-task-card.tsx`, `workstation-query.ts`, `workstation/page.tsx`, `job-execution-health.ts` | All call `deriveTaskState(toTaskReadinessInput(task, ctx), liveSignals, options)` | **Yes** | Low | None needed — clean. |
| D2 | **Stage signal write path** | Activation (`quote-job-activation-actions.ts`) writes `JobTask.providesSignals/requiresSignals` only. `JobStage.providesSignals/requiresSignals` are read in `deriveTaskState`, `deriveStageState`, `completeJobTaskAction` ("publish stage signals when all tasks done"), but **never written anywhere**. | One side reads; no side writes | **No** — empty arrays read as authoritative `[]` | **High** | Either remove `JobStage` signal fields and the stage-promotion logic in `completeJobTaskAction`, or wire activation to copy a stage-level signal set from quote-line execution. Until then, the stage-signal pathway is silently dead. |
| D3 | **Recovery vs follow-up-task** | `recovery-actions.ts` + `JobRecoveryFlow` + `JobTask.recoveryFlowId` (multi-task, unblocks); `job-issue-actions.ts:createFollowUpTaskFromIssueAction` + `JobTask.sourceJobIssueId` (single task, does NOT unblock) | Both create Corrections JobStage; both add JobTask; one bypasses issue blocker, the other doesn't | **Partial** — UI does not clearly distinguish | **High** | Decide: either (a) deprecate `createFollowUpTaskFromIssueAction` and require all issue mitigation to go through recovery flows, or (b) document that follow-up tasks are deliberately *non-bypass* and surface them differently. |
| D4 | **Corrections stage resolution** | `recovery-actions.ts:addRecoveryTaskAction`; `job-issue-actions.ts:createFollowUpTaskFromIssueAction`; `job-payment-readiness.ts:CORRECTIONS_STAGE_NAME` constant | Each "find or create" the `Stage` named "Corrections" with the same `sortOrder = max + 10` formula, no `upsert` | Equivalent but duplicated string literal + duplicated `findFirst`+`create` race | Medium | Extract `ensureCorrectionsJobStage(jobId, organizationId, tx)` helper; use the constant from `job-payment-readiness.ts` everywhere. Drift detector exists (warn-only). |
| D5 | **Signal publication on stage complete** | `completeJobTaskAction` and `overrideJobTaskReadinessAction` both contain the same "if all other tasks in stage done, publish stage signals" block | Same logic copied twice | Yes, identical | Low | Extract to helper (e.g. `publishStageCompletionSignals`). |
| D6 | **Payment hold rule** | `deriveTaskPaymentHold` in `job-payment-readiness.ts` (canonical); single consumer in `job-task-execution-loader.ts` and `[jobId]/page.tsx`. Workstation derives its own version via `getUnsettledEffectivelyDueRequirements` + `isJobBlocked` | Per-task hold uses canonical helper; workstation uses job-level "is blocked" but does not surface per-task hold reason | Acceptable but inconsistent UX — task on workstation says "Resolve blocker" without specifying it's a payment | Medium | Pass `deriveTaskPaymentHold` into the workstation task-item to expose the same reason copy. |
| D7 | **AI execution generation pipelines** | `library-ai-execution-plan.ts` (`validateLibraryDefaultExecutionProposalForApply`) and `quote-ai-execution-plan.ts` (`validateQuoteAiExecutionPlanForPersist`) | Both validate AI proposals against allowed stages, both block Corrections-mapped tasks. Library validator additionally enforces "no simulated apply unless flag" and "every task has stageId". Quote validator only enforces stage mapping + Corrections filter | Mostly aligned, but the **simulated-plan gate is missing** in the quote-line path because the quote-line path checks `generation.canApply` upstream instead | **Partial** — different surface, same intent | Medium | Centralize a single `validateAiExecutionPlanForPersist({ proposal, generation, allowedStages, scope })` helper. |
| D8 | **"Is job blocked" logic** | Workstation: `isJobBlocked = job.issues.length > 0 || effectivelyDuePayments.length > 0`. Execution health: similar but more nuanced (`BLOCKED_BY_PAYMENT` only when no actionable main task, `BLOCKED_BY_ISSUE` only when *all* main tasks are blocked by issue) | Workstation flags blocking optimistically; health is conservative | **No** — same underlying facts, different definitions | Medium | Replace workstation's `isJobBlocked` with `executionHealth.primaryState.startsWith("BLOCKED_")` or similar. |
| D9 | **Lead title / contact projection** | Centralized via Prisma client extension in `db.ts` (`deriveLeadTitle`, `readContact`, etc.). All consumers use `lead.title`, `lead.contactName`, etc. | Yes, single SoT | Low | Already clean. (Worth noting because the schema only stores `Lead.contact` as JSON — the readable fields are virtual via Prisma extensions.) |
| D10 | **Workstation sub-item types per job** | `workstation-query.ts` emits `task`, `investigate`, `schedule`, `daily-log`, `job` kinds for the same job in the same query | Each kind is distinct but ranking treats them all as a flat list with role-weighted priorities | Acceptable | Low | None right now, but watch for visual saturation if a single critical job emits 5+ items. |

---

## 5. Issue + Recovery Flow Audit

Specifically inspecting `JobIssue` ↔ `JobTask` ↔ `JobRecoveryFlow` interactions.

### Findings

- **Can one issue create multiple recovery tasks?** ✅ Yes — `addRecoveryTaskAction` is called once per task by `RecoveryFlowBuilder.handleSubmit` in a loop. They all share `recoveryFlowId`. There is also `createFollowUpTaskFromIssueAction` which creates exactly one follow-up task per issue (`if (issue.followUpTasks.length > 0) throw`). **But:** the follow-up path is mutually exclusive at most-one, and a recovery flow + a follow-up task can both exist on the same issue (no cross-check).
- **Can recovery tasks bypass the parent issue blocker correctly?** ✅ Yes — `deriveTaskState` reads `options.recoveryFlowIssueId` and skips any blocking issue that matches. The job page loads each task with `recoveryFlow: { select: { jobIssueId: true } }`, so the bypass is wired through job detail, work surface, workstation, and the override guard alike.
- **What prevents the original execution path from continuing too early?**
  - Main-path tasks have the parent issue in their `task.issues` array (if the issue is linked to the task) or in `stageIssues` (if linked to stage) or in the job-level issues (if linked to neither). The `deriveTaskState` bypass only matches when the task itself is a recovery task for that issue.
  - So main-path tasks remain BLOCKED_BY_ISSUE until the issue is resolved or force-resolved.
- **What resumes the original path?** `resolveIssueAndResumeAction` (mode=`resume`) — requires all recovery tasks DONE; on success sets issue → RESOLVED and recovery flow → COMPLETED in one transaction.
- **Is issue resolution manual, derived, or hybrid?** **Hybrid.** Resolution is a *manual write* (user clicks "Resume Now" or "Resolve"), but the helper `assertCanResolveIssue` derives whether resume is even permissible (all recovery tasks DONE). Force mode bypasses derivation. Standard mode rejects if recovery is open + incomplete.
- **Can issues and recovery tasks create loops or orphan states?**
  - **STALE_RECOVERY_FLOW** is a real warning code already implemented in `job-execution-health.ts`. Two cases:
    - Issue RESOLVED but recovery flow still DRAFT/ACTIVE.
    - Issue OPEN but recovery flow COMPLETED.
    These can occur if anyone resolves an issue outside `resolve-job-issue-core.ts` (e.g., direct DB edit, or a future code path that bypasses the helper). The detector exists, but the *fix path* is "warn the user" — there is no auto-reconcile.
  - **BROKEN_RECOVERY_REFERENCE** — recovery task references a `recoveryFlowId` that is no longer linked to any tracked issue. Detected and surfaced. Schema `onDelete` for the relation: `JobRecoveryFlow → JobIssue` is `Cascade`, so when issue deletes, flow deletes, but `JobTask.recoveryFlowId` has no FK action shown (default = `SetNull`?). Actually it's a regular FK with no explicit `onDelete`; Prisma defaults to `SetNull` for nullable. So orphaned recovery tasks become normal tasks in the Corrections stage with `recoveryFlowId = null` — surprising behavior. The execution-health code catches the broken-link case but the underlying data drift is real.
- **Does workstation understand issue recovery properly?**
  - `workstation-query.ts` emits one item per OPEN BLOCKS_WORK issue.
  - Next-step copy depends on `recoveryFlow.status`:
    - DRAFT → "Draft recovery plan needs review/activation."
    - ACTIVE with incomplete tasks → "Recovery Step X/Y: {next task title}".
    - ACTIVE with all tasks done → "Recovery complete. Resume original path." (priority bumped to critical).
  - **Issue:** Issues are emitted *in addition to* the underlying blocked main-path task. This is intentional — both surface separately — but it can dilute the queue when one root cause produces 1 issue item + N blocked task items. Existing code uses a "first task is primary, rest are demoted to `low`" rule to mitigate.
- **Does the job detail page show the recovery state clearly?** ✅ Yes. `JobIssueManager.tsx` per-issue card:
  - Renders recovery task list with check states.
  - Shows "Resume Now" button when recovery complete.
  - Shows "Force resolve" UI with explicit confirmation when recovery incomplete.
  - "Create Recovery Path" button when no recovery flow exists.
  - **Limitation:** A `followUpTasks`-style mitigation (the alternate, non-bypass path) is rendered nowhere on this card (the schema declares `followUpTasks` on issue, but `JobIssueManager` only renders `recoveryFlow.tasks`).
- **Are recovery tasks normal job tasks, special tasks, or a parallel system?**
  - **Mostly normal job tasks.** They live in `JobTask` with the same schema, the same completion path, the same proof rules, the same activity log.
  - **Differences:**
    - `recoveryFlowId` is set (others NULL).
    - `recoveryFlowOrder` is set.
    - They are pinned to the `Corrections` `JobStage` (special name).
    - Their `sourceType` is hard-coded `CUSTOM` (no lineage to a template, even when the AI recovery proposal references templates).
    - Their `stageId` is the org-`Stage` id of `Corrections` (not the `lineItemId` lineage).
  - Conceptually they are normal tasks with special metadata, not a parallel system. Good.

### Architecture-danger flags from §5

- **A1 (HIGH):** Dual mitigation systems (`followUpTasks` vs `recoveryFlow`) — see D3.
- **A2 (MEDIUM):** `JobIssue.severity = DOES_NOT_BLOCK` is unused; risks bit-rot or future divergence.
- **A3 (MEDIUM):** `JobTask.recoveryFlowId` lacks an explicit `onDelete: SetNull` declaration in schema; on issue deletion the cascade chain to flow may orphan tasks unpredictably. (Verify Prisma behavior; default is `SetNull` for optional FK, but worth being explicit.)
- **A4 (MEDIUM):** No constraint preventing a recovery task from being created against a `Corrections` stage of a *different* job (the action does correctly scope by `flow.jobId` — verified — but no DB constraint guarantees it).
- **A5 (LOW):** `JobRecoveryFlow.source*` context fields (checklist/permit/inspection) are accepted in the input but only `sourceFailedTaskId` is meaningfully used. Other event types don't exist as models, so these are aspirational columns.

---

## 6. Line Item / Stage / Task Audit

### Findings

- **Are line items still the front door for execution?** ✅ Yes. Every `QuoteLineExecutionTask` belongs to a `QuoteLineItem`; activation walks `quote.lineItems[].draftExecutionTasks`. There is no "task without a line" pre-activation.
- **Are stages lightweight containers or workflow engines?** **Containers, by design** — `Stage` is just `{ name, sortOrder, archivedAt }` at the org level. `JobStage` adds `providesSignals/requiresSignals` (currently dead, see §4 D2). No stage-level state machine, no per-stage workflow rules.
- **Can one line item create multiple stages/tasks?** ✅ Yes — a single line item's draft execution tasks can reference any subset of org stages. Activation creates one `JobStage` per distinct referenced `stageId`. If line A and line B both reference Site Prep, only one `JobStage` for Site Prep is created — they share it.
- **Can multiple line items share/merge stages?** ✅ Yes — see above. Lineage to source line is via `JobStage.sourceQuoteLineItemId` which is `SetNull`-on-delete and only captures ONE source line. When two lines share a stage, only the first line's id is captured (or whichever happens to be assigned by the activation loop). **Lineage is lossy for shared stages.**
- **Is ordering stable after activation?** **Stage ordering** = stable (uses `Stage.sortOrder`). **Task ordering within a stage** = **NOT guaranteed unique.** `JobTask.sortOrder` is copied straight from `QuoteLineExecutionTask.sortOrder`, which is computed *per-line-item* via `nextSortOrderInStage(tx, quoteLineItemId, stageId)`. Two tasks from different lines mapping to the same stage will have the same `sortOrder = 0` (first task each).
  - **Risk:** Workstation, job detail, and execution health all sort by `(jobStage.sortOrder, task.sortOrder)`. Ties break deterministically by DB order in Postgres unless an additional tiebreaker exists. **Different surfaces may produce different orderings for tied tasks.**
- **Does the system preserve why a task exists?**
  - From quote: `JobTask.sourceQuoteLineExecutionTaskId` + `sourceQuoteLineItemId` + `sourceTaskTemplateId`. All nullable, all `SetNull` on delete. Lineage is preserved but degrades if upstream rows are deleted.
  - From issue: `JobTask.sourceJobIssueId` for follow-up tasks.
  - From recovery: `JobTask.recoveryFlowId` + flow's `jobIssueId`.
  - **Risk:** A task that was created custom (not from a template) loses the "why" if the source line item is deleted post-activation (which shouldn't happen normally because of `SetNull`).
- **Does the system preserve source line item?** ✅ Yes, via `JobTask.sourceQuoteLineItemId`. Degrades on delete (`SetNull`).
- **Are one-off / custom tasks supported cleanly?** ✅ Yes — `LineItemTemplateTaskSource.CUSTOM` is a first-class enum value used everywhere. AI-generated tasks default to CUSTOM unless they came from a reusable template.
- **Can tasks exist outside execution stages?** **No, structurally.** `JobTask.jobStageId` is **required** (not nullable). `JobTask.stageId` (org) IS nullable but `jobStageId` is not. Therefore every runtime task has a containing stage, even recovery tasks (which go in `Corrections`).
- **Are project-level / admin tasks separate enough from execution tasks?** **No specific separation exists** — there is no "project task" or "admin task" model. Office/admin work that doesn't map to a stage cannot be represented. (The `TaskTemplateCategory` enum has `CUSTOMER_COMMUNICATION`, `SCHEDULING`, `PAYMENT`, etc., but these are visual categories — they still need a stage to be created.)
- **Are stage presets hardcoded, configurable, or mixed?** **Mixed leaning configurable.**
  - All stages other than `Corrections` are user-configurable in Scope Library (`stage-actions.ts`).
  - `Corrections` is a magic name: created lazily if missing, filtered out of AI execution planning (`getStagesForAiExecutionPlanning`), excluded from main-path computation (`buildPaymentDueContextFromJob.isRecoveryStage`), and detected by literal name compare (with a `normalizeStageLabel` variant in some places).
  - The `stageIntent` enum in AI prompts (`PRE_CONSTRUCTION | PERMITTING | MOBILIZATION | SITE_PREP | ROUGH_IN | INSPECTION | INSTALL | FINISHES | CLOSEOUT`) is **a hardcoded suggestion vocabulary**, not a schema enum — used only as a hint for stage mapping. It does not constrain user-named stages.

### Leaks of old workflow / "node" assumptions

- The `JobActivityType` enum contains `EVENT_CREATED` and `EVENT_RESOLVED`. There is a `job-event-actions.ts` file but no `JobEvent` model — these look like old "node/event" model leftovers that were re-pointed to JobIssue. Confirm.
- `JobRecoveryFlow.sourcePermitEventId` and `.sourceInspectionEventId` are accepted in input but only `sourceFailedTaskId` is used. These look like leftovers from a richer event-based design.
- `recovery-actions.ts:suggestRecoveryPathAction` instantiates `new AIService()` whereas every other AI call uses `AIService.generateLibraryExecutionPlan` (static). Inconsistent calling convention — minor.

---

## 7. Workstation Execution Signal Audit

### How it actually decides what to show

`queryWorkstationWorkItems(organizationId, role, urgentThresholdHours)`:
- **Leads (`lens=attention`)**: any lead in NEW or TRIAGING with no active quote (any non-archived quote). Adds a pending visit-request boost to `critical`.
- **Quotes (`lens=attention`)**: status ∈ {DRAFT, SENT, APPROVED} and `getQuoteReadiness().state` not in {JOB_ACTIVE, ARCHIVED}. Customer-accepted (CUSTOMER_PORTAL approval checkpoint) bumps reason copy.
- **Jobs/Tasks (`lens=attention | today | upcoming | waiting`)**: per ACTIVE job, emits:
  - Execution-health item when state is one of NO_NEXT_ACTION / STALE_RECOVERY_FLOW / BROKEN_REFERENCE or `!invariantSatisfied`.
  - Missed visit + upcoming visit + unscheduled-job items.
  - One task work-item per open task (`completedAt: null`), with priorities:
    - First task in `(jobStage.sortOrder, task.sortOrder)` order = "primary", normal priority by derived state (`READY` → high, blocked → medium).
    - All other open tasks demoted to `low`.
  - Empty-tasks investigate item if zero open tasks.
- **Issues (`lens=attention`)**: top 50 OPEN + BLOCKS_WORK by createdAt desc.
- **Payments**: top 100 PENDING/DUE with `job.status = ACTIVE`. Each candidate is re-checked via `getUnsettledEffectivelyDueRequirements` and emitted only if effectively due. `emittedPaymentIds` set prevents duplicate emission.
- **Daily logs**: top 50 DRAFT.

### Answering the specific questions

- **What signals are shown?** Lead-progress, quote-readiness, task readiness, payment due, issue blocks, recovery progress, visit scheduling, daily log review.
- **How are they ranked?** `rank()` maps `(kind, priority, group, updatedAt, isBlocked, signalId)` to a lane + within-lane numeric score. Critical lane wins on `priority=critical | isBlocked | group=investigate`. Roles weight priorities via `getSpecForRole(role).priorityWeights`. Within lane, newer `updatedAt` is higher (divided by weight).
- **Does it use true execution order?** **Partly.** Per-job tasks are sorted by `(jobStage.sortOrder, task.sortOrder)`, but the per-line-item `sortOrder` collision risk (§6) means tied tasks may surface in arbitrary order. Cross-job ordering is by recency, not execution criticality.
- **Does it use readiness/blocking/payment/issue state correctly?** Mostly. `deriveTaskState` is reused. Payment emission goes through canonical helper. Issues are emitted independently. **But:** workstation's `isJobBlocked` (job.issues.length > 0 || effectivelyDuePayments.length > 0) is *coarser* than the health helper's per-state breakdown — same blocker can be either "critical investigate item" (issue) or "high investigate item" (payment), and the per-task work item only knows `isBlocked` (a derived-state flag), not the *reason*.
- **Can it show a later task while an earlier task is incomplete?** **Yes, structurally.** Every open task is emitted. The "first task gets primary priority, rest are low" mitigation reduces visual saturation but does not hide later tasks. A later READY task can still appear in `due` lane if the earlier task is BLOCKED.
- **Can it miss recovery tasks?** Recovery tasks are normal `JobTask` rows (with `recoveryFlowId` set) so they are emitted by the same per-task loop. Their derived state correctly bypasses the parent issue. Workstation does NOT specially label them as "recovery" — the only hint is the stage title `Corrections`.
- **Can it show blocked tasks as actionable?** **No** — blocked tasks set `group = "blocked"` and `priority = "low"` (because they aren't primary or because they're not READY). They land in `upcoming` lane via `rank()` (group=`waiting` would land in `upcoming` too). However, the `next step` copy says "Resolve blocker" which is correct.
- **Can it surface sales/quote work in a way that dilutes execution work?** Possible. Quotes in DRAFT/SENT/APPROVED states emit as `critical` or `high` lane items via the embedded-workflow priority logic. With many in-flight quotes, the workstation can be crowded. Lanes are capped (3 critical focus cards + LANE_CAP=10 critical-queue + 10 due + 5 upcoming + 5 watch) per page — so total visible items are bounded but the *order* may push execution items down.
- **Does it use shared work surfaces or duplicate editors?** ✅ Reuses `TaskWorkSurface`, `LeadCommercialSurface`, `QuoteWorkSurface` via the `Wrapper` async components in `/workstation/page.tsx`. No duplicate editors.

### Risks that could cause users to work on the wrong thing

- **WS1 (HIGH):** Tied `sortOrder` across tasks from different source lines into the same stage → tasks may flip-flop between page loads. Compounded by the "primary task" rule, which could shift critical-card focus.
- **WS2 (MEDIUM):** Two work items for the same problem (issue + blocked tasks tied to that issue). User may resolve one and miss the other. Currently the queue shows issue first (critical) and demoted tasks at low priority, so workflow nudges toward the issue, but it is not enforced.
- **WS3 (MEDIUM):** Hardcoded "Insights" sidebar with fake metrics: `Job Velocity ↑ 12%`, `Quote Conversion 68%` (`workstation/page.tsx` lines ~317-332). These are static values, not derived from data. Treated as product truth in UI. This is *not* an execution-engine bug per se but is a workstation-canon violation (no fake metrics).
- **WS4 (LOW):** Quote items with `APPROVED_NEEDS_EXECUTION_REVIEW` go to critical lane (workflow.priority = `blocking`). Lots of execution-review-needed quotes can crowd out actual blocked-work items.

---

## 8. AI Execution Plan Safety Audit

### Inventory

Three AI flows touch execution:
1. **Library default execution plan** (`AIService.generateLibraryExecutionPlan`, persisted via `applyLineItemTemplateAIProposalAction`) — saves to `LineItemTemplateTask`. **Review-then-apply** pattern.
2. **Quote-line execution plan** (`AIService.generateExecutionPlan` → same internal helper, persisted by `generateQuoteLineExecutionPlanAction`) — saves to `QuoteLineExecutionTask`. **Generate-and-persist** pattern (no separate review step).
3. **Recovery path suggestion** (`AIService.suggestRecoveryPath` invoked from `suggestRecoveryPathAction`) — returns an `AIRecoveryProposal`; the `RecoveryFlowBuilder` UI shows it for review; user must explicitly add tasks; tasks are then persisted via `addRecoveryTaskAction`. **Review-then-apply** pattern.

### Answers

- **What can AI generate?**
  - Library: structured task proposals with category, stage mapping (via `stageName`/`stageKey`/`stageIntent`), instructions, signals, checklist, resources, hardSignal, confidence, reasoning.
  - Quote-line: same structure, persisted directly as draft execution tasks.
  - Recovery: tasks with category, classification, instructions, proof requirements, signals, checklist.
- **What validation exists before returning a plan?**
  - JSON extraction (regex match for first `{...}` block).
  - Category normalization (`normalizeCategory`) with explicit fuzzy regex aliases → falls back to `GENERAL` with a normalization warning, or `null` (which becomes warning + GENERAL).
  - Stage mapping via `mapAiStageToStageId(stageName | stageKey | stageIntent)`. Mapping warnings + reasons attached to the proposal.
  - Corrections-stage filter: any task mapped to Corrections is removed and a fixed warning is appended (`CORRECTIONS_CONDITIONAL_WORK_WARNING`).
  - Per-task `AILibraryProposedTaskSchema.safeParse` — invalid tasks throw `AiExecutionPlanInvalidError`. Other failures (network/HTTP) → `AiProviderTemporarilyUnavailableError`.
  - Final `AILibraryProposalSchema.parse` on the whole proposal.
- **What validation exists before applying a plan?**
  - Library apply (`validateLibraryDefaultExecutionProposalForApply`):
    - `resolveGenerationMetaForApply(proposal, generation)` — if simulated and `AI_ALLOW_APPLY_SIMULATED_EXECUTION_PLANS !== "1"`, **reject** with the stamped reason.
    - Belt-and-braces second check: `isSimulatedExecutionProposal(proposal)` regex-checks assumptions/warnings for simulated markers and re-rejects.
    - Corrections filter (defense in depth).
    - Every task must have `stageId` set (apply rejected with unmapped titles otherwise).
  - Quote-line apply (`validateQuoteAiExecutionPlanForPersist`):
    - Allowed stages must be non-empty (otherwise "Add execution stages in Scope Library..." message).
    - Corrections filter.
    - Every task must have `stageId`.
    - **Does not check `generation.canApply` itself** — that check is done one level up in `generateQuoteLineExecutionPlanAction` before validation.
- **Are simulated/demo plans fully gated?**
  - **Library path:** Two gates. (a) `generation.canApply` is false when simulated AND `AI_ALLOW_APPLY_SIMULATED_EXECUTION_PLANS !== "1"`. (b) `validateLibraryDefaultExecutionProposalForApply` independently re-checks via `isSimulatedExecutionProposal`. ✅ Belt + braces.
  - **Quote-line path:** Only the `generation.canApply` upstream check. The validator does not re-check for simulated content. **If a caller skipped the upstream check, a simulated plan could be persisted.** Today only `generateQuoteLineExecutionPlanAction` calls `validateQuoteAiExecutionPlanForPersist`, and it does check `canApply` first. So the gate holds for now — but the validator alone is not safe.
  - **Recovery path:** No simulated fallback exists; `suggestRecoveryPath` throws if `GEMINI_API_KEY` is missing. Good.
- **Can invalid AI output be partially saved?**
  - Library: No — apply is atomic per `$transaction`. Either all tasks created or none.
  - Quote-line: No — same `$transaction` pattern.
  - Recovery: **Partially yes.** `RecoveryFlowBuilder.handleSubmit` runs `createRecoveryFlowAction` + N × `addRecoveryTaskAction` + `activateRecoveryFlowAction` *sequentially with separate await calls*, not in a single transaction. If a recovery task creation fails partway, the flow is left in DRAFT with some tasks created. The next user attempt would hit the idempotent guard on `createRecoveryFlowAction` (returns existing), but task list could be partial.
- **Is there any fallback that creates fake tasks?**
  - Yes, `simulateLibraryExecutionPlan` returns hardcoded tasks ("Material Delivery & Roof Loading", "Setup for ${description}", etc.). They are stamped with "Simulated: ..." assumptions and a "Demo AI output" warning. Apply is blocked unless the env flag explicitly allows it.
- **Is Apply disabled for demo/simulated output unless explicitly allowed?**
  - Library: ✅ Yes.
  - Quote-line: ✅ Via the upstream `canApply` check in `generateQuoteLineExecutionPlanAction`.
  - Recovery: N/A.
- **Are user-facing errors safe and non-technical?**
  - Mostly. `AI_INVALID_EXECUTION_PLAN_MESSAGE` is human-friendly. `getAiActionErrorMessage` is used in catch blocks. The `validateQuoteAiExecutionPlanForPersist` returns "AI could not assign a stage to every task. Add or rename stages in Scope Library, then try again." which is appropriately product-facing.
  - **Exception:** `applyLineItemTemplateAIProposalAction` returns "Failed to apply AI execution plan." on any throw — fine, but the underlying error is `console.error`ed server-side, which is correct.
- **Are technical errors logged server-side only?** ✅ Yes — `console.error(...)` used in catch blocks; user gets human messages.
- **Does generated work preserve line item / stage / task / category / source context?**
  - Library: `sourceTaskTemplateId` preserved when AI selects a reusable task; otherwise CUSTOM. Stage preserved via `stageId`. Category enforced via enum normalize.
  - Quote-line: `sourceTaskTemplateId` is **not** set by `generateQuoteLineExecutionPlanAction` even though the AI prompt explicitly tells the model to "SELECT FROM REUSABLE TASKS FIRST" and return `sourceTaskTemplateId`. The action loops over `plan.tasks` and creates `QuoteLineExecutionTask` with `sourceType: CUSTOM` and **no `sourceTaskTemplateId`**. The library equivalent action *does* set `sourceTaskTemplateId` via `pTask.sourceTaskTemplateId ?? null`. **This is a lineage bug** — see Risk Register.
  - Recovery: All recovery tasks are stamped CUSTOM; no `sourceTaskTemplateId` even if the AI recovery proposal pulled from a template.

### Hallucination / fake-work risk flags

- **AI1 (HIGH for quote-line path):** Quote-line AI generation does not preserve `sourceTaskTemplateId` even when the AI selects a reusable template. Library path does this correctly. → Loss of provenance and reuse signal.
- **AI2 (MEDIUM):** `generateQuoteLineExecutionPlanAction` writes a fresh `crypto.randomUUID()` for each checklist item and each resource. If the AI proposal contains duplicate items (model error), they all get unique ids and all get saved.
- **AI3 (MEDIUM):** No "review before persist" UI for quote-line AI plans. The proposal flows straight into the editable draft list. User can edit/delete after, but cannot reject the whole proposal before it touches the DB. Library mode has a review modal first.
- **AI4 (LOW):** `simulateLibraryExecutionPlan` is gated, but the simulated output's stage mapping depends on `getStagesForAiExecutionPlanning` returning at least the chosen stage. If the org has no "Preparation"/"Rough-in"/"Installation" stages, the simulated tasks get `stageId: null` and would fail validation. This is acceptable (it can't be applied anyway).
- **AI5 (LOW):** AI fallback in retry uses exponential backoff with up to 3 attempts. Acceptable; fails closed.

---

## 9. Production Risk Register

| # | Risk | Area | Files | Severity | Why it matters | Type | Suggested direction | Fix when |
|---|---|---|---|---|---|---|---|---|
| R1 | **Dead `JobStage` signal pathway.** Stage signals never written but read in 3+ derivation/promotion sites. | execution engine | `quote-job-activation-actions.ts`, `signal-bus.ts`, `task-readiness.ts`, `job-task-actions.ts:completeJobTaskAction` (stage-complete promotion) | **High** | Operators may expect "stage requires X" gates to work because the field exists, the readiness logic checks them, and the UI may display them. Today it silently does nothing. Latent bug if signals are added without auditing this path. | Code + canon drift | (a) Wire activation to copy stage signals from quote-line aggregate, or (b) remove the schema fields + downstream readers. Either way, decide which. | **Now** (decision; implementation can follow). |
| R2 | **Tied `JobTask.sortOrder` across lines sharing a stage.** Two tasks from different source lines can both have `sortOrder=0` in same `JobStage`. | execution engine, workstation | `quote-job-activation-actions.ts` (no renumber pass), `quote-line-execution-actions.ts:nextSortOrderInStage` (per-line), `workstation-query.ts`, `job-execution-health.ts` | **High** | Non-deterministic task ordering across page loads; "primary task" focus may flicker on workstation; "next ready task" may switch between job page and workstation. | Code bug | Add a final pass at activation: renumber `JobTask.sortOrder` per stage by source-line `sortOrder` then per-line `sortOrder`. | **Now**. |
| R3 | **Two parallel issue-mitigation systems** (follow-up task vs recovery flow). | issues, recovery | `job-issue-actions.ts:createFollowUpTaskFromIssueAction`, `recovery-actions.ts:*`, `task-readiness.ts` | **High** | UX/behavior divergence: follow-up tasks don't unblock; recovery does. Same surface UI can spawn either, producing different downstream behavior. | Code + canon drift | Decide on a single mitigation model. Deprecate follow-up task path or formalize it as "non-bypass mitigation" with distinct UI affordance. | **Now** (decision); migration later. |
| R4 | **Quote-line AI bypasses review-then-apply.** Persisted directly to DB after validation. | AI, quote execution | `quote-line-execution-actions.ts:generateQuoteLineExecutionPlanAction` | **High** | Violates canon ("AI is review-then-apply"). User can't reject a bad plan before it lands in the database. If `canApply` upstream check ever changes, simulated plans could be persisted (the validator alone does not catch simulated). | Code drift | Add a UI review step + an `applyQuoteLineExecutionAIProposalAction` mirroring the library pattern. Also belt-brace the validator with `isSimulatedExecutionProposal`. | **Now**. |
| R5 | **AI lineage loss on quote-line path.** `sourceTaskTemplateId` not persisted even when AI selected a template. | AI, lineage | `quote-line-execution-actions.ts:generateQuoteLineExecutionPlanAction` (line ~683-690) | **Medium** | Loss of "this task came from a reusable template" signal; downstream reporting / library reuse metrics undercounted; later edits to template can't propagate. | Code bug | Persist `sourceTaskTemplateId` if provided by the proposal. Match library path conventions. | **Soon**. |
| R6 | **`promotePendingPaymentsToDue` skipped on override completion.** | payments, override | `job-task-actions.ts:overrideJobTaskReadinessAction` | **Medium** | Override path silently fails to promote payments tied to stage-completion. Job may sit with PENDING payments that should be DUE. | Code bug | Mirror `completeJobTaskAction`: call `promotePendingPaymentsToDue` in the override tx. | **Now**. |
| R7 | **`toggleJobTaskChecklistItemAction` has no readiness gate.** | tasks | `job-task-actions.ts:toggleJobTaskChecklistItemAction` | **Medium** | Users can toggle checklist items on a task that is BLOCKED_BY_ISSUE, eroding the audit chain (proof captured "during the block"). | Code bug | Either (a) reject toggles on blocked tasks, or (b) document that checklist progress is allowed while blocked (intentional). Pick one. | **Soon**. |
| R8 | **`updateJobTaskStatusAction` revert leaks signals.** Comment explicitly says "Signal retraction on revert is not implemented in v1." | signals, tasks | `job-task-actions.ts:updateJobTaskStatusAction` | **Medium** | If a DONE task is reverted to TODO via this action (rare path), its signals remain published, possibly unblocking downstream tasks that should no longer be ready. | Documented gap | Either remove the action or implement retraction + handle downstream re-block. | **Later** (rare path). |
| R9 | **Hardcoded Insights metrics** in workstation sidebar ("Job Velocity ↑ 12%", "Quote Conversion 68%"). | workstation UX | `app/(workspace)/workstation/page.tsx` (lines ~317-332) | **Medium** | Operators may treat these as real KPIs and make decisions on them. Violates workstation guardrails ("no fake metrics"). | UX bug | Remove or wire to real data. | **Now**. |
| R10 | **`db.ts` ships fetch calls to `http://127.0.0.1:7937/...`** at Prisma init and `$connect`. | infra/security | `apps/web/src/lib/db.ts` lines ~173-232 | **High (if it ships)** | Production app would attempt to POST to a debug ingest server on every cold start. Even though fire-and-forget, it's noise and possibly a data egress concern (logs DB URL host/port/database). | Code drift / left-in debug | Remove the "agent log" regions before production. | **Now**. |
| R11 | **Workstation `isJobBlocked` ≠ execution-health blocked state.** | workstation, health | `workstation-query.ts` (job loop) vs `job-execution-health.ts` | **Medium** | Workstation may classify a job as blocked while execution-health says HEALTHY_ACTIVE, or vice versa. Status messaging diverges. | Drift | Replace `isJobBlocked` with `executionHealth.severity === "blocker"`. | **Soon**. |
| R12 | **Percentage-only payment schedule items create $0 requirements.** | payments | `quote-job-activation-actions.ts` (line ~262-280) | **Medium** | Quotes built around percentage milestones (e.g. "30% deposit") create runtime requirements with `amountCents = null`, never auto-promote (no nonzero amount), and don't block anything. | Code bug | Compute amount = round(quote.totalCents × percentage / 100) at activation, or reject percentage-only schedules earlier. | **Soon**. |
| R13 | **Corrections stage race / non-upsert creation.** | stages | `recovery-actions.ts:addRecoveryTaskAction`, `job-issue-actions.ts:createFollowUpTaskFromIssueAction` | **Low** | Two concurrent requests could create two `Stage` rows named "Corrections" (no DB unique on name); subsequent code would find the first one and orphan the second. | Race | Add a unique partial index on (`organizationId`, `name`) for Corrections, or use `upsert` with composite where. | **Later**. |
| R14 | **`onDelete` not explicit on `JobTask.recoveryFlow` relation.** | recovery | `schema.prisma` | **Low** | Defaults to `SetNull`; explicit declaration would protect against future changes. | Schema clarity | Annotate `onDelete: SetNull`. | **Later** (schema change — requires approval). |
| R15 | **Recovery builder is non-atomic.** Sequential creation of flow → tasks → activate without a tx. | recovery | `components/jobs/recovery-flow-builder.tsx:handleSubmit` | **Medium** | Partial state if a task creation fails midway (flow in DRAFT, some tasks created). User retries hit the idempotent flow guard but task list could already be partially populated. | Code bug | Move the multi-step recovery creation server-side into a single transactional action. | **Soon**. |
| R16 | **`JobIssueSeverity.DOES_NOT_BLOCK` is functionally unused.** | issues | enum + readers | **Low** | Enum value invites future divergence (some code treats it as "warning", other code ignores). Today no surface acts on it. | Canon drift | Either implement non-blocking issue surface (workstation warning row, audit trail) or remove the enum. | **Later**. |
| R17 | **`JobActivityType.EVENT_CREATED/EVENT_RESOLVED` referenced but no `JobEvent` model.** | activity | `job-event-actions.ts`, schema enum | **Low** | Dead enum values OR pointing at a deprecated concept. | Canon drift / dead code | Audit `job-event-actions.ts`; either re-anchor to `JobIssue` or delete. | **Later**. |
| R18 | **No "in-progress" task state.** Only TODO/DONE. | tasks | schema `JobTaskStatus` enum | **Low** (intentional in v1) | Cannot represent partial work or "claimed by a user". This is canon-aligned for v1 but worth flagging if any feature plans to need it. | Canon constraint | Defer. | **Later**. |
| R19 | **`JobRecoveryFlow.source*` (permit/inspection/checklist) accept input but unused.** | recovery | `recovery-actions.ts:createRecoveryFlowAction` input shape | **Low** | Dead fields invite future divergence. | Canon drift | Tighten the input type to only `sourceFailedTaskId` until other event models exist. | **Later**. |
| R20 | **AI category fuzzy-matching has broad `GENERAL` regex.** Default catch-all matches `INSTALL`, `PREP`, `DEMO`, etc. | AI | `ai-service.ts:normalizeCategory` | **Low** | Reduces signal quality of the `category` field (everything fuzzily falls to GENERAL). Currently warns and saves. Acceptable. | Code design | Accept that category is hint-only; UI shouldn't depend on category accuracy from AI. | **Later**. |
| R21 | **Force-resolve allows empty resolution note.** | recovery | `resolveJobIssueWithRecoveryHandling` (force branch) | **Low** | Audit trail says "force resolved" but may lack human explanation. | UX | Require non-empty note for force mode. | **Soon**. |
| R22 | **Cross-line stage lineage is lossy.** `JobStage.sourceQuoteLineItemId` captures one source line; if multiple lines share a stage, others are lost. | execution engine, lineage | `quote-job-activation-actions.ts` (stage creation) | **Low** | Loss of "where did this stage come from" when a stage is shared. | Code drift | Either drop the field (since it's misleading when shared) or store an array (would require schema change). For now, document. | **Later**. |
| R23 | **AI proposals can write hardcoded simulated tasks if a future caller forgets the `canApply` gate.** | AI | `quote-line-execution-actions.ts`, `validateQuoteAiExecutionPlanForPersist` | **Medium** | Defense in depth missing. Library path has belt-and-braces. | Code drift | Add `isSimulatedExecutionProposal` check inside `validateQuoteAiExecutionPlanForPersist`. | **Soon**. |
| R24 | **Workstation "primary task" rule is one-task-per-job.** Demotes all other open tasks. | workstation UX | `workstation-query.ts` (per-job task loop) | **Low** | Multi-crew jobs (in future) where two parallel tasks should both be highlighted will be artificially limited. Acceptable for v1 because there's no assignment model yet. | Canon-aligned constraint | Defer. | **Later**. |

---

## 10. Current Code Canon: Execution Engine

What is **actually true** today, based on code:

### Confirmed by code

- **Lead → Quote → Job is one-directional and copy-on-activate.** Activation snapshots quote line items, draft execution tasks, and payment schedule items into job rows. Later quote edits do not touch the runtime job.
- **One job per quote.** Enforced by `@@unique` on `Job.quoteId`.
- **Stages are org-level reusable containers**, not workflow engines. `JobStage` is a per-job materialization.
- **Tasks live inside stages.** `JobTask.jobStageId` is required.
- **Task readiness is fully derived** via `deriveTaskState`. Reused across all 7 readers. Inputs: stored facts on `JobTask`, `JobStage.requiresSignals` (currently `[]`), open issues on task or stage, live signals from `JobSignal`, recovery-flow bypass option.
- **Signals are first-class facts** on `JobSignal`. Mute logic ties signal liveness to absence of open BLOCKS_WORK issues on the source task/stage.
- **Payment due-ness is derived.** `isPaymentEffectivelyDue` consumes stored `JobPaymentRequirement.status` + anchor data + main-path stage completion. FINAL_BALANCE is conservative.
- **Recovery flows are first-class.** Multi-task structured plans attached 1:1 to issues. Recovery tasks bypass the parent issue blocker via `options.recoveryFlowIssueId`. Resume/force/standard modes go through `resolveJobIssueWithRecoveryHandling`.
- **Activation has a single readiness gate** (`evaluateQuoteJobActivationReadiness`) used by both UI and server.
- **Workstation is a derived surface.** No persisted ranks. `queryWorkstationWorkItems` is the single emission point. Shared work surfaces are reused for editing.
- **Activity is recorded centrally** via `recordJobActivity` for significant job-state transitions.
- **Library AI plans follow review-then-apply.** Two-step gate on simulated content.
- **Corrections stage is a magic name.** Created lazily by issue mitigation paths; excluded from main-path payment completion; filtered out of AI execution planning.
- **Override completion bypasses signal and proof validation** but not open BLOCKS_WORK issues.

### Partially true / inconsistent

- **"Stage signals exist."** Schema fields exist and are read by code, but no path writes them. (R1)
- **"AI is review-then-apply."** True for the library; false for quote-line generation. (R4)
- **"Issue mitigation = recovery flow."** True if user clicks "Create Recovery Path"; the `createFollowUpTaskFromIssueAction` parallel path produces a non-bypass task with no flow. (R3)
- **"Activation copies everything."** True for tasks and payments; not for stage-level signals; lossy for stages shared by multiple lines (only one source line tracked).
- **"Task order is stable."** Stable across stages; tied within stages when multiple lines map to the same stage. (R2)
- **"Override is auditable and gated."** Gated against open issues, audited via `metadataJson.override=true`, but skips proof validation AND payment promotion. (R6)
- **"Recovery is atomic."** Server side, yes (each action). End-to-end recovery-flow creation from UI is not atomic. (R15)

### Not true anymore / outdated

- **The Lead model "has fields like `title`, `contactName`, `email`, `phone`."** False at the database level — these are virtual fields produced by the Prisma client extension in `db.ts` reading `Lead.contact` JSON. Callers see them as if they were columns, but they're computed. This is well-handled in code but worth knowing.
- **The execution model previously involved "events" or "nodes."** The `JobActivityType.EVENT_CREATED/EVENT_RESOLVED` enum values + `JobRecoveryFlow.source*EventId` columns + `job-event-actions.ts` suggest a previous event-based design that has been partially absorbed into `JobIssue`/`JobActivity`. Code does not appear to use `JobEvent` as a model.
- **The "checkpoints are not execution sources" canon line.** Confirmed by code — `QuoteCheckpoint` is referenced only at activation as a gate (`approvalCheckpoint`); it does not feed tasks or stages. ✅ still true.

### Missing or unsafe

- **No retraction of signals on task revert.** (R8)
- **No way to address an issue without either bypassing it (recovery) or hand-rolling a follow-up task that doesn't actually unblock.** Mitigation is forked into two systems. (R3)
- **No "stage signal" write path** despite "stage signal" being a real readiness input. (R1)
- **No global task-sort renumber at activation.** (R2)
- **No review surface for quote-line AI plans before persist.** (R4)
- **No protection against simulated AI proposals in the quote-line validator alone.** (R23)
- **Debug fetch calls in `db.ts` ship to localhost:7937.** (R10) — Critical to remove before any production deploy.

### Recommended locked canon (derived from current code)

Use this as the v1 canonical statement, narrower than aspirational docs:

#### Line items
- The `QuoteLineItem` is the **single commercial unit** of work. Pricing, customer-facing notes, and execution lineage all hang off a line.
- Lines may have zero or more `QuoteLineExecutionTask`s (the "execution plan" for that line).
- Lines never carry stages directly; stages come from `QuoteLineExecutionTask.stageId`.
- Line totals are recomputed on every mutation by `recalculateQuoteRollupsInTx`.

#### Stages
- Stages are **org-level reusable presets** (`Stage` model) with name, sort order, archive flag. Nothing more.
- `JobStage` is a per-job materialization with `sourceQuoteLineItemId` lineage (lossy when multiple lines share a stage).
- "Corrections" is a reserved stage name. The system manages it lazily; it is excluded from main-path stage-completion logic.
- **Stages do not carry signal logic in v1.** (Canon rectification: either remove the unused signal arrays or wire them up — pick one.)

#### Tasks
- `JobTask` is the runtime unit of work. Always lives inside a `JobStage`. Always belongs to a job.
- Status enum is binary: TODO or DONE. No IN_PROGRESS.
- Completion proof is configurable per task via `completionRequirementsJson` (note + photo + attachment + checklist).
- Lineage is preserved through `sourceQuoteLineItemId`, `sourceQuoteLineExecutionTaskId`, `sourceTaskTemplateId`, `sourceJobIssueId`, and `recoveryFlowId` (mutually informative).
- Task ordering is `(jobStage.sortOrder, task.sortOrder)`; **task.sortOrder is currently not unique within a stage when multiple source lines map to the same stage** — fix recommended.

#### Issues
- `JobIssue` represents a *currently happening* problem. Severity is binary; only BLOCKS_WORK gates work today.
- Issues can be linked to job, stage, or task (`jobStageId` / `jobTaskId` optional).
- Issues mute signals on the source task/stage as long as they're OPEN + BLOCKS_WORK.
- Resolution always goes through `resolve-job-issue-core.ts`. Three modes: standard / resume / force.

#### Recovery flows
- One per issue (`@@unique`). Created in DRAFT, activated to ACTIVE, completed only via standard/resume mode when all tasks DONE, cancelled only via force mode.
- Recovery tasks are normal `JobTask`s with `recoveryFlowId` set. They live in the `Corrections` `JobStage`. They bypass the parent-issue blocker on the **specific** task only.
- The follow-up-task path (`createFollowUpTaskFromIssueAction`) is **either a deprecated parallel pattern or needs a clear, distinct canonical role**. Until decided, it produces non-bypass tasks with surprising behavior.

#### Payment gates
- `JobPaymentRequirement.status` is an *audit fact*. Effective due-ness is derived.
- Anchor types and main-path stage completion gate when PENDING auto-promotes to DUE.
- FINAL_BALANCE conservative rule: only when all other requirements are settled and all main-path stages complete.
- Payment due-ness can produce a **task hold** (display only) — does not prevent task completion at the server level.
- Job-level blocking from payments is read by execution-health and workstation, with the workstation using a coarser definition than health (R11).

#### Workstation signals
- All derived. Single emission via `queryWorkstationWorkItems`. Single ranking via `rank()`.
- Per-job emission produces multiple work items (execution-health, visit, task[1..N], issue[1..M], payment[1..K], daily-log).
- Primary-task focus: per job, only the first-ordered open task gets non-low priority.
- No persistent ranks. No fake metrics — but currently violates this rule in the "Insights" sidebar (R9, must remove).

#### AI-generated execution plans
- AI is review-then-apply. Library path complies; quote-line path does not (R4) and should be brought into line.
- Simulated/demo plans must be double-gated: at generation (`canApply=false`) AND at apply-validate (`isSimulatedExecutionProposal`). Library path complies; quote-line path relies only on the first gate.
- AI may select reusable `TaskTemplate`s; persistence must preserve `sourceTaskTemplateId` (library: yes, quote-line: not currently — R5).
- AI may not generate Corrections-stage tasks; the filter is enforced at both generation and validation.
- Recovery suggestions are not gated by simulated-flag because there is no simulated fallback for recovery (good).

---

## End of audit
