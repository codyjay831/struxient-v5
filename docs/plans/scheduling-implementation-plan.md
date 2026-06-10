# Scheduling implementation plan

> **Purpose:** Executable engineering plan for Struxient scheduling MVP.  
> **Canon:** [scheduling-canon.md](../canon/scheduling-canon.md) (locked 2026-06-08).  
> **Posture:** Prelaunch fast path — clean cutover over long compatibility bridges.

---

## 1. Source-of-truth matrix

| Concept | Canonical entity / field | Stored or derived | Who may write | Primary consumers | Must never duplicate |
|---------|-------------------------|-------------------|---------------|-------------------|----------------------|
| Task execution state | `JobTask.status`, completion fields | Stored | Task actions (`completeJobTaskAction`, etc.) | Workstation, job page, readiness | Parallel readiness in UI |
| Resolved deadline | `JobTask.dueAt` + mode/provenance fields | Stored | Canonical deadline service only | Workstation overdue, schedule due overlay | Per-page overdue math |
| Due rule policy | Due rule metadata on task (mode, anchor, offset, resolvedAt, granularity) | Stored | Deadline service | Recalc UI, explainability | Hidden offset-only column without provenance |
| Scheduling requirement | `JobTask.schedulingRequirement` | Stored | Activation copy + explicit admin edit | Needs-scheduling derivation | Category/title inference |
| Job calendar commitment | `JobScheduleEvent` | Stored | Canonical event service only | Calendar, job page, workstation | `JobTask.scheduled*` after cutover |
| Task–event link | `JobScheduleEventTask` (join) | Stored | Link service | Needs-scheduling, job/task UI | Implicit “visit = job scheduled” |
| Event assignee | `JobScheduleEvent.leadUserId` | Stored | Event service | Conflicts, calendar, notifications | Task assignee as event SoT |
| Employee unavailability | `ScheduleBlock` | Stored | Availability actions | Conflict derivation (hard) | Job event entity |
| Lead estimate scheduling | `LeadVisitRequest` | Stored | Lead/schedule actions | Pre-job calendar lane | Job event entity |
| Task readiness | `deriveTaskState()` | Derived | N/A (computed) | Needs-scheduling gate | Duplicate blocking logic |
| Needs scheduling | `deriveTaskNeedsScheduling()` | Derived | N/A | Workstation, schedule tray | Category/job-no-visit heuristics |
| Overdue task | `deriveTaskOverdue()` | Derived | N/A | Workstation, tasks lens | Raw date compare in components |
| Event upcoming / in progress / potentially missed | `deriveEventTimingLabels()` | Derived | N/A | Calendar, workstation | Stored MISSED/IN_PROGRESS in MVP |
| Soft conflict | Overlap + tentative | Derived | N/A | Calendar warnings | — |
| Hard conflict | Overlap + confirmed + assignee | Derived | N/A | Calendar warnings, dispatch | — |
| Payment milestone timing | `JobPaymentRequirement` | Stored + derived due-ness | Payment actions | Payment holds | Workforce calendar |
| Job scheduling context | Job/customer notes + minimal structured windows | Stored (context) | Job/customer editors | Job page, event creation | Availability block entity |
| Schedule audit | `JobActivity` + mutation metadata | Stored | All canonical mutations | Job timeline | Wrong activity enum types |
| Customer notification intent | `NotificationEvent` | Stored | Notification dispatch after commit | Outbox | Lifecycle state field |

**Target canonical code locations (to create/refactor):**

| Helper / service | Intended path |
|------------------|---------------|
| Deadline mutations | `apps/web/src/lib/scheduling/deadline-service.ts` |
| Event lifecycle | `apps/web/src/lib/scheduling/event-service.ts` |
| Task–event links | `apps/web/src/lib/scheduling/event-link-service.ts` |
| Shared derivation | `apps/web/src/lib/scheduling/scheduling-derivation.ts` |
| Timezone / EOD | `apps/web/src/lib/scheduling/deadline-timezone.ts` |
| Schedule query | `apps/web/src/lib/scheduling/schedule-query.ts` (evolve from current) |

