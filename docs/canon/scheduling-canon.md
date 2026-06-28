# Scheduling and task timing — Struxient v5 canon

> **Status:** Locked for MVP implementation (revised 2026-06-11).  
> **Scope:** Job execution timing — deadlines, calendar commitments, availability, and scheduling attention.  
> **Supersedes:** Informal use of `JobVisit` and `JobTask.scheduledStartAt/scheduledEndAt` as parallel calendar truth.  
> **Related:** [execution-engine-canon.md](./execution-engine-canon.md), [sales-site-visit-canon.md](./sales-site-visit-canon.md), [workstation-canon.md](./workstation-canon.md), [locked-decisions-v1.md](./locked-decisions-v1.md) §5 (superseded for scheduling domain by this document).

---

## Authoritative positioning

Struxient is **task-first**. Tasks are execution truth. **Deadlines** and **calendar commitments** are separate concepts. A task may have neither, one, or both. Empty timing is **valid** unless scheduling is explicitly **REQUIRED**.

Calendar commitments for jobs live on a **single canonical entity**: `JobScheduleEvent`. Do not stretch `JobVisit` into the permanent generic model. Do not treat `JobTask.scheduledStartAt/scheduledEndAt` as a second calendar.

Pre-job sales site visits live on `LeadVisitRequest`. Do not use `JobScheduleEvent` for pre-job sales visits while `jobId` is required, and do not reuse `JobVisit` for estimate/sales visits. See [sales-site-visit-canon.md](./sales-site-visit-canon.md).

**Payment schedule** (commercial milestones) is a **different domain** — not workforce calendar.

---

## Glossary (scheduling domain)

| Term | Contractor meaning | Engineering meaning |
|------|-------------------|---------------------|
| **Task** | Real work, decision, or follow-up on the job | `JobTask` — execution SoT; readiness, blockers, completion |
| **Deadline** | “Should be done by…” | Resolved `dueAt` on task; does **not** reserve calendar time |
| **Due rule** | How the system picks a deadline when not manual | Stored policy + anchor + offset + provenance |
| **Job schedule event** | A real time commitment on the job calendar | Canonical `JobScheduleEvent` — appointments, crew blocks, external windows |
| **Appointment** | Customer/inspector/vendor/utility time commitment | Event kind with external coordination semantics |
| **Crew work block** | Reserved time for field/office production work | Event kind focused on internal execution |
| **External time window** | Time controlled largely by another party | Event kinds: inspection, delivery, utility, etc. |
| **Availability block** | Employee/company unavailable time | `ScheduleBlock` (employee/company unavailability only) |
| **Lead visit request** | Pre-job estimate/site visit request | `LeadVisitRequest` — sales/intake, not job execution calendar |
| **Scheduling requirement** | Whether this task must be backed by a calendar event | Explicit `NONE \| OPTIONAL \| REQUIRED` on task (from execution plan) |
| **Tentative commitment** | Proposed time, not yet operationally reliable | Event status `TENTATIVE` |
| **Confirmed commitment** | Booked time the business and field can rely on | Event status `CONFIRMED` |

**Terminology discipline:** Do not use “schedule block” for both task datetime fields and calendar events. Use **deadline**, **job schedule event**, or **availability block** explicitly.

---

## Domain boundaries

| Domain | Canonical entity | Purpose |
|--------|------------------|---------|
| Task execution | `JobTask` | Work, readiness, completion, resolved deadline |
| Job calendar commitment | `JobScheduleEvent` | Real scheduled time on the job |
| Employee/company unavailability | `ScheduleBlock` | Time off, internal holds — not job commitments |
| Pre-job scheduling | `LeadVisitRequest` | Estimate visits before job exists |
| Commercial payment timing | `PaymentScheduleItem` → `JobPaymentRequirement` | Money milestones — not workforce calendar |
| Customer/site constraints | Job/customer context (MVP: prominent notes + minimal structured windows) | Access, HOA, pets — **not** auto conflict detection in MVP |

### Pre-job visit lifecycle posture

Lead visits are repeatable discovery records, not a single universal pipeline step. Multiple visits may occur before quote send, and additional visits may occur after customer revision requests.

Lead visit facts should support these operational outcomes:

- requested/pending visit intent
- scheduled/confirmed visit commitment
- completed visit outcome
- no-show outcome
- canceled visit outcome

Do not encode “second site visit” as a separate workflow status; represent it as another lead-visit record with purpose/context.

