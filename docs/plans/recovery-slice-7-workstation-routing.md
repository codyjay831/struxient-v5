# Recovery Slice 7 — Workstation routing plan

> **Track:** Recovery / issue discoverability ( **not** main-roadmap **payment Slice 7** )  
> **Mode:** Execution plan — Tier B (Workstation UX + query metadata; no schema, no new execution rules)  
> **Status:** Not started (2026-05-25) — **reviewed**, ready for PR1  
> **Depends on:** Slices 1–2 (recovery core), Slice 3 (hold vs issue) — **shipped**  
> **Canon:** [workstation-canon.md](../canon/workstation-canon.md) § Events, [product-philosophy.md](../canon/product-philosophy.md), [issue-recovery-canon.md](../canon/issue-recovery-canon.md)

---

## Problem (repo evidence)

Recovery **works on the job page**, but **Workstation does not route users to the next recovery action**.

| Gap | Evidence |
|-----|----------|
| Issue queue items have no in-panel work surface | `workstation/page.tsx` renders panel for `task` \| `job` \| `lead` \| `quote` only — **not** `investigate` |
| Issue `nextStep` names recovery step but doesn’t link | `workstation-query.ts` sets e.g. `Recovery Step 2/5: …` but `recordId` is always **issue id**, not the recovery task |
| Health already knows the target; WS ignores it | `job-execution-health.ts` exposes `recommendedNextAction.targetId` + `nextActionableRecoveryTaskId`; query copies **label only** |
| Blocked **task** cards say “Resolve blocker” | Selecting task opens `TaskWorkSurface` on the **blocked** task — not the active recovery task or issue planner |
| Issue items `href` dumps to job root | `href: /jobs/${issue.jobId}` — user must hunt Issues panel |

**User pain (flow keeper):** After something breaks, the owner asks *“what do I do in the app?”* Workstation already **surfaces** issues in Critical lane but stops at **metadata** — violates workstation canon § Events (“detours legible”, “return point visible”).

---

## Goal

From Workstation, one click on a blocking issue or blocked task opens the **correct next physical action**:

1. **No recovery plan yet** → issue recovery planner (AI suggest + activate)  
2. **Active recovery, step N pending** → that **recovery `JobTask`** in `TaskWorkSurface`  
3. **All recovery tasks done, issue still open** → **Resume original path** affordance  
4. **Blocked main-path task** → route to plan or active recovery step — **not** the blocked task surface (Option A, locked)

**Non-goals (Slice 7):**

- Schema changes  
- New resolve/recovery server rules (use existing actions)  
- Payment hard-blocking (main roadmap Slice 7)  
- Slices 4 / 5 / 6 (inspection shortcut, proposal DB, static hints)  
- Workstation ranking redesign (Slice 5B pruning)  
- Replacing `/jobs/[jobId]` issue manager — complement it  
- A second routing engine parallel to `deriveJobExecutionHealth`

---

## Design: action routing model

Wire Workstation to **existing execution-health actions** via a thin **adapter** — do not re-derive recovery rules in a greenfield helper.

### Source of truth (already shipped)

[`job-execution-health.ts`](../apps/web/src/lib/job-execution-health.ts) already computes:

```typescript
recommendedNextAction: {
  type: "complete_task" | "resolve_issue" | "resume_path" | "activate_recovery" | "review_health" | ...
  label: string;
  targetId?: string;
}
nextActionableRecoveryTaskId: string | null;
```

### Adapter: `workstation-recovery-routing.ts` (new)

**Not** a parallel rules engine. Responsibilities:

1. **`mapHealthActionToWorkstationRoute(recommendedNextAction)`** — health → panel route  
2. **`deriveIssueRecoveryRoute(issue)`** — for issue-queue items when health is not in scope; **must use same predicates** as [`recovery-issue-ui-flow.ts`](../apps/web/src/lib/recovery-issue-ui-flow.ts) (and stay aligned with health outcomes)  
3. **`pickBlockingIssueForTask(task, stageIssues)`** — tie-break for multiple open `BLOCKS_WORK` issues  

| Health `type` | WS `actionKind` | Panel |
|---------------|-----------------|-------|
| `activate_recovery` | `plan-recovery` | `RecoveryFlowBuilder` |
| `complete_task` (+ recovery `targetId`) | `do-recovery-task` | `TaskWorkSurface` |
| `resume_path` | `resume-original-path` | Resume affordance |
| `resolve_issue` | `plan-recovery` or blocked recovery sub-step | Planner or issue context |

