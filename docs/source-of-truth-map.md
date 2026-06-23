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
| Task completion / cancellation | **Stored** | `JobTask.status`, `completedAt`, `completedByUserId`, `completionNote`, `completionRequirementsJson`, cancellation audit fields | Terminal transitions without audit lineage |
| Stage readiness | **Derived** (helper exists; limited UI use) | `deriveStageState()` in `task-readiness.ts` | Wrong stage-level attention |
| Stage execution state (`OPEN` / `COMPLETED` / `SKIPPED`) | **Derived** | `job-payment-readiness.ts` payment progression helpers | Deadlocked progression or false stage-anchor payment triggering |
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

> **Canon:** [scheduling-canon.md](./canon/scheduling-canon.md) · [sales-site-visit-canon.md](./canon/sales-site-visit-canon.md) · **Plan:** [scheduling-implementation-plan.md](./plans/scheduling-implementation-plan.md)

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
| Lead estimate / sales site visit | **Stored** | `LeadVisitRequest`; canon in [sales-site-visit-canon.md](./canon/sales-site-visit-canon.md) | Conflating with job execution events, `JobVisit`, or quote workflow state |
| Sales visit customer confirmation | **Stored** | Future `LeadVisitRequest` confirmation fields/token records + `LeadEvent` audit | Treating scheduled as customer-confirmed or notification delivery as lifecycle truth |
| Sales visit access snapshot | **Stored** | Future visit-specific access snapshot on/adjacent to `LeadVisitRequest` | Losing what was known for the appointment, or leaking sensitive access details |
| Sales visit outcome / next action | **Stored facts + derived attention** | Future required outcome on `LeadVisitRequest`; Workstation/Sales derived from outcome + quote/follow-up facts | Completed visits falling through to quote-ready or disappearing with no next action |
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

## Authentication & authorization

> **Staff authorization canon:** [execution-aware-authorization-canon.md](./canon/execution-aware-authorization-canon.md)

| Concept | Stored or derived? | Canonical location | Risk if duplicated |
|---------|-------------------|-------------------|-------------------|
| Actor context (`userId`, `organizationId`, `role`) | **Derived at request time** | `apps/web/src/lib/auth-context.ts` | JWT stale-role leaks or wrong-tenant reads |
| Role capability map | **Derived from role enum** | `apps/web/src/lib/authz/capabilities.ts` | Conflicting permission behavior across routes/actions |
| Runtime staff action authorization | **Derived at request time** | `apps/web/src/lib/authz/staff-actions.ts` — `authorizeStaffAction()`, `STAFF_ACTIONS` | Scattered role checks; FIELD/SUB over-mutation |
| Resource visibility predicate (job/task) | **Derived** | `apps/web/src/lib/authz/resource-access.ts` + query builders | Field/sub overexposure on list/count/search |
| Payment read visibility | **Derived from role** | `apps/web/src/lib/authz/payment-visibility.ts` — `canReadPaymentDetails()` | Dollar amounts / portal links leaking to FIELD/SUB |
| Customer portal staff read/manage gates | **Derived from role** | `apps/web/src/lib/customer-portal/authorize.ts` | Portal access metadata leaking to FIELD/SUB |
| Quote execution plan permissions | **Derived from role** | `apps/web/src/lib/execution-plan-permissions.ts` | Runtime job auth confused with quote planning auth |
| Public token access scope | **Stored token metadata + derived checks** | `/q/[token]`, `/co/[token]` actions and token helpers | Raw bearer token misuse and replay scope drift |
| Security audit stream | **Stored** | Dedicated security audit events (planned), not `JobActivity` | Lost accountability for role/invite/session/token actions |
| Platform operator context | **Derived at request time** | `apps/web/src/lib/platform/platform-context.ts` (`getPlatformContext()`) | Platform authority leaking through contractor session or JWT role claims |
| Platform access grant (current state) | **Stored** | `PlatformAccess` in `apps/web/prisma/schema.prisma` | Accidental auto-grants via seed or membership coupling |
| Platform audit stream | **Stored (append-only)** | `PlatformAuditEvent` + `apps/web/src/lib/platform/platform-audit.ts` | Mutable audit rows or secret metadata leakage |

## Customer Project Portal

> **Canon:** [customer-project-portal-canon.md](./canon/customer-project-portal-canon.md). Customer portal auth/access is separate from staff `User`/`Membership`; do not add `Membership(role: CUSTOMER)`.

