# Sales Site Visit Canon

> **Status:** Canon planning lock before implementation.  
> **Scope:** Pre-job sales site visits, estimate visits, and on-site assessments before quote finalization or job activation.  
> **Related:** [lead-intake-canon.md](./lead-intake-canon.md), [scheduling-canon.md](./scheduling-canon.md), [experience-canon-lead-to-workstation.md](./experience-canon-lead-to-workstation.md), [workstation-canon.md](./workstation-canon.md), [quote-truth-and-checkpoints.md](./quote-truth-and-checkpoints.md).

Sales site visits are a sales/discovery commitment connected to a lead and, when present, its quote. They are not a second intake app, not a generic CRM workflow builder, and not a parallel quote workflow.

## Product Verdict

**Good but needs structure.**

Struxient should support end-to-end sales site visits because contractors need to turn early customer intent into quote-ready facts and next actions. The implementation must stay attached to the existing commercial spine:

```text
Lead -> Quote -> Job
```

The visit records what was scheduled, what the customer confirmed, what access was known, what happened on site, and what should happen next. The quote remains the commercial working record. The schedule record remains the appointment commitment. Activity/audit explains changes.

## Entity Ownership

| Concept | Source of truth | Rule |
|---------|-----------------|------|
| Pre-job sales site visit | `LeadVisitRequest` | Canonical record for estimate/site visits before a job exists. |
| Job execution scheduling | `JobScheduleEvent` | Canonical record for post-sale/job-bound calendar commitments. |
| Commercial/sales context | `Lead`, `Quote` | May reference or display visit state, but must not duplicate appointment state. |
| Calendar display | Calendar DTOs / schedule query | Derived view only; never owns visit state. |
| Workstation attention | Workstation query + ranking helpers | Derived from visit, lead, quote, timing, access, and outcome facts. |
| Sales pipeline placement | `getOpportunityFlow()` and board/list helpers | Derived from stored facts; no drag-to-advance state mutation. |
| Legacy job visits | `JobVisit` | Legacy/job-side bridge only. Must not be used for pre-job sales visits. |

`JobScheduleEvent` must not be used for pre-job sales visits while it requires `jobId`. If a future generic schedule refactor removes that constraint, it must explicitly preserve the distinction between sales/pre-job commitments and job execution commitments.

Do not add a duplicate `SalesVisit` model unless a future generic scheduling refactor proves `LeadVisitRequest` can no longer carry the sales visit contract without corrupting lead/quote boundaries.

## Lifecycle

Sales site visit state must distinguish internal scheduling from customer confirmation. **Scheduled** means Struxient has an internal appointment commitment. **Customer confirmed** means the customer accepted or confirmed that commitment through an auditable action.

Required lifecycle concepts:

1. **Requested** — customer or staff created visit intent.
2. **Proposed by contractor** — staff proposed one time/window to the customer.
3. **Scheduled internally** — staff placed the visit on the internal schedule.
4. **Confirmation sent** — email/SMS/link was sent or attempted.
5. **Customer confirmed** — customer accepted the proposed time/window.
6. **Reschedule requested** — customer or staff asked to change the time.
7. **Rescheduled** — internal schedule was changed through an explicit transition.
8. **Canceled** — visit will not happen; cancellation is auditable.
9. **Completed** — assigned staff recorded that the site visit happened.
10. **No-show** — customer no-show or contractor missed visit is recorded explicitly.
11. **Completed with next action** — outcome selected and quote/follow-up/disqualification/reschedule action is clear.

Lifecycle state and customer confirmation state may be stored separately if needed. Notification delivery success/failure must not become lifecycle state.

## Required Visit Concepts

Future implementation must support these concepts on or adjacent to `LeadVisitRequest`:

- Assigned estimator, salesperson, or field rep.
- Scheduled start and scheduled end.
- Estimated visit duration.
- Customer-facing arrival window, which may differ from internal start/end.
- Customer confirmation state.
- Visit-specific access requirements.
- Site contact details.
- Reschedule request note/state.
- Required completion outcome.
- Next action after visit.
- Auditable mutation history.

Derived display labels such as upcoming, overdue, unconfirmed, missing access, no-show recovery, or post-visit follow-up are computed from those facts. Do not store those labels as independent workflow truth.

## Access Details

Access details are initially **visit-specific snapshots**. They describe what was known for that appointment and must remain available in visit history even if the jobsite facts change later.

Examples:

- Someone must be home.
- Gate code.
- Garage access.
- Lockbox.
- Pets.
- Parking.
- Call on arrival.
- Site contact.
- Access notes.

Stable facts may later be promoted to `CustomerServiceLocation` or another site-details store through an explicit reviewed action. Promotion must not erase the visit snapshot.

Access details are sensitive operational data. They are not generic customer portal content and must not be exposed to viewers, subcontractors, or customer links unless the permission/token scope explicitly allows it.

## Completion Outcomes

Completing a sales site visit must require an outcome. Required outcome choices:

