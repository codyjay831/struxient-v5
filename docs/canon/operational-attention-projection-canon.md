# Operational Attention Projection Canon (Struxient v5)

> **Status:** Design canon, pre-implementation.
> **Scope:** Internal staff operational attention across Workstation and record detail pages.
> **Related:** [workstation-canon.md](./workstation-canon.md), [workspace-ux-canon.md](./workspace-ux-canon.md), [execution-engine-canon.md](./execution-engine-canon.md), [change-order-canon.md](./change-order-canon.md), [execution-aware-authorization-canon.md](./execution-aware-authorization-canon.md), [../architecture-guardrails.md](../architecture-guardrails.md), [../source-of-truth-map.md](../source-of-truth-map.md)

---

## 1. Product purpose

Operational Attention answers one production question:

> When something needs action, does the right person clearly see it, understand why, and have one safe next action?

The layer exists to help Struxient turn quote scope and messy job activity into executable work, surfaced at the right time to the right person. It is an internal projection over real workflow facts. It is not a workflow engine, not a notification system, and not AI-authored truth.

The primary consumer is Workstation. Detail pages must also consume the same derived attention facts when they explain why a record is blocked, waiting, ready, or unsafe to mutate.

---

## 2. Planning priority

This canon is a structure guide, not proof that the current product behavior is wrong.

The current app mostly works the way intended. Implementation must first prove that the same frontend behavior can be powered by a cleaner derived attention projection. Do not redesign Workstation, record pages, statuses, buttons, or workflows just to match this document.

Priority order:

1. Preserve existing user-facing behavior unless there is a clear bug, contradiction, permission risk, or source-of-truth problem.
2. Improve backend structure, helper ownership, reason/action parity, and test coverage.
3. Avoid visible UI churn in early slices.
4. Do not rename statuses, buttons, or workflows unless existing wording is actively confusing or unsafe.
5. If this canon conflicts with working product behavior, call out the conflict and recommend whether canon should change instead of code.
6. Keep server actions as the safety gate. Operational Attention explains safe action; it does not replace write-time validation.

Success means:

- The frontend feels the same or slightly clearer.
- Backend attention derivation has less duplicate logic.
- Workstation and detail pages agree.
- Server actions remain authoritative for mutation safety.
- Tests prove no regression.

---

## 3. Non-goals

Do not build these as part of Operational Attention:

- Stored attention statuses.
- An `AttentionItem` database table.
- A notification, reminder, inbox, or outbox system.
- AI-generated action cards.
- New lifecycle statuses or renamed core statuses.
- A second workflow engine inside Workstation.
- UI-component-local readiness, blocked, due, or done logic.
- Analytics dashboards or fake metrics dressed up as operational truth.
- Dismiss, snooze, assignment, or history semantics without a separate audit/notification design.

If a future product decision needs notification delivery, acknowledgement, escalation, or dismissal history, that should be designed as a separate stored workflow/audit layer. It must not backfill derived attention into mutable status flags.

---

## 4. Source-of-truth rule

Operational Attention is derived from existing canonical workflow truth.

Store facts. Derive attention. If an attention item needs a second definition of blocked, ready, due, stale, safe-to-send, safe-to-apply, or safe-to-complete, extend the domain helper that already owns the rule.