---

## 2. Lifecycle transition matrix — `JobScheduleEvent`

| From | To | Allowed | Actor | Side effects | Audit reason required |
|------|-----|---------|-------|--------------|----------------------|
| — | TENTATIVE | Yes | Authorized user / AI draft apply | May create links | Optional |
| TENTATIVE | CONFIRMED | Yes | Authorized user | Hard conflict check; may notify customer per policy | Recommended |
| TENTATIVE | CANCELED | Yes | Authorized user | Unlink satisfaction for REQUIRED tasks | Optional |
| CONFIRMED | COMPLETED | Yes | Authorized user | Does not auto-complete tasks | Optional |
| CONFIRMED | CANCELED | Yes | Authorized user | May spawn external follow-up tasks | **Required** |
| CONFIRMED | CONFIRMED | Yes (reschedule) | Authorized user | Update start/end/assignee; no status reopen | **Required** for material time change |
| TENTATIVE | TENTATIVE | Yes (reschedule) | Authorized user | Soft conflict check | Optional |
| COMPLETED | * | No (normal) | — | Use restricted correction workflow | **Required** |
| CANCELED | * | No | — | Create new event instead | — |
| COMPLETED | CONFIRMED | Restricted correction only | Admin/manager | Audited correction | **Required** |

**Invalid (must reject):**

- Reschedule that sets status back to SCHEDULED from COMPLETED/CANCELED without correction workflow
- Confirm without start/end
- End ≤ start

---

## 3. Lifecycle transition matrix — deadline mode

| From mode | Action | To mode | `dueAt` behavior | Audit |
|-----------|--------|---------|------------------|-------|
| NONE | Set manual date | MANUAL | Set to user value | Yes |
| NONE | Set derived rule | DERIVED | Resolve on first qualifying transition if already ready; else pending | Yes |
| MANUAL | Change date | MANUAL | Update | Yes |
| MANUAL | Clear deadline | NONE | Clear `dueAt` | Yes |
| MANUAL | Enable rule | DERIVED | Keep manual until explicit “recalculate” OR user chooses replace (audited) | Yes |
| DERIVED | First ready (or activation anchor) | DERIVED | Resolve once → write `dueAt` | System + provenance |
| DERIVED | Block/unblock | DERIVED | **No change** to `dueAt` | No |
| DERIVED | Recalculate (explicit) | DERIVED | Recompute from rule; user reason | **Required** |
| DERIVED | Set manual date | MANUAL | User value; rule retained but inactive | Yes |
| DERIVED | Rule anchor/offset change | DERIVED | Mark out-of-sync; do not auto-rewrite | Yes; offer recalc |

**Forbidden:**

- Derived auto-recalc on every ready transition
- Derived overwrite of MANUAL `dueAt`
- Silent shift on org timezone change

---

## 4. Deadline behavior matrix

| Scenario | Mode | Task state | Expected behavior |
|----------|------|------------|-------------------|
| Task first becomes READY | DERIVED (ready anchor) | READY | Resolve `dueAt` once if not yet resolved |
| Job activates | DERIVED (activation anchor) | Any | Resolve when rule applies and task open; ready-anchor may also apply later |
| Task blocked after due set | DERIVED or MANUAL | BLOCKED | Keep `dueAt`; show blocked + due/overdue |
| Task ready again | DERIVED | READY | No auto recalc |
| User clicks Recalculate | DERIVED | Any open | New `dueAt` from rule; audited |
| User sets manual date | → MANUAL | Any open | Manual wins |
| User clears manual | MANUAL → NONE or DERIVED | Any | Explicit choice |
| Task completed | Any | DONE | Deadline frozen; no recalc |
| Task reopened | DERIVED | TODO | Keep prior `dueAt` unless user recalc/clear |
| Job canceled | Any | — | Deadlines historical; tasks non-actionable |
| Rule changed after resolve | DERIVED | Open | Flag stale; no silent update |
| Org TZ changed | Any | — | UTC instant preserved; display updates |
| Date-only “Jun 12” | MANUAL or DERIVED | — | Stored as EOD Jun 12 org TZ with `DATE_ONLY` provenance |
| Exact datetime | MANUAL or DERIVED | — | Stored exact instant with `EXACT` provenance |

