# Scheduling implementation plan

> **Purpose:** Executable engineering plan for first-class Struxient scheduling MVP.  
> **Canon:** [scheduling-canon.md](../canon/scheduling-canon.md) (revised lock 2026-06-11).  
> **Posture:** Prelaunch fast path — stabilize truth first, then expand capability.

---

## 1. Locked architecture contract

### Source-of-truth boundaries

| Concept | Canonical stored truth | Derived truth | Must never duplicate |
|---------|-------------------------|---------------|----------------------|
| Task execution | `JobTask` | readiness, blocked, done display | Event state |
| Deadline | `JobTask.dueAt` + due mode/provenance fields | overdue, due today, urgency labels | Calendar commitment |
| Work grouping | `JobWorkPackage` + primary `JobTask.workPackageId` | package progress/readiness/risk | Stage/line-item completion truth |
| Calendar commitment | `JobScheduleEvent` | upcoming/missed/conflict/risk | `JobVisit`, `JobTask.scheduled*` |
| Event-task coverage | `JobScheduleEventTask` | REQUIRED satisfaction, remaining-work candidates | Work-group membership |
| Availability | `ScheduleBlock` | availability warnings | Job commitment events |
| Lead pre-job scheduling | `LeadVisitRequest` | pre-job scheduling attention | Job execution scheduling truth |

### Membership rule (MVP)

- A task belongs to zero or one **primary** work group.
- Event coverage remains many-to-many (`JobScheduleEventTask`).
- Do not introduce many-to-many task-to-work-group membership in MVP.

### Scheduling requirement rule

- `JobTask.schedulingRequirement` remains canonical.
- Work-group requirement (if introduced) is a creation/default helper only, not independent runtime truth.

---

## 2. Lifecycle and behavior contracts

### Event lifecycle (MVP)

Statuses: `TENTATIVE`, `CONFIRMED`, `COMPLETED`, `CANCELED`

Valid transitions:

- `TENTATIVE -> CONFIRMED`
- `TENTATIVE -> CANCELED`
- `CONFIRMED -> COMPLETED`
- `CONFIRMED -> CANCELED`
- Reschedule preserves `TENTATIVE` or `CONFIRMED`

Invalid in normal paths:

- reopening `COMPLETED` or `CANCELED`
- status-changing reschedule that bypasses lifecycle guards

### Event completion outcome

Store one outcome on completion:

- `WORK_COMPLETED`
- `PARTIAL_WORK`
- `NO_WORK_COMPLETED`

Completion may occur while linked tasks remain open. Return work is a new event; original event stays historical.

### Planned vs tentative vs confirmed

- Planned range is work-group forecast only.
- Planned never reserves people, never satisfies REQUIRED, never notifies customers, never creates events, never moves confirmed events.
- Tentative is visible and creates soft conflict only.
- Confirmed is operational commitment and creates hard conflict.

---

## 3. Immediate safety patch (Phase 0)

Fix verified critical truth defects before broader feature work:

1. Duplicate calendar entries (bridged visit + canonical event, and legacy timestamp overlap)
2. Event IDs routed into task actions
3. Terminal visit/event resurrection paths
4. Calendar/Workstation representing the same commitment differently

Non-goals:

- no legacy UX polish
- no new scheduling capabilities
- no work-group implementation in this phase

Exit criteria:

- no duplicate commitment rows
- correct action routing by entity type
- terminal-state guards enforce no ordinary reopen
- canonical commitment identity parity between Calendar and Workstation

---

## 4. Revised phased program

## Phase 0 — Schedule truth safety

**User outcome:** Calendar and Workstation stop drifting from each other.  
**Rule:** stabilization only.

## Phase 1 — Canonical event cutover foundation

**User outcome:** all new schedule truth writes are canonical.

Deliverables:

- all new schedule writes through `JobScheduleEvent` service paths
- stop new authoritative `JobVisit` creation
- stop new `JobTask.scheduledStartAt/scheduledEndAt` writes
- lifecycle + outcome enforcement
- unified org-scoped permission checks for scheduling mutations
- unified audit envelope
- deadline service/UI completion for manual/derived controls
- shared canonical query foundations for Calendar/Workstation

## Phase 2 — Work groups and production scheduling (single vertical)

**User outcome:** grouped, split, and return scheduling works end-to-end.

Deliverables:

- work-group creation (execution-plan proposal + manual + from selected tasks)
- primary task membership
- planned date range
- schedule all/some group tasks together
- split by trade/date across multiple occurrences
- unallocated-task visibility
- partial completion with remaining-work return scheduling
- service path remains usable with no work group

## Phase 3 — Cross-surface completion

**User outcome:** job page, calendar, workstation, and task panel use the same scheduling truth.

Deliverables:

- canonical schedule queries across surfaces
- shared derivation helpers for attention/conflicts/risk
- consistent identity and links across UI surfaces
- mobile event view parity for key actions

## Phase 4 — Service and external appointment semantics

**User outcome:** windows and external coordination are modeled safely.

Deliverables:

- optional customer/external window fields where needed
- per-kind validation behavior (crew/service/customer/inspection/delivery/utility/office)
- communication intent policy by kind/status
- external cancellation cleanup semantics

## Phase 5 — Existing-data migration and legacy removal

**User outcome:** no hidden duplicate scheduling architecture.

Deliverables:

- backfill and dedupe existing legacy rows
- remove legacy schedule reads from runtime paths
- remove legacy visit UI/runtime dependencies
- finalize bridge retirement

## Phase 6 — Launch hardening

**User outcome:** production-safe scheduling launch candidate.

Deliverables:

- permissions and org isolation verification
- audit completeness verification
- concurrency and stale-edit handling
- notification-failure isolation
- timezone/DST verification
- browser/mobile/accessibility/performance QA
- completion audit against missing-40% contract

---

## 5. Testing and QA requirements by phase

### Required automated tests

- Event lifecycle + terminal-state guards
- Event outcome and return-work flow
- Task REQUIRED satisfaction using event links
- Planned-vs-tentative-vs-confirmed derivation behavior
- Permission denials (role + org scope)
- Audit payload integrity (before/after/reason/source)
- Notification failure isolation (canonical truth persists)
- Timezone and DST edge cases

### Required browser QA paths

- Same-day grouped installation
- Split-trade scheduling
- Partial completion + return scheduling
- Simple service appointment without group
- Inspection/external window workflow
- Legacy data parity after migration

---

## 6. Prelaunch migration strategy

Because Struxient is prelaunch, use a simple safe cutover:

1. Snapshot DB
2. Backfill `JobVisit` and legacy task schedule fields to canonical events + links
3. Dedupe rows and reconcile links
4. Switch reads to canonical query
5. Remove legacy runtime dependencies
6. Execute schema removals in approved migration review

Do not maintain prolonged dual truth after Phase 1.

---

## 7. Completion contract (missing 40% guard)

Scheduling cannot be called complete until:

- Canon + plan match implemented behavior
- No duplicate commitment truth in runtime
- All writes through canonical services
- Work groups support bulk/split/return scheduling
- Deadlines remain separate from events
- Planned/tentative/confirmed semantics are consistent
- Lifecycle invalid transitions are blocked
- Permissions + org isolation tested
- Audit envelope complete
- Notification failure cannot corrupt canonical truth
- Calendar and Workstation agree on commitment identity/state
- Timezone/DST tests pass
- Legacy writes impossible; legacy reads retired per plan
- Acceptance QA scenarios pass across desktop + mobile paths

---

*Plan locked 2026-06-08; revised phase order and architecture lock on 2026-06-11.*