| Workflow area | Stored truth | Derived attention owner |
|---------------|--------------|--------------------------|
| Quote commercial truth | `Quote`, `QuoteLineItem`, totals, scope decisions, clarification answers, payment schedule rows | `getQuoteReadiness()`, `getQuoteWorkflowPresentation()`, quote send blockers |
| Quote approval / customer acceptance truth | `Quote.status`, `QuoteCheckpoint`, signature request/recipient/delivery/artifact facts, quote change requests | `getQuoteReadiness()`, signature presenters, opportunity flow |
| Quote execution plan truth | `QuoteExecutionPlan.status`, accepted hash/version, proposal/plan task rows | `evaluateQuoteJobActivationReadiness()`, `validateQuotePlanProposalForApply()` |
| Job task truth | `JobTask.status`, completion fields, proof JSON, task issues, required/provided signals, live `JobSignal` rows | `deriveTaskState()`, `validateTaskCompletionReadiness()` |
| Job execution health truth | `Job`, `JobStage`, `JobTask`, `JobIssue`, `JobRecoveryFlow`, `JobPaymentRequirement`, live signals | `deriveJobExecutionHealth()` |
| Schedule / visit truth | `LeadVisitRequest` for sales visits; `JobScheduleEvent` and task-event links for job commitments; deadline fields | `getOpportunityFlow()`, scheduling derivation helpers, Workstation scheduling attention helpers |
| Change Order commercial delta truth | `ChangeOrder`, `ChangeOrderLine`, customer share/checkpoint facts | `deriveChangeOrderReadiness()`, commercial lifecycle/readiness helpers |
| Change Order execution delta truth | `ChangeOrder.executionDeltaJson`, `baseJobPlanVersion`, active `Job.jobPlanVersion`, `ExecutionPlanRevision` | execution delta validation/projection helpers, apply lifecycle helpers |
| Change Order payment impact truth | `ChangeOrder.paymentImpactJson`, accepted CO checkpoint, materialized `JobPaymentRequirement` rows | payment impact gates, allocation/review model, materializer validation |
| Customer request / submission truth | `CustomerRequest`, `CustomerPortalEvent`, explicit visible resources/uploads | customer portal presenters and request services |
| Audit / history truth | `JobActivity`, `LeadEvent`, `CustomerPortalEvent`, `PlatformAuditEvent` where applicable | activity/event presenters and role redaction helpers |

Operational Attention must not parse display copy or UI labels to infer business state.

---

## 5. Canonical type contract

The implementation may refine names, but it should preserve this shape and intent:

```ts
export type OperationalAttentionSeverity =
  | "info"
  | "attention"
  | "blocking"
  | "critical";

export type OperationalAttentionKind =
  | "quote_activation"
  | "quote_revision"
  | "change_order_send"
  | "change_order_apply"
  | "job_execution"
  | "task_execution"
  | "payment_review"
  | "schedule_risk"
  | "customer_request"
  | "proof_required";

export type OperationalAttentionSourceType =
  | "Lead"
  | "Quote"
  | "Job"
  | "ChangeOrder"
  | "Task"
  | "Payment"
  | "CustomerRequest"
  | "Schedule";

export type OperationalAttentionAction = {
  label: string;
  href?: string;
  actionKind?: string;
  disabledReason?: string;
};

export type OperationalAttentionVisibility = {
  canRead: boolean;
  canAct: boolean;
  redacted?: boolean;
  reason?: string;
};

export type OperationalAttentionRank = {
  lane?: "critical" | "due" | "upcoming" | "watch";
  lens?: "attention" | "today" | "waiting" | "upcoming" | "all";
  group?: "blocked" | "active" | "investigate" | "scheduled" | "waiting" | "ready";
  withinLaneRank?: number;
};

export type OperationalAttentionItem = {
  id: string;
  kind: OperationalAttentionKind;
  severity: OperationalAttentionSeverity;
  ownerRoles: StaffRole[];
  sourceType: OperationalAttentionSourceType;
  sourceId: string;
  quoteId?: string;
  jobId?: string;
  taskId?: string;
  changeOrderId?: string;
  customerId?: string;
  title: string;
  reason: string;
  safeNextAction: OperationalAttentionAction;
  secondaryAction?: OperationalAttentionAction;
  visibility: OperationalAttentionVisibility;
  createdAt?: Date;
  updatedAt?: Date;
  dueAt?: Date;
  rank?: OperationalAttentionRank;
};
```

### Contract notes

- `id` must be stable for the same derived condition, usually `${kind}:${sourceId}` or another deterministic key.
- `kind` is product/action taxonomy, not a database table name.
- `severity` is business urgency, not color.
- `ownerRoles` describe who is expected to handle the item by default. Server-side visibility still decides who can read.
- `visibility.canRead` and `visibility.canAct` must be computed from existing auth helpers and resource visibility rules.
- `redacted` means an item may be shown in a safe generic way, but sensitive data must be omitted.
- `safeNextAction.disabledReason` is required when the natural action exists but is unsafe or unavailable.
- `reason` must be human-readable and contractor-safe. Raw validator dumps belong in drill-down, not the card headline.
- `rank` is display metadata. It must not become workflow truth.

---

## 6. MVP attention taxonomy

Keep the taxonomy small until production usage proves a split is needed.