---

## 5. Needs-scheduling test matrix

| Case | REQUIRED satisfied? |
|------|---------------------|
| No linked events | **Needs scheduling** |
| Linked CONFIRMED, `endAt > now` | Satisfied |
| Linked CONFIRMED, started today, multi-day, `endAt > now` | Satisfied |
| Linked CONFIRMED, `endAt <= now` (ended) | **Needs scheduling** |
| Linked TENTATIVE only | **Needs scheduling** (partial UI: “draft scheduled”) |
| Linked CANCELED | **Needs scheduling** |
| Linked COMPLETED | **Needs scheduling** if no other qualifying event |
| Task not READY | Not needs scheduling (blocked/waiting) |
| `schedulingRequirement OPTIONAL` | Never needs scheduling |
| One CONFIRMED event linked to many tasks | Satisfies each linked REQUIRED task |
| One task linked to two events, one qualifying CONFIRMED | Satisfied |

---

## 6. Phased migration and compatibility strategy

### Prelaunch fast path (recommended)

| Phase | Purpose | Duration intent |
|-------|---------|-----------------|
| **0 — Stabilization** | Fix guards, unify audit metadata, remove false heuristics, add tests | 1 sprint slice |
| **1 — Canon + derivation** | Shared helpers; align workstation + schedule | 1 sprint slice |
| **2 — Canonical entity** | `JobScheduleEvent` + event service + schema (approved) | 1–2 slices |
| **3 — Linkage + requirement** | Join table + `schedulingRequirement` on tasks | 1 slice |
| **4 — Cutover** | One-time backfill; switch all reads/writes | Single controlled window |
| **5 — Legacy freeze** | Stop `JobTask.scheduled*` writes; bridge reads only | Immediate after cutover QA |
| **6 — Decommission** | Remove `JobVisit` bridge + legacy fields | After one full QA cycle |

### One-time backfill (dev/staging)

1. Snapshot DB before cutover.
2. For each `JobVisit` with status SCHEDULED/COMPLETED/CANCELED → map to `JobScheduleEvent` (kind SITE_VISIT or CUSTOMER_APPOINTMENT by notes/heuristic).
3. For each `JobTask` with `scheduledStartAt` + infer end → create event + link (kind CREW_WORK default).
4. Preserve legacy IDs in migration metadata for audit replay.
5. Validate counts and spot-check parity in calendar/workstation.

### Backward compatibility

| Artifact | Bridge lifetime |
|----------|-----------------|
| `JobVisit` API routes | Short — proxy to event service until UI migrated |
| `JobTask.scheduled*` reads | Until UI fully event-based |
| `JobVisit` table | Deprecate after cutover; drop in later migration |

### Rollback (prelaunch)

- DB snapshot restore
- Feature flag: `SCHEDULING_CANONICAL_READS` / `SCHEDULING_CANONICAL_WRITES`
- Reseed dev DB if needed
- **Do not** maintain dual-truth beyond one QA cycle

### Data migration risks

| Risk | Mitigation |
|------|------------|
| Duplicate events from visit + task schedule | Dedupe script: prefer visit as SITE_VISIT; merge links |
| Missing end times on legacy visits | Backfill default duration (e.g. 2h) flagged `MIGRATION_INFERRED_END` |
| Lost audit history | Migration activity row per backfilled event |
| Wrong REQUIRED satisfaction after link | Re-run derivation tests post-backfill |

---

## 7. Implementation slices (vertical end-to-end)

