# Change Order manual QA checklist

Use on a dev job with active scope, tasks, and office permissions. Run after Change Order UI changes.

## Setup

- [ ] Job has an active quote and at least one active scope item
- [ ] Job has at least one open task (TODO) and one completed task (DONE) if testing cancel rules
- [ ] `DATABASE_URL` set for integration sanity (optional but recommended)

## Create and commercial flow

- [ ] Create a **price-impact** Change Order (non-zero price delta)
- [ ] Commercial section shows scope/price summary and “What the customer will see” on read-only views
- [ ] Generated **ADD_TASK** appears in Work impact with amber “review before send” styling
- [ ] **Send** is blocked until generated task is reviewed or removed
- [ ] Readiness panel shows clear **Next step for office**

## Work impact composer (draft)

- [ ] Add manual **CANCEL_TASK** on an open task — shows “Manually added cancellation”
- [ ] DONE task is disabled in cancel picker with readable reason
- [ ] Add manual **MODIFY_TASK** (title/instructions/scope) — shows “Manually added task change”
- [ ] Add manual **ADD_TASK** — shows “Manually added” (not amber generated label)
- [ ] Unsaved work impact banner appears after adding/editing ops
- [ ] **Save execution impact** button appears in banner and persists changes after refresh
- [ ] **Send** stays blocked until execution impact is saved

## Save separation

- [ ] Edit commercial lines and work impact in same session — mixed-save warning appears
- [ ] Both save buttons disabled with clear copy until one section is saved first
- [ ] Save commercial changes first — work impact manual ops remain intact
- [ ] Save execution impact second — no silent clobber of manual ops

## Send and customer flow

- [ ] Send price-impact CO to customer
- [ ] Customer page shows commercial content only (no work impact, internal notes, or plan version)
- [ ] Customer **request changes** returns CO to editable state
- [ ] Office can edit commercial + work impact after customer requested changes
- [ ] Customer **accept** from sent link

## Apply and failure states

- [ ] Staff accept (if zero-dollar path) or customer accept enables apply when validation passes
- [ ] **Apply to job plan** succeeds and CO shows applied state
- [ ] Stale plan / **needs execution review** state shows warning in work impact panel
- [ ] **Apply failed** state shows failure summary in readiness panel; composer read-only

## Read-only lifecycle

- [ ] **SENT**, **ACCEPTED**, **APPLIED**, **VOID**, **REJECTED**, **SUPERSEDED** — no add/edit/remove controls in work impact
- [ ] Read-only banner: “Work impact is read-only at this stage”

## Regression

- [ ] No breadcrumbs added
- [ ] No raw execution JSON shown in office UI
- [ ] Validation errors appear on the affected operation row, not toast-only