| Kind | Purpose | Example source |
|------|---------|----------------|
| `quote_activation` | Approved quote needs execution review or can be activated into a job | Quote approval + activation readiness |
| `quote_revision` | Customer requested changes or commercial drift requires review before proceeding | `QuoteChangeRequest`, revision drift |
| `change_order_send` | Draft/customer-requested-change CO needs work before it can safely send | CO send readiness blockers |
| `change_order_apply` | Accepted CO needs apply, execution review, or apply failure handling | CO application status + delta validation |
| `job_execution` | Job-level execution health needs attention outside a single task | job health, recovery, broken references, no next action |
| `task_execution` | Task is ready, overdue, blocked, or waiting in a way a role can act on | task readiness + due/schedule facts |
| `payment_review` | Payment requirement or CO payment impact needs office review/collection/waiver | payment readiness helpers |
| `schedule_risk` | Required scheduling is missing, commitment may be missed, or schedule cleanup is needed | schedule derivation helpers |
| `customer_request` | Customer submitted info/change/upload/request that staff must review | `CustomerRequest` |
| `proof_required` | Work cannot be safely completed without required note/photo/attachment/checklist/log proof | task proof/daily log/checkpoint facts |

Do not create highly specific kinds like `quote_plan_stale_after_accept`, `co_payment_impact_unsaved`, or `task_photo_missing` unless a distinct owner, UI treatment, or test matrix requires it. Use `reason`, `safeNextAction`, and source-specific metadata for detail.

---

## 7. Severity meanings

Severity must be deterministic.

| Severity | Meaning | Use when |
|----------|---------|----------|
| `info` | Useful context, not action-required, not blocking, not urgent | Showing a contextual state inside detail pages or future supporting panels |
| `attention` | Someone should review or act, but active production work is not currently stopped | Customer request needs review, sent quote/CO is waiting, payment needs office follow-up but execution is not hard-blocked |
| `blocking` | A workflow action is unsafe or disallowed until a specific condition is resolved | CO cannot send, quote cannot activate, task cannot complete due to issue/signal/proof, accepted CO needs execution review |
| `critical` | A blocking or at-risk condition can stop work now, lose customer trust, or leave sold/accepted work trapped | Overdue action, accepted CO not applied, approved quote ready/blocked at handoff, recovery complete waiting to resume, missed commitment |

Rules:

- Do not use `critical` for every high-value customer or dollar amount.
- Do not use `blocking` for payment unless the current product rule actually blocks the relevant workflow. Current payment execution behavior is attention-only unless a separate payment hard-blocking decision is approved.
- Waiting on a customer is usually `attention`, not `blocking`, unless it traps accepted/sold work that staff must process.
- Raw status names do not determine severity. Derived safe-next-action and production consequence determine severity.

---

## 8. Owner and role routing

Operational Attention has two layers:

1. **Owner routing:** who should handle the item by default.
2. **Permission enforcement:** who may read or act, enforced through existing auth/resource helpers.

Do not treat `ownerRoles` as authorization.

| Category | Default owner roles | Read/act notes |
|----------|---------------------|----------------|
| Quote activation / revision | OWNER, ADMIN, OFFICE | VIEWER may read commercial where allowed; FIELD/SUB do not see broad commercial queue by default |
| Change Order send/apply | OWNER, ADMIN, OFFICE | Commercial and payment details are sensitive; FIELD/SUB excluded unless a future explicit narrow policy exists |
| Job execution health | OWNER, ADMIN, OFFICE; FIELD/SUB for assigned/granted execution-impacting work | FIELD/SUB see only assignment/collaborator-visible job facts |
| Task execution | Assigned FIELD, assigned/granted SUBCONTRACTOR, OFFICE, ADMIN, OWNER | Action capability must use runtime staff actions and task/job visibility |
| Proof required | Assigned FIELD, assigned/granted SUBCONTRACTOR, OFFICE, ADMIN, OWNER | Proof upload/complete permissions remain action-specific |
| Payment review | OWNER, ADMIN, OFFICE | VIEWER may read commercial detail where policy allows; FIELD/SUB may see only generic payment-hold awareness on assigned work, no amounts/links/internal notes |
| Schedule risk | OFFICE, ADMIN, OWNER; assigned FIELD/SUB for their own commitments | Schedule coordination is office-owned unless current staff action policy allows field completion/outcome |
| Customer request | OWNER, ADMIN, OFFICE | Customer portal coordination follows commercial read/manage policy; FIELD/SUB do not see portal request details by default |

Use existing helpers such as `getJobVisibilityWhere()`, `getTaskVisibilityWhere()`, `authorizeStaffAction()`, `canReadCommercial()`, `canReadPaymentDetails()`, payment redaction helpers, and customer portal authorization helpers.