### Slice 1 — Deadline mode + provenance foundation

| Layer | Deliverable |
|-------|-------------|
| Model/data | Due mode, anchor, offset, granularity, resolvedAt, timezoneBasis on task (schema approval) |
| Service | `deadline-service.ts` — set manual, set rule, clear, recalculate |
| Validation | MANUAL cannot be overwritten by sync; recalc requires open task |
| Permission | Org-scoped; role gate for override/recalc |
| Audit | Unified envelope; fix wrong `ISSUE_FOLLOW_UP_TASK_CREATED` usage |
| UI | Task panel: “Set deadline” button flow; provenance chip |
| Derivation | `deriveTaskOverdue()` with DATE_ONLY vs EXACT |
| Tests | Mode transitions, resolve-once, TZ EOD, DST boundaries |
| Browser QA | Manual/derived/clear/recalc across org TZ |
| Rollback | Flag to hide new UI; legacy display only |
| **Exit criteria** | Zero silent due movement; all writes via deadline service |

### Slice 2 — Canonical event lifecycle

| Layer | Deliverable |
|-------|-------------|
| Model/data | `JobScheduleEvent` + enums (kind, status) |
| Service | create, confirm, reschedule, cancel, complete, restricted correct |
| Validation | start/end required; state machine enforced |
| Permission | Org-scoped mutation checks |
| Audit | Full before/after on all event mutations |
| UI | Job page event list + create flow by kind |
| Derivation | tentative/confirmed labels; soft/hard conflict inputs |
| Tests | Invalid transition rejection; terminal state guards |
| Browser QA | Multi-day event; lifecycle buttons |
| Rollback | Flag off → short-lived visit proxy |
| **Exit criteria** | All new events via event service |

### Slice 3 — Compatibility bridge (`JobVisit`) — short-lived

| Layer | Deliverable |
|-------|-------------|
| Service | Visit actions proxy read/write to canonical events |
| Tests | Legacy API contract parity |
| **Exit criteria** | No production dependency on visit-only reads after cutover |

### Slice 4 — Task requirement + linkage

| Layer | Deliverable |
|-------|-------------|
| Model/data | `schedulingRequirement` on task; join table |
| Service | link/unlink; copy requirement at activation from quote execution |
| UI | Link controls; REQUIRED badge; needs-scheduling messaging |
| Derivation | `deriveTaskNeedsScheduling()` — canonical formula |
| Tests | Many-to-many; tentative does not satisfy |
| **Exit criteria** | No category/job-no-visit inference anywhere |

### Slice 5 — Notification decoupling

| Layer | Deliverable |
|-------|-------------|
| Service | Notify after commit; failure isolated |
| Policy | Kind defaults per canon |
| Tests | Delivery failure does not rollback event |
| **Exit criteria** | Policy matrix test-covered |

### Slice 6 — Job cancellation cleanup

| Layer | Deliverable |
|-------|-------------|
| UI | Cleanup review screen with preselection rules |
| Service | Batch cancel with per-event reasons |
| Derivation | Workstation cleanup attention items |
| Tests | Internal preselect vs external explicit confirm |
| **Exit criteria** | No silent external cancel assumptions |

### Slice 7 — Legacy field freeze + bridge removal

| Layer | Deliverable |
|-------|-------------|
| Service | Reject writes to `JobTask.scheduled*` |
| UI | Remove task timing datetime editors; event flows only |
| Decommission | Remove visit bridge code |
| **Exit criteria** | Zero writes to legacy fields; bridge removed pre-launch |

### Prelaunch slice order

1 → 2 → 4 → 5 → 6 → 3 (minimal) → 7

---

## 8. Testing and QA strategy

### Unit tests (required before cutover)

- Deadline mode state machine
- Resolve-once and explicit recalc
- Org-TZ EOD for date-only
- Event lifecycle transitions
- `deriveTaskNeedsScheduling` matrix (section 5)
- Soft vs hard conflict detection