### WS `actionKind` (panel contract)

| `actionKind` | When | Panel opens |
|--------------|------|-------------|
| `plan-recovery` | No usable ACTIVE flow; CANCELLED flow; DRAFT only; no flow yet | Issue recovery panel → `RecoveryFlowBuilder` |
| `do-recovery-task` | ACTIVE flow, next TODO recovery task by `recoveryFlowOrder` | `TaskWorkSurface` for **that** task id |
| `resume-original-path` | All recovery tasks DONE, issue still OPEN | Issue summary + `resolveIssueAndResumeAction` |

**Removed:** `view-blocked-task` — folded into Option A (blocked main-path selection opens plan or `do-recovery-task`, never the blocked main task surface).

### Fields on `WorkstationWorkItem` (Slice **7A**)

```typescript
actionTaskId?: string;        // JobTask to open when actionKind === 'do-recovery-task'
actionIssueId?: string;       // JobIssue for recovery/resume/plan
actionKind?: WorkstationRecoveryActionKind;
actionLabel?: string;         // Primary CTA copy — prefer health/issue route label
```

**Rules:**

- `queryWorkstationWorkItems` remains the **single emission point**.  
- **Do not** change `selectedId` / work item `id` to task ids — keep `issue-{id}` / `task-{id}`. Pass `actionTaskId` into panel resolution only.  
- **`kind: investigate` is overloaded** — only route through recovery panel when `filterCategory === "issues"` (or `job-health-*` with recovery-related health action). **Never** route payment or daily-log investigate items through `IssueRecoveryPanel`.

---

## Routing matrix (locked)

| User clicks | State | Panel |
|-------------|-------|--------|
| Issue item | No flow | `plan-recovery` |
| Issue item | ACTIVE recovery | `do-recovery-task` (next TODO) |
| Issue item | All recovery DONE, issue OPEN | `resume-original-path` |
| Issue item | CANCELLED flow, issue OPEN | `plan-recovery` or job issue resolve path |
| Main task item | `BLOCKED_BY_ISSUE`, no flow | **Option A:** `plan-recovery` (issue panel) |
| Main task item | `BLOCKED_BY_ISSUE`, ACTIVE recovery | **Option A:** `do-recovery-task` |
| Job-health item | Health `complete_task` / `resume_path` / `activate_recovery` | Same as above via adapter + `targetId` |
| Recovery task item | READY | Normal `TaskWorkSurface` (unchanged) |

**Option A (locked):** Server-side panel content swap on task selection — no client URL hack, no banner-only fallback.

**Blocking issue tie-break:** task-scoped issue → stage-scoped issue → oldest `createdAt`.

---

## Slice 7A — Data wiring (query + types)

**Scope:** Metadata only; no new panel yet (safe to ship alone).

### Tasks

1. Add `workstation-recovery-routing.ts` (**adapter**, not greenfield rules — see above).
2. Extend `WorkstationWorkItem` in `workstation-query.ts`.
3. **Issue items** (`kind: "investigate"`, `filterCategory: "issues"`): set `action*` fields from `deriveIssueRecoveryRoute`.
4. **Job-health items** (`id: job-health-*`): map `executionHealth.recommendedNextAction` via adapter; set `actionTaskId` / `actionIssueId` from `targetId`.
5. **Task items** with `derivedState === BLOCKED_BY_ISSUE`: set `actionIssueId`, `actionKind`, `actionLabel` from blocking issue + flow state (Option A semantics).
6. **7C minimal (PR3):** When an issue has ACTIVE recovery, avoid **two Critical cards** for the same work — suppress duplicate recovery task row **or** demote issue card to watch; one primary “what’s next” per job.

### Tests (required)

- `workstation-recovery-routing.test.ts`:
  - Health type → actionKind mapping (`complete_task`, `resume_path`, `activate_recovery`)
  - No flow → `plan-recovery`
  - ACTIVE flow, 1 of 3 done → `do-recovery-task` with correct task id
  - All done, issue open → `resume-original-path`
  - CANCELLED flow → `plan-recovery`
  - Multi-issue tie-break on task
- **One** workstation-query fixture test: issue + ACTIVE flow → emitted item has correct `actionTaskId`

### Acceptance (7A)