Sales visit scheduling must distinguish internal schedule commitment from customer confirmation. “Scheduled” means the contractor has placed the visit on the internal calendar; “customer confirmed” means the customer accepted or confirmed the appointment through an auditable action. Customer confirmation, notification delivery, access details, completion outcome, and post-visit next action are part of the sales visit contract, not `Lead.status`, `Quote.status`, or calendar DTO truth.

The detailed pre-job lifecycle, required concepts, access snapshot rules, permissions, audit events, surface behavior, and MVP split are owned by [sales-site-visit-canon.md](./sales-site-visit-canon.md).

---

## Task timing states

A task may have:

- No timing
- Deadline only
- One or more linked schedule events
- Both deadline and linked events

Tasks do **not** store canonical calendar start/end after migration. Legacy `JobTask.scheduledStartAt/scheduledEndAt` are compatibility-only until removed.

---

## Work groups (optional, MVP)

`JobWorkPackage` (user-facing: **Work group**, pending UX validation) is the optional production-planning layer between tasks and schedule events.

### Purpose

A work group represents a contractor-recognizable body of work that may be executed in one or several occurrences.

Examples: `Solar installation`, `Roof replacement`, `Electrical finish`, `HVAC changeout`, `Service upgrade`.

### Membership rule (MVP)

A task may belong to:

- no work group, or
- exactly one **primary** work group.

Task-to-event coverage remains many-to-many via `JobScheduleEventTask`.

This prevents:

- duplicate package progress,
- ambiguous task ownership,
- duplicate unscheduled attention,
- inconsistent Workstation placement.

### What a work group stores

- Job identity
- Contractor-readable title
- Optional trade/work type
- Optional planned date range (forecast only)
- Source/provenance
- Optional display order

### What a work group must not store

- Independent completion truth
- Independent percentage complete
- Independent readiness truth
- Independent dependency truth
- Duplicate checklist/proof state

Progress, readiness, remaining work, and risk are derived from tasks + linked events.

### Creation paths (MVP)

- Execution plan proposes work groups and task membership; user approves/adjusts
- Scheduling selected ungrouped tasks may offer “Create work group”
- Manual grouping remains available
- Simple service jobs may schedule directly with no work group

Grouping changes are audited (create, rename, membership, planned-date edits) without adding extra steps to routine scheduling.

---

## Deadline modes

| Mode | Meaning |
|------|---------|
| `NONE` | No deadline |
| `MANUAL` | User-set deadline; derived rule does not auto-apply |
| `DERIVED` | Rule-owned; resolves to `dueAt` on first qualifying transition |

### MVP derived anchors (only these two)

1. **X calendar days after job activation**
2. **X calendar days after task first becomes READY**

No generic automation engine in MVP. No sort-order or “previous task” anchors.

### Resolve-once policy (locked)

- Resolve `dueAt` on the **first** qualifying transition.
- **Preserve** resolved date if task later becomes blocked or ready again.
- **Never** silently move an accountability date.
- **Recalculation** requires explicit audited user action.
- A **derived rule must never overwrite a manual deadline**.

### Manual vs derived

| Question | Policy |
|----------|--------|
| Does manual date disable derived rule? | Derived rule may remain stored but **must not** auto-apply while mode is `MANUAL` |
| Is previous rule retained? | Yes — rule metadata preserved when switching to manual |
| Return to calculated deadline? | Explicit user action: “Use rule” / “Recalculate from rule” (audited) |
| Clear manual override? | User clears manual → may revert to `DERIVED` only via explicit choice |
| Can derived overwrite manual? | **Never** |
| Audit reason required? | Manual set/clear, recalc, rule change, restricted correction |
| Provenance in UI | Show: `Manual`, `Derived: Ready + N days`, `Derived: Activation + N days`, resolved timestamp basis |

### Date-only vs exact-time (MVP)

- **Default:** date-only deadline (administrative norm).
- **Optional:** exact date and time when needed.
- **Date-only resolution:** end-of-day in **organization timezone**.
- Preserve granularity and timezone provenance on the stored value.
- Organization timezone change: **do not** silently reinterpret existing stored instants; re-display in new org TZ.

---

## Job schedule event

### Canonical entity

`JobScheduleEvent` is the SoT for job-related calendar commitments.

**Kinds (MVP):** `CUSTOMER_APPOINTMENT`, `SITE_VISIT`, `CREW_WORK`, `INSPECTION`, `DELIVERY`, `UTILITY_APPOINTMENT`, `OFFICE_WORK`, `OTHER`

