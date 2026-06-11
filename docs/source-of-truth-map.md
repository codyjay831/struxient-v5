# Source-of-truth map

> **Purpose:** Quick reference for **what is stored vs derived** and **where the canonical implementation lives**. Product definitions remain in [`docs/canon/`](./canon/README.md)—this map points to code.
>
> **Rule:** If you need a second definition of “blocked,” “ready,” “due,” or “done,” extend the canonical helper or update canon—do not add parallel logic in UI.

## How to read this table

| Column | Meaning |
|--------|---------|
| **Stored** | Persisted fact or audit/workflow enum |
| **Derived** | Computed at read time from stored facts + helpers |
| **Canonical location** | File(s) that own the truth for implementation |
| **Risk if duplicated** | What breaks when copy-paste logic appears elsewhere |

## Execution & tasks

| Concept | Stored or derived? | Canonical location | Risk if duplicated |
|---------|-------------------|-------------------|-------------------|
| Task readiness (blocked / ready / needs proof) | **Derived** | `apps/web/src/lib/task-readiness.ts` — `toTaskReadinessInput()`, `deriveTaskState()` | UI shows ready while server rejects completion, or vice versa |
| Task completion | **Stored** | `JobTask.status`, `completedAt`, `completedByUserId`, `completionNote`, `completionRequirementsJson` | DONE without proof fields or activity |
| Stage readiness | **Derived** (helper exists; limited UI use) | `deriveStageState()` in `task-readiness.ts` | Wrong stage-level attention |
| Live signals | **Stored facts** | `JobSignal` via `apps/web/src/lib/signal-bus.ts` | Stale or local-only signal lists |
| Task completion gate (server) | **Derived check at write** | `completeJobTaskAction` in `job-task-actions.ts` | Bypass of issue/signal/proof rules |

## Payments

| Concept | Stored or derived? | Canonical location | Risk if duplicated |
|---------|-------------------|-------------------|-------------------|
| Payment requirement status | **Stored** (audit) | `JobPaymentRequirement.status` enum | Treating PENDING as due without anchor rules |
| Payment effectively due | **Derived** | `isPaymentEffectivelyDue()` in `job-payment-readiness.ts` | Raw `status === "DUE"` misses PENDING + anchor cases |
| Unsettled due requirements (job) | **Derived** | `getUnsettledEffectivelyDueRequirements()` | Inconsistent job blocking in Workstation vs job page |
| Task payment hold (display) | **Derived** | `deriveTaskPaymentHold()` | Per-task stored blocker flags in schema |
| Promote PENDING → DUE | **Stored update when derived true** | `promotePendingPaymentsToDue()` | Manual status edits fighting auto-promotion |
| Payment cleared signal | **Stored fact on publish** | `publishSignal()` from `job-payment-actions.ts` | Mismatched signal names vs task `requiresSignals` |

## Scheduling & task timing

> **Canon:** [scheduling-canon.md](./canon/scheduling-canon.md) · **Plan:** [scheduling-implementation-plan.md](./plans/scheduling-implementation-plan.md)

