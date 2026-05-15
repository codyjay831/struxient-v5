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
| Lead commercial progress | **Derived** | `getLeadCommercialProgress()` in `lead-commercial-progress.ts` | Persisting progress enum on Lead |
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

- [signals.md](./canon/signals.md) — Signal bus and readiness engine
- [workstation-canon.md](./canon/workstation-canon.md) — Cockpit role
- [invariants-and-decision-rules.md](./canon/invariants-and-decision-rules.md) — I2, I6, I8, I9, I10, I16

---

*Created 2026-05-16 — Guardrails v1 Pass 1.*