### Required fields (MVP)

- `startAt` and `endAt` — **both required**; no open-ended events.
- Multi-day events allowed.
- Default durations may be suggested by UI but must be editable.
- Optional customer/external window fields may be stored when operationally distinct from internal work time.

`startAt/endAt` remains required for every tentative or confirmed event.

### Assignment (MVP)

- Optional responsible lead user.
- Optional internal participants.
- Optional responsible trade/company reference.
- Derived “assignment incomplete” warning when kind/policy expects responsibility but none is set.
- Task assignee remains separate (task accountability ≠ schedule accountability).

MVP does not include payroll, labor allocation, or full capacity/resource optimization.

### Task–event relationship

- Many-to-many link table is SoT for satisfaction and display.
- One event may serve multiple tasks.
- One task may require multiple events.
- Job-level event may exist with no linked tasks.
- Completing event does **not** auto-complete linked tasks.
- Completing task does **not** auto-complete linked events.
- Any assisted completion must be explicit and audited.

### Scheduling requirement (explicit)

Copied from execution plan definition onto materialized `JobTask`:

| Value | Meaning |
|-------|---------|
| `NONE` | No scheduling expectation |
| `OPTIONAL` | May link events; no attention if unscheduled |
| `REQUIRED` | Must have qualifying confirmed event while open and ready |

**Do not infer** scheduling intent from category, title, sort order, readiness alone, or “job has no visit.”

### Needs scheduling (derived)

A task **needs scheduling** when **all** are true:

1. Task is open (not done)
2. Task is ready (`deriveTaskState === READY`)
3. `schedulingRequirement === REQUIRED`
4. No linked **CONFIRMED** event whose **`endAt` has not passed** (`endAt > now`)

Tentative events do **not** satisfy `REQUIRED`. Canceled and completed events do not count.

### Event lifecycle (stored)

```
TENTATIVE → CONFIRMED → COMPLETED
TENTATIVE → CANCELED
CONFIRMED → CANCELED
```

- `CANCELED` is **terminal** — rebooking creates a **new** event.
- `COMPLETED` is **terminal** in normal use — mistaken completion requires **restricted audited correction**.
- Ordinary **reschedule** is an audited mutation; it must **not** silently reopen completed or canceled events.

### Event completion outcome (MVP)

On completion, store one outcome:

- `WORK_COMPLETED`
- `PARTIAL_WORK`
- `NO_WORK_COMPLETED`

Events may complete while linked tasks remain open. Original event remains historical; return work is scheduled on a new event.

### Derived event labels (not stored in MVP)

- Upcoming, happening now, potentially missed, soft/hard conflict — computed at read time.

`MISSED` and `IN_PROGRESS` as **stored** statuses are **deferred**.

### Tentative vs confirmed behavior

| Behavior | TENTATIVE | CONFIRMED |
|----------|-----------|-----------|
| Calendar visibility | Yes | Yes |
| Conflict detection | Soft conflict | Hard conflict |
| Workstation | Planning attention | Operational commitment |
| Customer notification (default) | Never automatic | Per kind + settings |
| Field worker reliance | Not reliable | Reliable |
| Satisfies `REQUIRED` | **No** | **Yes** (if `endAt > now`) |
| AI may draft | Yes (draft only) | Requires human confirmation |

### Planned date range vs event commitment

Planned date range belongs to optional work groups and is forecasting only.

Planned dates must **not**:

- reserve people,
- create hard conflicts,
- satisfy `REQUIRED`,
- notify customers,
- silently create events,
- silently move confirmed events.

### Notifications vs lifecycle

- Notifications are **separate** from lifecycle state.
- Tentative: never automatic customer notifications.
- Customer-visible defaults by kind:
  - Customer appointment, site visit: customer-visible default **on**
  - Inspection, utility: customer-visible default **on**, may disable
  - Crew work, office work, delivery: customer-visible default **off**
- Every mutation writes **internal activity**.
- Notification delivery failure **does not** roll back canonical schedule truth.

---

## Availability and job context (MVP)

| Concept | MVP treatment |
|---------|----------------|
| Employee/company unavailability | Structured `ScheduleBlock` |
| Customer availability, site access, HOA, gates, pets | Prominent **job scheduling context** (notes + minimal structured windows where needed) |
| Auto conflict vs customer/site constraints | **Not** in MVP conflict engine |