| Concept | Stored or derived? | Canonical location | Risk if duplicated |
|---------|-------------------|-------------------|-------------------|
| Resolved task deadline (`dueAt`) | **Stored** | `JobTask` via deadline service (`scheduling/deadline-service.ts` — target) | Per-page overdue calculations |
| Deadline mode / due rule | **Stored** | Task deadline fields + rule metadata | Hidden `dueOffsetMinutesAfterReady`-only logic |
| Task scheduling requirement | **Stored** | `JobTask.schedulingRequirement` (`NONE \| OPTIONAL \| REQUIRED`) | Inferring from `TaskTemplateCategory` |
| Work group identity + plan | **Stored** | `JobWorkPackage` (optional grouping + planned range only) | Treating package as execution-completion truth |
| Task primary work-group membership | **Stored** | `JobTask.workPackageId` (zero-or-one primary membership in MVP) | Many-to-many work-group ambiguity |
| Job calendar commitment | **Stored** | `JobScheduleEvent` via event service (`scheduling/event-service.ts` — target) | `JobTask.scheduledStartAt/scheduledEndAt` as parallel truth |
| Task–event link | **Stored** | Join table via link service | “Job has visit” as proxy for task scheduled |
| Event lifecycle state | **Stored** | `JobScheduleEvent.status` | Reschedule reopening terminal states in UI |
| Event completion outcome | **Stored** | `JobScheduleEvent` completion outcome (`WORK_COMPLETED \| PARTIAL_WORK \| NO_WORK_COMPLETED`) | Implicit return-work behavior with no explicit outcome truth |
| Planned date range | **Stored (forecast only)** | `JobWorkPackage.planned*` (optional) | Treating planned ranges as confirmed commitments |
| Needs scheduling | **Derived** | `deriveTaskNeedsScheduling()` in `scheduling/scheduling-derivation.ts` (target) | Category/job-no-visit/ready-unscheduled heuristics |
| Task overdue | **Derived** | `deriveTaskOverdue()` with org-TZ date-only EOD | Raw `dueAt < now` without granularity |
| Event upcoming / potentially missed | **Derived** | `deriveEventTimingLabels()` | Stored MISSED/IN_PROGRESS in MVP |
| Schedule conflicts (soft/hard) | **Derived** | `scheduling/scheduling-derivation.ts` (target) | Calendar-only overlap without tentative/confirmed split |
| Assignment completeness warning | **Derived** | Scheduling derivation/policy checks (kind + assignment expectation) | Forcing fake worker assignments as stored truth |
| Return-work candidate set | **Derived** | Open linked tasks + completion outcome + event status | Auto-copying closed/canceled tasks into return event |
| Employee unavailability | **Stored** | `ScheduleBlock` | Mixing into job event lifecycle |
| Lead estimate visit | **Stored** | `LeadVisitRequest` | Conflating with job execution events |
| Schedule mutation audit | **Stored** | `JobActivity` + mutation metadata envelope | Split audit paths (panel vs calendar) |
| Notification delivery records | **Stored** | Notification/outbox domain (separate from schedule lifecycle) | Notification success/failure treated as schedule truth |
| Schedule attention/warnings | **Derived** | Shared scheduling derivation helpers (Calendar + Workstation) | Editable warning rows competing with canonical timing truth |
| Legacy job visit | **Stored (deprecated)** | `JobVisit` — bridge only during cutover | Adding permanent behavior to visit model |
| Legacy task schedule fields | **Stored (deprecated)** | `JobTask.scheduledStartAt/scheduledEndAt` | New writes after canonical cutover |

**Current code (pre-migration):** `task-timing.ts`, `schedule-query.ts`, `workstation-scheduling-attention.ts`, `job-visit-actions.ts` — refactor into targets above during implementation slices.

## Workstation & attention

| Concept | Stored or derived? | Canonical location | Risk if duplicated |
|---------|-------------------|-------------------|-------------------|
| Work queue items | **Derived** | `queryWorkstationWorkItems()` in `workstation-query.ts` | Second priority engine with different ordering |
| Lane / rank | **Derived** | `apps/web/src/lib/workstation/rank.ts` | Inconsistent critical vs due vs watch |
| Embedded lead/quote workflow | **Derived** | `record-workflow-surface.ts` + readiness/progress helpers | Duplicate next-action copy in Workstation only |
| Job blocked (issues + payments) | **Derived** | `workstation-query.ts` (job loop) | Task items ignoring job-level payment block |

## Commercial pipeline