- [ ] Issue + job-health items expose correct `actionKind` + ids.  
- [ ] Blocked task items use concrete `nextStep` / `actionLabel`, not “Resolve blocker.”  
- [ ] Adapter stays aligned with `deriveJobExecutionHealth` — no divergent copy in QA.  
- [ ] No duplicate routing logic outside adapter + query emission.

---

## Slice 7B — Panel routing (UX)

**Scope:** Workstation selection opens the right surface.

### URL contract

Prefer **work item fields** on server (`selectedItem.actionKind`, `actionTaskId`). Keep existing `selectedId` + `selectedKind`. **`step` param optional** — document in `url-state.ts` only if needed; do not require it for v1.

### Panel architecture

**Split server + client** (do not put interactive buttons in server-only wrapper):

- **`IssueRecoveryDetailLoader`** (server) — loads issue + flow + org scope  
- **`IssueRecoveryPanel`** (client) — `RecoveryFlowBuilder`, resume/`useTransition`, `router.refresh()`  

Same pattern as [`job-issue-manager.tsx`](../../apps/web/src/components/jobs/job-issue-manager.tsx).

```tsx
{selectedItem.kind === "investigate" && selectedItem.filterCategory === "issues" && (
  <IssueRecoveryDetailLoader
    issueId={selectedItem.actionIssueId ?? selectedItem.recordId}
    actionKind={selectedItem.actionKind}
    actionTaskId={selectedItem.actionTaskId}
  />
)}
{selectedItem.kind === "task" && selectedItem.actionKind === "do-recovery-task" && selectedItem.actionTaskId && (
  <TaskDetailWrapper taskId={selectedItem.actionTaskId} />
)}
{selectedItem.kind === "task" && selectedItem.actionKind === "plan-recovery" && selectedItem.actionIssueId && (
  <IssueRecoveryDetailLoader issueId={selectedItem.actionIssueId} actionKind="plan-recovery" />
)}
```

**Job-health investigate items:** same loader when adapter yields recovery route + `targetId`.

### Workstation cards + panel footer

- Card primary CTA uses `actionLabel`.  
- In-panel work surface is primary; footer “Open full record” remains secondary link to `/jobs/{id}#job-issues`.  
- Telemetry: `recovery_action_opened`, `recovery_resume_from_ws` in `workstation/telemetry.ts`.

### Feature flag

**Skip** env flag unless prod kill switch is required. Recovery actions already `revalidatePath('/workstation')`.

### Acceptance (7B)

- [ ] Issue in Critical lane → planner OR recovery task OR resume — never empty metadata-only panel.  
- [ ] Blocked main task when recovery active → recovery `TaskWorkSurface` (Option A).  
- [ ] Job-health card with recovery action → same routing.  
- [ ] Complete step → refresh → next step or resume.  
- [ ] Resume → issue leaves queue; main tasks unblock when signals allow.  
- [ ] `/workstation/tasks` lens parity.  
- [ ] Payment / daily-log investigate items unchanged.

---

## Implementation order (PR-sized)

| PR | Content | Risk |
|----|---------|------|
| **PR1** | 7A: adapter + tests + query fields (issues, blocked tasks) | Low |
| **PR2** | 7B: loader + client panel + issue branch on Today page + job-health `targetId` | Medium |
| **PR3** | Option A task routing + tasks lens + 7C dedupe + telemetry + guardrails doc | Medium |

**Do not merge PR2 without PR1.**

**Estimate:** PR1 ~0.5–1 day · PR2 ~1–1.5 days · PR3 ~1 day.

---

## Manual QA matrix (after 7B)

| # | Setup | Action | Expected |
|---|--------|--------|----------|
| 1 | Issue, no flow | Open issue from WS Critical | Recovery planner; AI suggest works |
| 2 | Activate 3-step recovery | Open issue from WS | Step 1 `TaskWorkSurface` |
| 3 | Complete step 1 | Re-open issue item | Step 2 task |
| 4 | Complete all steps | Open issue item | Resume original path |
| 5 | Resume | Issue gone; main task unblocked | |
| 6 | Blocked main task, no plan | Open **task** from WS | Issue planner (Option A) |
| 7 | Active recovery | Open **blocked main task** | Recovery task panel |
| 8 | Recovery task blocked by signal | Open issue / health card | Correct sub-step (not fake READY) |
| 9 | CANCELLED flow, open issue | Open issue | Plan or resolve — not “step 2” |
| 10 | Field hold (Slice 3) | EVENT blocked task | Unchanged — signal path only |
| 11 | `DOES_NOT_BLOCK` issue | — | Not in issue queue |
| 12 | ACTIVE recovery | Scan Critical lane | **One** primary card per job (7C) |