Structured recurring customer/site constraints are **deferred**.

---

## Job cancellation and schedule cleanup

When a job is canceled:

1. Job cancels **immediately** (existing job status semantics).
2. System creates **required cleanup attention** for future events.
3. **Internal** events (crew, office): preselected for cancellation in review.
4. **Customer/external** events: require **explicit review** — no silent assumption that local cancel equals external coordination.
5. External cancellation may spawn **follow-up tasks** (e.g. “Confirm inspection cancel with AHJ”).

Batch cancel/reschedule only after **explicit user confirmation** in cleanup review.

---

## Timezone policy (MVP)

| Topic | Policy |
|-------|--------|
| Storage | UTC instants in database |
| Organization timezone | Required org setting for deadline EOD and display |
| Date-only deadlines | Resolve to org-TZ end-of-day; store provenance (`DATE_ONLY` vs `EXACT`) |
| Browser input | Convert via org timezone before persist; never assume browser TZ as SoT |
| DST | Use timezone-aware libraries; test boundary dates |
| Org TZ change | Stored instants unchanged; display recomputed; no silent deadline shift |
| Job-level TZ override | Deferred |

---

## AI authority boundary

| AI may | AI must not |
|--------|-------------|
| Suggest deadline rules | Silently write `dueAt` |
| Draft tentative events | Confirm events without human action |
| Propose link suggestions | Reschedule/cancel confirmed commitments |
| Request approval in review UI | Become calendar SoT |

All committed schedule changes require **human confirmation** with audit trail.

---

## Service boundary (implementation intent)

All schedule and deadline mutations must pass through **one canonical scheduling service layer** (deadline mutations + event lifecycle + link mutations).

Required audit envelope per mutation:

- Acting user
- Organization scope
- Mutation source (UI path / system / AI draft apply)
- Before/after: times, assignment, status, mode (for deadlines)
- Reason (required for recalc, cancel confirmed, correction)
- Timestamp

Do not write timing fields via ad-hoc Prisma calls outside approved actions.

---

## Legacy compatibility (prelaunch fast path)

| Legacy | Treatment |
|--------|-----------|
| `JobVisit` | Temporary bridge only; migrate to `JobScheduleEvent`; no new permanent behavior |
| `JobTask.scheduledStartAt/scheduledEndAt` | Legacy read-only after cutover; then remove |
| `dueOffsetMinutesAfterReady` | Replace with explicit due-rule model |

Prelaunch: prefer **one-time backfill + cutover** over prolonged dual-write.
Phase ordering rule: after safety stabilization, stop creating new legacy schedule truth in runtime paths.

### Workstation presentation boundary (locked)

- Workstation appointment display derives from canonical linked schedule events (`JobScheduleEvent` + `JobScheduleEventTask`), not `JobTask.scheduledStartAt/scheduledEndAt`.
- `JobTask.dueAt` remains deadline pressure only; it must not be rendered as a calendar commitment.
- A tentative linked event may be shown as planning context, but it does **not** satisfy `schedulingRequirement = REQUIRED` until confirmed.

---

## MVP exclusions (explicit)

Do not ship in MVP:

- Multi-user crew scheduling / resource engine
- Capacity planning, route optimization, recurrence
- Equipment reservations
- Customer self-rescheduling portal
- Customer self-scheduling / confirmation links for sales visits in internal MVP
- Business-day/holiday deadline math (calendar days only for derived offsets)
- Advanced deadline anchors (task complete, signal, payment, inspection fail)
- Automatic schedule optimization
- Structured recurring customer availability
- Stored `MISSED` / `IN_PROGRESS` event statuses

---

## Related documents

- Implementation plan, matrices, migration: [`../plans/scheduling-implementation-plan.md`](../plans/scheduling-implementation-plan.md)
- Sales site visit workflow: [`sales-site-visit-canon.md`](./sales-site-visit-canon.md)
- Code SoT map: [`../source-of-truth-map.md`](../source-of-truth-map.md) § Scheduling
- Workstation attention: [`workstation-canon.md`](./workstation-canon.md)

---

*Canon locked 2026-06-08; revised lock 2026-06-11 for final first-class scheduling model.*  
*Updated 2026-06-19 — Cross-linked Sales Site Visit canon and clarified `LeadVisitRequest` vs `JobScheduleEvent` boundary.*
*Updated 2026-06-27 — Locked Workstation appointment display to canonical linked schedule events and clarified tentative-vs-required semantics.*