- `QUOTE_READY` — enough information exists to build/send the quote.
- `QUOTE_NEEDS_REVISION` — existing quote scope/pricing needs reviewed revision.
- `MISSING_INFORMATION` — visit happened but blocking information remains.
- `FOLLOW_UP_NEEDED` — non-quote follow-up is required.
- `CUSTOMER_NO_SHOW` — customer was unavailable or missed the appointment.
- `CONTRACTOR_MISSED` — contractor missed or could not perform the visit.
- `RESCHEDULE_NEEDED` — another visit should be scheduled.
- `DISQUALIFIED` — bad fit, outside service area, unsafe, or not worth quoting.

A completed visit without a clear next action is Workstation attention. The system should not silently mark the opportunity quote-ready if the selected outcome says otherwise.

Visit notes, photos, measurements, and observations may inform quote drafting, but must never silently mutate quote scope, price, line items, or customer-visible proposal content. AI may draft summaries or quote suggestions only as review-then-apply proposals.

## Surface Behavior

### Workstation

Workstation shows attention and next action, not the full visit editor.

It should surface:

- Assigned visits today/tomorrow.
- Unconfirmed visits.
- Missing access details.
- Reschedule requests.
- No-show recovery.
- Visit completed but quote/follow-up missing.

Workstation opens the shared lead/visit work surface for details and action.

### Calendar

Calendar shows sales visits as time commitments with compact context:

- Sales visit badge.
- Assigned rep.
- Arrival window.
- Confirmation state.
- Quick actions only: confirm, reschedule, cancel, complete/no-show where allowed.

Calendar does not own visit state and must not become a parallel source of truth.

### Sales Tab

Sales shows opportunity state derived from visit facts:

- Needs site visit.
- Visit scheduled.
- Upcoming visit.
- Reschedule requested.
- No-show recovery.
- Post-visit next action.

No drag-to-advance unless the drag maps to an explicit service transition with audit.

### Lead Page

The Lead page is the primary place for sales visit context and outcome capture. Schedule, reschedule, complete, no-show, access details, outcome, and next action should be available here or in a shared visit work surface opened from here.

### Quote Page

If a quote exists, the quote page may show linked visit state through the lead relationship. Visit notes may inform quote drafting. Visit notes must not silently mutate quote scope, quote lines, customer-facing text, pricing, or checkpoints.

### Customer Confirmation Link

Customer confirmation links are a later phase, not internal MVP.

When built, the link must be scoped to one visit and one allowed action set. It may show the contractor identity, visit time/window, estimated duration, safe address/context, and customer-facing access prompts. It must not expose internal notes, pricing logic, staff comments, quote internals, unrelated leads, unrelated jobs, or unrelated customer data.

## Permissions

Intended access rules:

- **Owner/Admin/Office** can schedule, edit, cancel, send links, and view access details.
- **Assigned Sales/Field estimator** can view assigned visits, view access details, complete, mark no-show, and request/reschedule where policy allows.
- **Viewer** has limited read access and may not see sensitive access details unless explicitly allowed.
- **Subcontractor** has no pre-job sales visit access unless a later design grants scoped access.
- **Customer** has token-scoped access only; possession of a visit link does not imply portal access or broader customer account access.

Role defaults must reflect contractor reality: the person performing estimates may be a sales user, office user, owner, or field estimator. Permission design must not make assigned estimators blind to their own visits.

## Audit

The following events must be auditable:

- Visit requested.
- Visit proposed.
- Confirmation link sent.
- Customer confirmed.
- Reschedule requested.
- Rescheduled.
- Canceled.
- Access details changed.
- Reminder sent.
- Reminder failed.
- Completed.
- No-show.
- Outcome selected.
- Next action created.

Lead-phase visit audit belongs to the lead/commercial activity stream. Job-phase scheduling audit belongs to job activity. Notification sent/failed records are delivery facts, not lifecycle truth.

## MVP Boundary

### MVP 1: Internal Sales Site Visit Workflow

- Extend existing internal visit scheduling behavior.
- Assigned rep.
- Scheduled start/end.
- Arrival window.
- Estimated duration.
- Structured access snapshot.
- Completion outcome.
- Workstation/Sales/Calendar/Lead surfacing.
- Permission fixes for assigned estimator visibility.
- No customer public confirmation yet.

### MVP 2: Customer Confirmation Link

- Token model/service.
- Public confirmation route.
- Confirm proposed time.
- Request reschedule.
- Provide access details.
- Email delivery.
- Audit and rate limits.

### MVP 3: Customer Self-Scheduling Windows

- Contractor-offered windows.
- Customer chooses one.
- Optional reminders.
- Later SMS.

## Explicit Non-Goals

- No generic CRM workflow builder.
- No duplicate `SalesVisit` model unless a future generic schedule refactor proves necessary.
- No customer scheduling link in internal MVP.
- No AI auto-mutating quote scope.
- No visit state stored on `Lead.status` or `Quote.status`.
- No appointment state copied into calendar DTOs.
- No use of `JobScheduleEvent` for pre-job visits while `jobId` is required.
- No use of `JobVisit` for sales site visits.
- No separate intake app inside the app.

---

*Created 2026-06-19 — Canon planning lock for Sales Site Visit workflow before schema/application implementation.*