### Integration tests

- End-to-end: create event → link task → REQUIRED satisfied
- Permission denied paths
- Audit record on every mutation type
- Notification failure isolation
- Job cancel cleanup batch

### Browser QA matrix

| Surface | Cases |
|---------|-------|
| Task panel | No timing default; set deadline; link event |
| Job page | Create tentative → confirm; multi-day |
| Calendar | Event kinds visible; conflicts shown |
| Workstation | Overdue vs needs scheduling vs upcoming event |
| Timezone | Org TZ ≠ browser TZ; DST date |

---

## 9. Final completion checklist (find the missing 40%)

Use after all slices land — every item must be checked before launch candidate.

### Canon alignment

- [ ] [scheduling-canon.md](../canon/scheduling-canon.md) matches implemented behavior
- [ ] [source-of-truth-map.md](../source-of-truth-map.md) scheduling section matches code paths
- [ ] No UI copy says “schedule block” for two different concepts
- [ ] Glossary scheduling terms present

### Data truth

- [ ] Exactly one canonical entity for job calendar commitments
- [ ] Zero writes to `JobTask.scheduledStartAt/scheduledEndAt`
- [ ] `JobVisit` table either migrated or read-only with zero new rows
- [ ] Due rule provenance stored and displayable

### Service boundary

- [ ] Grep confirms no ad-hoc `jobTask.update({ dueAt|scheduled* })` outside services
- [ ] All event mutations pass through event service
- [ ] All deadline mutations pass through deadline service

### Permissions

- [ ] Every mutation org-scoped
- [ ] Unauthorized paths tested
- [ ] Restricted correction role-gated

### Audit

- [ ] Actor, before/after, reason, source on all mutations
- [ ] Recalc and confirmed cancel require reason
- [ ] No wrong `JobActivityType` for scheduling events

### Derivation parity

- [ ] Schedule board and workstation use same derivation helpers
- [ ] Needs-scheduling matches canon formula exactly
- [ ] Overdue respects DATE_ONLY EOD semantics
- [ ] Removed: job-no-visit unscheduled, category SCHEDULING-only override, ready-unscheduled tray for non-REQUIRED

### Lifecycle integrity

- [ ] Reschedule cannot reopen COMPLETED/CANCELED without correction workflow
- [ ] Terminal states tested
- [ ] Canceled job triggers cleanup review (not silent auto-cancel of external events)

### Notifications

- [ ] Tentative never auto-customer-notifies
- [ ] Kind visibility defaults match canon
- [ ] Failed notification does not revert event

### Timezone

- [ ] Date-only deadlines use org EOD
- [ ] DST boundary tests pass
- [ ] Org TZ change does not rewrite stored instants

### UX

- [ ] Empty timing normal for NONE/OPTIONAL tasks
- [ ] REQUIRED shows clear “needs confirmed event” state
- [ ] Tentative vs confirmed visually distinct everywhere

### Migration / prelaunch

- [ ] Backfill script idempotent and logged
- [ ] Cutover runbook executed on staging
- [ ] Rollback tested (snapshot + flag)
- [ ] Legacy bridge code removed before launch freeze

### Operational

- [ ] `npm test` green for scheduling packages
- [ ] Browser QA matrix signed off
- [ ] No open critical scheduling drift tickets

---

## 10. Cursor implementation prompt (next session)

When starting code, use this scope guard:

```
Implement Struxient scheduling MVP per docs/canon/scheduling-canon.md and
docs/plans/scheduling-implementation-plan.md.

Prelaunch fast path: minimize dual-write. Schema changes require explicit approval.

Slice order: 1 → 2 → 4 → 5 → 6 → 3 (minimal) → 7.

Do not infer scheduling from category, title, or job visit presence.
Do not silently move deadlines. Do not let AI confirm events without human action.
All mutations through canonical scheduling services with full audit envelope.
```

---

*Plan locked 2026-06-08 — paired with scheduling canon.*