| Concept | Stored or derived? | Canonical location | Risk if duplicated |
|---------|-------------------|-------------------|-------------------|
| Customer contact role | **Stored** | `CustomerContact` + `apps/web/src/lib/customer-portal/access-service.ts` | Treating a phone/email as both relationship context and verified auth identity |
| Customer portal identity | **Stored** | `CustomerPortalIdentity` + `access-service.ts` / `token-service.ts` | Reusing staff `User` for external customers or collapsing identity into a single customer record |
| Customer portal access grant | **Stored** | `CustomerPortalAccess` + `access-service.ts` | Customer sees another customer's job, revoked access still works, or access leaks across orgs/jobs |
| Customer portal session | **Stored token hash + derived validation** | `CustomerPortalSession` + `session-service.ts` / `requireCustomerPortalAccess()` in `authorize.ts` | Staff and customer sessions getting mixed, stale sessions surviving revocation |
| Customer portal magic-link token | **Stored token hash + consumed/expired facts** | `CustomerPortalMagicLinkToken` + `token-service.ts`; quote/CO share tokens remain on existing models | Reusable bearer links, inconsistent token hashing, quote/CO/portal token drift |
| Customer-visible resource | **Stored visibility grant** | `CustomerVisibleResource` + `visible-resource-service.ts` | Internal documents/photos/schedule details exposed because UI serialized a raw object |
| Customer request | **Stored request workflow fact** | `CustomerRequest` + `request-service.ts` | Customer messages becoming unstructured chat or directly mutating job/schedule truth |
| Customer portal event | **Stored append-only audit** | `CustomerPortalEvent` + `event-service.ts` | Missing accountability for link use, upload, acceptance, revoke, and portal access events |
| Staff portal audit timeline | **Derived projection (internal)** | `listPortalAuditEventsForJob()` + `portalAuditEventLabel()` in `event-service.ts` | Customer-safe filter hiding staff delivery/revoke events from job panel |
| Customer project status | **Derived** | `presenter.ts` — `getCustomerProjectStatus()` | Stored customer-facing status drifting from real job/commercial/payment state |
| Customer next action | **Derived** | `presenter.ts` — `getCustomerNextAction()` | Portal fails its main job or shows different next actions in cards vs header |
| Customer payment portal URL | **Stored** | `JobPaymentRequirement.paymentUrl` / `paymentUrlLabel` + `job-payment-actions.ts` | Duplicate payment link truth in `CustomerVisibleResource` or derived-only URLs with no staff entry point |
| Commercial link mint from portal | **Stored token rotation at click** | `commercial-navigation-service.ts` | Raw share tokens in SSR DTOs or unhashed tokens in `QuoteShareToken` |
| Portal notification delivery | **Stored on event metadata** | `notification-service.ts` — Resend send + `MAGIC_LINK_SENT` metadata (`deliveryStatus`, `providerMessageId`) | Copy-paste-only invites or emails with no audit lineage |
| Customer-safe activity feed | **Derived projection** | `event-service.ts` + `presenter.ts` | Internal task failures, cost notes, AI reasoning, or staff comments leaking into customer history |
| Portal routes | **UI shell** | `/portal/[token]`, `/portal/verify`, `/portal/project/[accessId]`; staff panel on job page | Staff chrome leaking into customer hub or parallel portal auth in components |

## Commercial pipeline