| Concept | Stored or derived? | Canonical location | Risk if duplicated |
|---------|-------------------|-------------------|-------------------|
| Lead lifecycle status | **Stored** | `Lead.status` | Confusing manual status with commercial progress |
| Lead intake / public submit | **Stored** (+ derived readiness) | `ingestLead()` in `ingest-lead.ts`; canon in [lead-intake-canon.md](./canon/lead-intake-canon.md) | Parallel intake paths or AI/notes as truth |
| Lead commercial progress | **Derived** | `getLeadCommercialProgress()` in `lead-commercial-progress.ts` | Persisting progress enum on Lead |
| Lead intake projection (AI-ready DTO) | **Derived** | `buildLeadIntakeProjection()` in `lead-intake-projection.ts` | Duplicating readiness/progress in prompt strings |
| Lead→Quote handoff | **Stored writes via canonical promotion** | `promoteLeadToQuote()` in `promote-to-quote.ts` | `createQuoteDraft` bypass for lead-origin flows |
| Quote readiness | **Derived** | `getQuoteReadiness()` in `quote-readiness.ts` | Ad-hoc quote state in components |
| Quote activation readiness | **Derived** | `evaluateQuoteJobActivationReadiness()` | One-off checks in activation action |
| Quote totals | **Stored** | `Quote.totalCents`, line items | Different totals in UI vs PDF vs checkpoint |
| Approved commercial baseline | **Stored proof** | `QuoteCheckpoint` — see [quote-truth-and-checkpoints.md](./canon/quote-truth-and-checkpoints.md) | “Version browser” UX or silent sold-truth mutation |

## Jobs, issues, recovery

| Concept | Stored or derived? | Canonical location | Risk if duplicated |
|---------|-------------------|-------------------|-------------------|
| Job runtime status | **Stored** | `Job.status` | — |
| Job materialization | **Stored copy at activation** | `quote-job-activation-actions.ts` | Post-activation quote edits mutating job rows |
| Issue open/resolved | **Stored** | `JobIssue.status`, `severity` | Issues that do not block when they should |
| Recovery flow status | **Stored** | `JobRecoveryFlow.status` | Resolving issue while recovery incomplete |
| Recovery progress | **Derived** | Recovery `JobTask` completion; enforced in `resolve-job-issue-core.ts` | Generic resolve hiding incomplete recovery |
| Issue resolve (standard / resume / force) | **Stored writes + activity** | `resolveJobIssueWithRecoveryHandling()` | Force-resolve without audit trail |

## Addresses, activity, logs

| Concept | Stored or derived? | Canonical location | Risk if duplicated |
|---------|-------------------|-------------------|-------------------|
| Customer / service location | **Stored** | `Customer`, `ServiceLocation` | — |
| Lead intake address | **Stored** | `Lead.address` JSON | — |
| Jobsite display line | **Derived** | `resolveJobsiteLineForQuoteOrJob()` in `jobsite-address.ts` | Hardcoded formatting in UI |
| Job activity | **Stored** | `JobActivity` via `recordJobActivity()` | Duplicate or missing audit events |
| Daily log draft text | **Derived** | `generateDailyJobLogDraft()` from activities | AI overwriting without review |
| Daily log review status | **Stored** | `DailyJobLog.status` | Confusing draft with reviewed log |

## Library, tags, AI

| Concept | Stored or derived? | Canonical location | Risk if duplicated |
|---------|-------------------|-------------------|-------------------|
| Tag usage counts | **Derived** | Prisma `_count` on relations — **not** `Tag.usageCount*` fields | Writing deprecated cached columns |
| AI library proposal | **Ephemeral until apply** | `ai-service.ts` + `applyLineItemTemplateAIProposalAction` + review panel | Silent AI → DB writes |
| AI recovery proposal | **Ephemeral until apply** | `recovery-flow-builder.tsx` + `recovery-actions.ts` | Auto-created recovery tasks without review |

## UI theme

| Concept | Stored or derived? | Canonical location | Risk if duplicated |
|---------|-------------------|-------------------|-------------------|
| Semantic colors / surfaces | **Stored CSS vars** | `apps/web/src/app/globals.css` | Raw `zinc-*` / `gray-*` breaking dark mode (I23) |

## Related canon

- [scheduling-canon.md](./canon/scheduling-canon.md) — Deadlines, job schedule events, derivation
- [signals.md](./canon/signals.md) — Signal bus and readiness engine
- [workstation-canon.md](./canon/workstation-canon.md) — Cockpit role
- [invariants-and-decision-rules.md](./canon/invariants-and-decision-rules.md) — I2, I6, I8, I9, I10, I16

---

*Created 2026-05-16 — Guardrails v1 Pass 1.*  
*Updated 2026-06-11 — Scheduling SoT boundaries aligned to revised canon lock (work group, event outcome, derived attention rules, legacy bridge posture).*