Align with [struxient-main-roadmap.md](../struxient-main-roadmap.md) Priority 2 QA.

---

## Files (expected touch list)

| File | Change |
|------|--------|
| `apps/web/src/lib/workstation-recovery-routing.ts` | **New** — adapter over health + issue routes |
| `apps/web/src/lib/workstation-recovery-routing.test.ts` | **New** |
| `apps/web/src/lib/workstation-query.ts` | Emit action fields; job-health `targetId`; 7C dedupe |
| `apps/web/src/lib/workstation/url-state.ts` | Document `step` (optional) |
| `apps/web/src/app/(workspace)/workstation/page.tsx` | Panel branches |
| `apps/web/src/app/(workspace)/workstation/tasks/page.tsx` | Parity |
| `apps/web/src/components/workstation/issue-recovery-detail-loader.tsx` | **New** — server loader |
| `apps/web/src/components/workstation/issue-recovery-panel.tsx` | **New** — client shell |
| `apps/web/src/components/workstation/workstation-ui.tsx` | `actionLabel` on cards |
| `apps/web/src/lib/workstation/telemetry.ts` | Recovery events |
| `docs/task-payment-recovery-guardrails.md` | WS recovery routing pointer |

**Reuse:** `RecoveryFlowBuilder`, `recovery-actions.ts`, `resolve-job-issue-core.ts`, `recovery-issue-ui-flow.ts`, `loadJobTaskExecutionPayload`, `deriveJobExecutionHealth`.

---

## Canon / philosophy alignment

- **Flow keeper:** WS answers “what do I do about this blocker?” in one click.  
- **Human gates preserved:** Planner and resume stay explicit.  
- **Single truth:** Routes from stored facts + existing health helper — no parallel queue state.

---

## Success metric

Complete **issue → plan → activate → do correction → resume** from Workstation without visiting `/jobs/[id]` unless user chooses “full job record.”

---

## Locked decisions (2026-05-25 review)

1. **Option A** for blocked main-path task selection — server panel swap.  
2. **Resume UI** matches `job-issue-manager` (no new UX).  
3. **7C minimal in PR3** — one primary card per active recovery in Critical lane.  
4. **Adapter over health** — no duplicate routing engine.  
5. **No feature flag** by default.  
6. **`investigate` routing** gated by `filterCategory` + recovery-related health actions only.

---

## Senior review (2026-05-25)

**Verdict: Approve with revisions incorporated above.**

### Strengths

- Problem statement matches code (`investigate` panel gap is real).  
- Scope discipline (Tier B, no schema, no Slices 4–6).  
- 7A → 7B sequencing and QA matrix are above average for slice docs.  
- Reuse list and success metric are testable.

### Critical fix applied

**Do not duplicate `deriveJobExecutionHealth` logic.** Health already exposes `recommendedNextAction.targetId` and recovery task ids; Slice 7 is mostly **Workstation wiring**. Plan updated to adapter pattern.

### Gaps addressed in this revision

| Gap | Resolution |
|-----|------------|
| `investigate` used for payments, logs, job-health | Gate recovery panel by `filterCategory` / health action type |
| Duplicate issue + recovery task cards | 7C minimal in PR3 |
| `view-blocked-task` vs Option A | Removed; matrix locked |
| CANCELLED flow, multi-issue, recovery blocked by signal | Added to QA + tie-break rules |
| Server/client boundary | Loader + client panel split |
| Changing `href` to task id | Explicitly forbidden |
| Feature flag | Dropped by default |
| job-health items ignore `targetId` | PR2 scope |

### Remaining follow-ups (post-Slice 7)

- `/workstation/jobs` and `/workstation/schedule` lens parity if they gain selection panels.  
- Long-term: extract shared route derivation used by **both** health and query (optional refactor).

---

*Plan created 2026-05-25 — Recovery Slice 7 Workstation routing (7A data + 7B panel).*  
*Plan revised 2026-05-25 — Senior review incorporated; adapter pattern, locked decisions, expanded QA.*
