# Task, payment, and recovery guardrails

> **Canon:** [signals.md](./canon/signals.md) · [I8 Flexibility via Signals](./canon/invariants-and-decision-rules.md) · [I9 Payment schedule as signal provider](./canon/invariants-and-decision-rules.md) · [I16 Construction issues](./canon/invariants-and-decision-rules.md)

## Task readiness

### Canonical module

`apps/web/src/lib/task-readiness.ts`

| Export | Use |
|--------|-----|
| `toTaskReadinessInput()` | Map Prisma/UI task shape → readiness input |
| `deriveTaskState()` | **Single** derived state: `COMPLETED`, `BLOCKED_BY_ISSUE`, `BLOCKED_BY_SIGNAL`, `NEEDS_PROOF`, `READY` |
| `deriveStageState()` | Stage-level derived state (use when surfacing stage attention) |
| `taskStateLabel()` / `taskStateTone()` | Display labels—do not re-stringify states ad hoc |

### Recovery bypass

When a task belongs to a recovery flow fixing a specific issue, pass `recoveryFlowIssueId` in options so that issue does not block the recovery task:

```typescript
deriveTaskState(input, liveSignals, {
  recoveryFlowIssueId: task.recoveryFlow?.jobIssueId,
});
```

### Server completion gate

`completeJobTaskAction` in `job-task-actions.ts` must stay aligned with `deriveTaskState` plus proof validation. Do not add alternate “mark done” paths that skip readiness.

### Anti-patterns

- Checking `JobTaskStatus.TODO` alone for “actionable” or “blocked”
- Duplicating issue/signal/proof logic in a new component without calling `deriveTaskState`
- Storing derived readiness on `JobTask` columns

### Current call sites (extend, do not bypass)

- `task-work-surface.tsx`, `job-task-card.tsx`
- `workstation-query.ts`
- `job-task-actions.ts`

---

## Payments

### Canonical module

`apps/web/src/lib/job-payment-readiness.ts`

| Export | Use |
|--------|-----|
| `isPaymentEffectivelyDue()` | Whether a requirement should be treated as due (anchors, FINAL_BALANCE rules) |
| `getUnsettledEffectivelyDueRequirements()` | Filter job requirements for attention/blocking |
| `buildPaymentDueContextFromJob()` | Build once per job, reuse across requirements |
| `deriveTaskPaymentHold()` | At most one hold for task UI display |
| `promotePendingPaymentsToDue()` | Idempotent PENDING → DUE when gates met |
| `CORRECTIONS_STAGE_NAME` | Shared constant for recovery stage exclusion in payment context |

### Stored vs derived

- **Stored:** `JobPaymentRequirement.status` (`PENDING`, `DUE`, `PAID`, `WAIVED`, `CANCELED`) — audit/workflow fact
- **Derived:** Effective due-ness — **never** equate `PENDING` with “not due” or `DUE` with “due” without `isPaymentEffectivelyDue` when gating attention or holds

### Anti-patterns

- Client filters like `r.status === "DUE" || r.status === "PENDING"` for operational blocking (display partitioning may use status with server-provided `effectivelyDueRequirementIds`)
- New `paymentBlockers` column or per-task stored payment flags
- Duplicate payment cards on Workstation with **different rules** than the job page — embed `JobPaymentManager` with `variant="embedded"` instead; job page remains the full staff surface for browse-at-length

### Payment actions

`apps/web/src/app/(workspace)/jobs/job-payment-actions.ts` — record paid/waived, publish signal, `recordJobActivity`. Extend here; do not scatter payment writes.

### Signal naming

Paid/waived actions publish `"payment-cleared"`. Task `requiresSignals` may use more specific names (e.g. `payment:deposit:cleared`). **Do not add a third convention** without updating canon and signal docs.

---

## Issues and recovery

### Canonical module

`apps/web/src/lib/resolve-job-issue-core.ts`

| Export | Use |
|--------|-----|
| `recoveryFlowHasIncompleteTasks()` | Derived recovery completeness |
| `assertCanResolveIssue()` | Pre-flight by mode |
| `resolveJobIssueWithRecoveryHandling()` | **Single** resolve path with activity |

### Resolve modes

| Mode | Behavior |
|------|----------|
| `standard` | Block if open recovery flow has incomplete tasks |
| `resume` | Require all recovery tasks DONE; complete recovery flow |
| `force` | Resolve issue, cancel open recovery flow — **audited** in activity metadata |

### Server actions

- `resolveJobIssueAction` → `standard`
- `resolveIssueAndResumeAction` → `resume` (in `recovery-actions.ts`)
- `forceResolveJobIssueAction` → `force`

**Do not** resolve issues in a new action without calling `resolveJobIssueWithRecoveryHandling`.

### Recovery tasks

Recovery work is normal `JobTask` rows linked via `recoveryFlowId`. Created through `recovery-actions.ts`; AI suggestions in `recovery-flow-builder.tsx` are **review-then-apply**.

### Corrections stage

The string `"Corrections"` is used for recovery staging. Import `CORRECTIONS_STAGE_NAME` from `job-payment-readiness.ts` when touching payment or stage logic—do not duplicate the literal in new files.

### Canonical mitigation model (BLOCKS_WORK)

For `BLOCKS_WORK` issues, mitigation is **RecoveryFlow-only**:

- Create and activate the recovery flow **atomically** on submit
- Execute recovery tasks (`JobTask` rows with `recoveryFlowId`)
- Resume or force-resolve via canonical issue resolution actions

`createFollowUpTaskFromIssueAction` is deprecated and must not be used for blocker mitigation.

Do not add a second user-facing path for fixing blocking issues without canon review. Recovery progress UI should stay consistent with `recoveryFlowHasIncompleteTasks` semantics.

---

## Tests (existing)

| File | Covers |
|------|--------|
| `task-readiness.test.ts` | `deriveTaskState`, recovery bypass, stage state |
| `job-payment-readiness.test.ts` | Anchor types, effective due, FINAL_BALANCE |

Add tests here when changing helper behavior—not only in components.

---

## Related docs

- [source-of-truth-map.md](./source-of-truth-map.md)
- [workstation-guardrails.md](./workstation-guardrails.md)
- [architecture-guardrails.md](./architecture-guardrails.md)

---

*Created 2026-05-16 — Guardrails v1 Pass 1.*