---

## 9. Resolver and service boundary

Recommended implementation structure:

```text
apps/web/src/lib/operational-attention/
  types.ts
  resolve-operational-attention-items.ts
  adapters/
    quote-attention.ts
    change-order-attention.ts
    task-attention.ts
    job-attention.ts
    payment-attention.ts
    customer-request-attention.ts
    schedule-attention.ts
```

This structure is a recommendation, not a schema lock. The important boundary is:

- Adapters call existing domain helpers.
- The resolver orchestrates data loading, role/resource filtering, deduplication, and rank metadata.
- UI consumes derived attention items.
- UI does not invent readiness, blocked, due, stale, or safe-to-apply logic.

`queryWorkstationWorkItems()` may remain the first aggregation point during migration. A safe path is to introduce the attention resolver behind it, then replace inline reason/action composition adapter by adapter.

---

## 10. Existing helper ownership

| Attention area | Existing helper/source that remains authoritative |
|----------------|---------------------------------------------------|
| Quote activation | `getQuoteReadiness()`, `getQuoteWorkflowPresentation()`, `evaluateQuoteJobActivationReadiness()` |
| Quote revision / customer requested changes | `QuoteChangeRequest`, `getOpportunityFlow()`, quote revision actions, quote readiness/workflow presenters |
| Change Order send | `deriveChangeOrderSendBlockers()`, `deriveChangeOrderSendReadiness()`, `deriveChangeOrderReadiness()` |
| Change Order apply | CO lifecycle/apply helpers, execution delta validation/projection, `deriveChangeOrderWorkstationAttention()` until replaced by richer adapter output |
| Job execution | `deriveJobExecutionHealth()` and recovery routing helpers |
| Task execution | `deriveTaskState()`, `toTaskReadinessInput()`, `validateTaskCompletionReadiness()`, due/scheduling derivation helpers |
| Payment review | `isPaymentEffectivelyDue()`, `getUnsettledEffectivelyDueRequirements()`, `deriveTaskPaymentHold()`, payment impact gates/materializer validation |
| Schedule risk | `deriveTaskNeedsScheduling()`, event timing derivation helpers, `workstation-scheduling-attention.ts`, `LeadVisitRequest`/opportunity flow for sales visits |
| Customer request | `CustomerRequest`, customer portal request services, customer portal presenters |
| Proof required | `deriveTaskState()`, proof validation, daily log status, quote checkpoint readiness where applicable |
| Role/capability | `role-feeds.ts` for emphasis only; `resource-access.ts`, `staff-actions.ts`, payment/customer portal visibility helpers for enforcement |

If these helpers disagree, fix the domain helper or canon. Do not patch the attention adapter around the disagreement.

---

## 11. Workstation UX rule

Workstation consumes Operational Attention. It does not invent workflow truth.

Early implementation should preserve the current Workstation UX. The projection should replace duplicated derivation behind the scenes before it changes layout, labels, buttons, or navigation.

Workstation must:

- Show one clear visible primary action per attention row/card.
- Show one human-readable reason.
- Separate waiting states from action states.
- Group by operational urgency and consequence, not database module.
- Avoid raw validation dumps in queue cards.
- Avoid duplicate buttons that suggest different safe actions for the same condition.
- Preserve route-backed contextual detail behavior.
- Respect role-specific emphasis without weakening server-side permission checks.
- Keep commercial/payment/customer-sensitive facts out of FIELD/SUB views unless existing policy allows them.

The default hierarchy remains:

1. Critical / blocking risk.
2. Due today / overdue.
3. Ready next actions.
4. Waiting / external holds.
5. Upcoming/supporting context.

If Workstation and a detail page disagree on the reason or safe next action, the projection is wrong or the detail page is bypassing canon.

---

## 12. Detail page parity rule

For the same record and actor, a quote/job/change-order/task/payment/customer-request detail page must show the same blocker reason and safe next action as Workstation.

Detail pages may show more context, including full validation details, history, and secondary actions. They must not:

- Enable an action that the attention projection marks unsafe.
- Use different business copy for the same blocker.
- Hide the primary blocker while showing secondary cleanup tasks.
- Recompute readiness in a component-local way.

The detail page can filter attention items to the current record, then render the top item as the record's operational banner/panel.

---

## 13. Testing requirements

Before implementation is considered production-safe, add tests for:

- Resolver unit tests by adapter.
- Snapshot or DTO parity tests proving existing Workstation-facing behavior is preserved in early slices.
- Role visibility tests for OWNER, ADMIN, OFFICE, FIELD, VIEWER, and SUBCONTRACTOR.
- Workstation/detail-page reason and safe-next-action parity.
- Change Order stale plan, apply failed, payment impact, no-work-impact confirmation, and customer-requested-changes cases.
- Quote activation blockers: missing plan, stale plan, failed validation, missing approval checkpoint, payment schedule errors, ready-to-activate.
- Task blocked, waiting on signal, overdue, due today, needs proof, and required schedule missing.
- Job execution health: recovery active, recovery ready to resume, no next action, broken reference.
- Payment attention-only behavior: payment attention must not imply task completion is blocked unless payment hard-blocking is explicitly approved.
- Customer request visibility and resolution routing.
- No AI source-of-truth: generated/summarized AI output must not create attention without stored workflow facts and a human apply boundary.

Tests should assert stable `kind`, `severity`, `reason`, `safeNextAction`, visibility, and source linkage where possible.

---

## 14. MVP implementation slices

### Slice 1: Types and resolver shell

- Add `OperationalAttentionItem` types.
- Add resolver shell and test fixtures.
- No UI behavior change.
- Prove role/capability shape can represent redacted and disabled actions.
- Prove existing Workstation DTOs can be produced or mapped without visible behavior changes.

### Slice 2: Quote activation and Change Order send/apply

- Wrap quote activation readiness and CO readiness/apply states.
- Target the riskiest commercial-to-execution handoffs first.
- Add parity tests for Workstation and detail-page blocker copy.

### Slice 3: Task and job execution attention

- Wrap `deriveTaskState()` and `deriveJobExecutionHealth()`.
- Preserve existing Workstation behavior while replacing inline reason/action strings.
- Cover blocked, overdue, proof, schedule, and recovery cases.

### Slice 4: Payment attention

- Wrap payment due/payment hold helpers.
- Keep attention-only behavior explicit.
- Add redaction tests for FIELD/SUB and read-only tests for VIEWER.

### Slice 5: Customer request and scheduling attention

- Add `CustomerRequest` and schedule-risk adapters.
- Respect customer portal coordination visibility and assignment-scoped schedule views.

### Slice 6: Workstation integration cleanup

- Migrate `queryWorkstationWorkItems()` to consume attention items/adapters.
- Remove UI string matching for operational categories where possible.
- Keep `rank()` as the display ordering authority unless a separate ranking redesign is approved.
- Keep copy/status/button changes out of this slice unless parity tests expose active confusion or unsafe behavior.

---

## 15. Known implementation risks

- Duplicating business logic in adapters instead of calling existing helpers.
- Treating this canon as a mandate to rewrite working user-facing workflows.
- Treating role routing as permission enforcement.
- Leaking commercial/payment/customer portal details to FIELD/SUB.
- Calling payment attention a blocker before the product decision changes.
- Creating too many attention kinds and making Workstation a taxonomy browser.
- Letting detail pages and Workstation explain the same blocker differently.
- Turning validation errors into raw queue copy.
- Using AI summaries as attention source facts.
- Persisting projection results and creating stale cards.
- Building dashboard widgets before the one safe next action is clear.

---

## 16. Open product questions

- Should quote commercial revision drift become a hard server gate before approval/activation, or remain an advisory attention item?
- Should payments remain attention-only, or should some requirements become hard execution blockers?
- Should VIEWER see all commercial/payment attention read-only, or should some sensitive attention be hidden even when commercial read is available?
- Should Workstation show non-blocking issues as coordination attention, or only `BLOCKS_WORK` issues?
- When should a customer request become OFFICE-only vs assigned-field visible context?
- Do we need stored acknowledgement/dismissal history later, and if so what audit event owns it?
- Where current behavior and this canon disagree, which side is actually correct for contractors under stress?

---

## 17. Cursor readiness

This canon is ready to support a Cursor planning prompt after review. Implementation should start with Slice 1 only: types, resolver shell, adapter fixtures, DTO/parity tests, and no UI changes.

---

*Canon update (2026-06-27): Initial Operational Attention Projection canon added after Workstation/quote/job/change-order/payment/customer-request attention investigation. Updated same day to clarify that canon guides backend structure and parity, not a rewrite of working product behavior.*