| Concept | Stored or derived? | Canonical location | Risk if duplicated |
|---------|-------------------|-------------------|-------------------|
| Lead lifecycle status | **Stored** | `Lead.status` | Confusing manual status with commercial progress |
| Lead intake / public submit | **Stored** (+ derived readiness) | `ingestLead()` in `ingest-lead.ts`; canon in [lead-intake-canon.md](./canon/lead-intake-canon.md) | Parallel intake paths or AI/notes as truth |
| Opportunity flow condition (phase + condition code + next action + age) | **Derived** | `getOpportunityFlow()` in `opportunity-flow.ts` | Status soup, list/workstation mismatch, branching on display copy |
| Sales board lane (column placement) | **Derived** | `getSalesBoardLaneForCondition()` in `opportunity-board.ts` — maps `conditionCode` to actionable lane; phase is card context only | Broad phase columns (`Discovery`) hiding actionable state; drag-to-advance UI |
| Sales list/board row DTO | **Derived** | `serializeLeadListRow()` in `serialize-lead-list-row.ts` | Duplicate next-action copy or parallel progress enums in components |
| Lead commercial progress | **Derived (legacy)** | `getLeadCommercialProgress()` in `lead-commercial-progress.ts` — superseded by `getOpportunityFlow()` for new Sales surfaces | Persisting progress enum on Lead |
| Lead intake projection (AI-ready DTO) | **Derived** | `buildLeadIntakeProjection()` in `lead-intake-projection.ts` | Duplicating readiness/progress in prompt strings |
| Lead→Quote handoff | **Stored writes via canonical promotion** | `promoteLeadToQuote()` in `promote-to-quote.ts` | `createQuoteDraft` bypass for lead-origin flows |
| Sales site visit display state | **Derived** | `getOpportunityFlow()`, Sales list/board serializers, `schedule-query.ts`, `workstation-query.ts` reading `LeadVisitRequest` | Duplicated appointment/status state on `Lead`, `Quote`, calendar DTOs, or Workstation cards |
| Quote readiness | **Derived** | `getQuoteReadiness()` in `quote-readiness.ts` | Ad-hoc quote state in components |
| Quote activation readiness | **Derived** | `evaluateQuoteJobActivationReadiness()` (accepted plan + hash/version + coverage + blockers) | One-off checks in activation action |
| Quote plan proposal dependency apply guard | **Derived** | `validateQuotePlanProposalForApply()` in `quote-plan/quote-plan-validation.ts` (tasks-first: hard orphans block, soft orphans become review gaps) | Save-time deadlocks that block valid plans |
| Quote plan staleness (`isStale`) | **Derived** | `currentPlanningInputHash !== QuoteExecutionPlan.planningInputHash` | Stored stale status drift |
| Quote execution plan acceptance | **Stored** | `QuoteExecutionPlan.status`, `acceptedAt`, `planningInputHash` | UI-only acceptance without stamped hash |
| Pre-plan line draft tasks | **Stored (authoring seed)** | `QuoteLineExecutionTask` — not activation truth once whole-quote plan exists | Treating per-line drafts as reviewed activation plan |
| Quote totals | **Stored** | `Quote.totalCents`, line items | Different totals in UI vs PDF vs checkpoint |
| Approved commercial baseline | **Stored proof** | `QuoteCheckpoint` — see [quote-truth-and-checkpoints.md](./canon/quote-truth-and-checkpoints.md) | “Version browser” UX or silent sold-truth mutation |
| Quote signature request (Standard Acceptance / Verified E-Sign) | **Stored** | `QuoteSignatureRequest`, `QuoteSignatureRecipient`, `QuoteSignatureDelivery`, `QuoteSignatureEvent`, `QuoteSignatureArtifact` in `apps/web/src/lib/quote-signature/` | Duplicate send/accept audit or live-quote signer pages |
| Signature request status / timeline labels | **Derived** | `timeline-presenter.ts`, `status-service.ts` in `quote-signature/` | Second signature status engine in UI |
| Frozen sent quote snapshot + PDF hash | **Stored** | `QuoteSignatureRequest.frozenSnapshotJson`, `frozenSnapshotSha256`, sent artifact rows | Rendering signer page from live mutable quote rows |
| Customer revision/change request intent | **Stored** | `QuoteChangeRequest` | Notes-only customer-change handling and missing revision loop context |

## Jobs, issues, recovery

| Concept | Stored or derived? | Canonical location | Risk if duplicated |
|---------|-------------------|-------------------|-------------------|
| Job runtime status | **Stored** | `Job.status` | — |
| Job materialization | **Stored copy at activation** | `quote-job-activation-actions.ts` | Post-activation quote edits mutating job rows |
| Issue open/resolved | **Stored** | `JobIssue.status`, `severity` | Issues that do not block when they should |
| Recovery flow status | **Stored** | `JobRecoveryFlow.status` | Resolving issue while recovery incomplete |
| Recovery progress | **Derived** | Recovery `JobTask` completion; enforced in `resolve-job-issue-core.ts` | Generic resolve hiding incomplete recovery |
| Issue resolve (standard / resume / force) | **Stored writes + activity** | `resolveJobIssueWithRecoveryHandling()` | Force-resolve without audit trail |
| Non-blocking issue coordination | **Stored work, not blocker truth** | Ordinary `JobTask` / activity where product allows; not `BLOCKS_WORK` remediation | Random follow-up tasks bypassing blockers, resolving issues, or replacing recovery/resume semantics |

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
| Whole-quote execution proposal | **Ephemeral until apply** | Whole-quote planner generate/apply boundary with generated-against hash | Applying stale proposals over newer planning inputs |

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
*Updated 2026-06-24 — Execution-aware authorization SoT: staff-actions, payment-visibility, portal authorize helpers; retired staff-authz / requireMutableSession references.*
*Updated 2026-06-14 — Added platform operator context, `PlatformAccess`, and append-only `PlatformAuditEvent` SoT rows.*
*Updated 2026-06-19 — Added issue coordination boundary: `BLOCKS_WORK` remediation remains `JobIssue` + `JobRecoveryFlow` + recovery `JobTask` rows; ordinary tasks may coordinate but cannot clear blockers or replace recovery/resume semantics.*  
*Updated 2026-06-20 — Added quote execution plan acceptance + pre-plan line draft boundary rows for Execution Review cleanup.*  
*Updated 2026-06-20 — Added whole-quote proposal dependency guard row clarifying tasks-first apply policy and hard-vs-soft orphan handling.*
