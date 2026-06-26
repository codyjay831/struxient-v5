# Change Order manual QA checklist

Use on a dev job with active scope, tasks, office permissions, and at least deposit + final payment requirements. Run after Change Order UI or payment-term changes.

## Setup

- [ ] Job has an active quote and at least one active scope item
- [ ] Job has at least one open task (TODO) and one completed task (DONE) if testing cancel rules
- [ ] Job has unsettled payment requirements (deposit and final balance) for add-to / credit scenarios
- [ ] `DATABASE_URL` set for integration sanity (optional but recommended)

### Fresh customer `/co/[token]` link

Stale share tokens 404 after re-send or token rotation. Before customer-page QA, mint a fresh URL:

```bash
cd apps/web
npx tsx scripts/print-change-order-share-token.ts --changeOrderId=<change-order-id>
# or latest CO on a job:
npx tsx scripts/print-change-order-share-token.ts --jobId=<job-id>
```

The script marks DRAFT / CUSTOMER_REQUESTED_CHANGES COs as **SENT** (dev QA only) and rotates the token. Open the printed URL in a private window.

## Create and commercial flow

- [ ] Create a **price-impact** Change Order (non-zero price delta)
- [ ] Commercial column **Payment terms** card shows summary, **Review payment plan** button, generated customer terms, and after-apply summary
- [ ] **Collect before added work starts** shows staff note that task blocking is **not automatic yet** (no false “work blocked” promise)
- [ ] Commercial section shows scope/price summary and “What the customer will see” on read-only views
- [ ] Generated **ADD_TASK** appears in Work impact with amber “review before send” styling
- [ ] **Send** is blocked until generated task is reviewed or removed
- [ ] Readiness panel shows clear **Next step for office**

## Payment terms (commercial column)

- [ ] Price-impact CO **without saved payment terms** cannot send (readiness + send button explain why)
- [ ] Editing payment approach marks commercial side **Unsaved**; save commercial changes persists terms
- [ ] **Collect before added work starts** — after apply, a CO-sourced **due** payment appears on the job (not an orphan pending row)
- [ ] **Add to next unpaid payment** — preview shows target title and amount before → after; apply increases that requirement only
- [ ] **Add to final payment** — preview shows final payment before → after; apply increases final only
- [ ] **Credit remaining balance** — preview explains credit against remaining balance; apply reduces balances final-first
- [ ] **Spread across remaining payments** — plan review shows per-payment adjustments; apply updates each row exactly
- [ ] **Deposit now, rest to final** — deposit DUE row + final payment increase; customer page shows deposit + allocation table
- [ ] **Deposit now, spread remainder** — deposit DUE row + multiple payment increases
- [ ] **Percentage-based split** — uses original contract % when available; falls back to current balances with warning
- [ ] **Customize allocation mode** can be toggled from payment plan review and starts from selected preset allocation
- [ ] Saved **Custom allocation** shows staff badge and note (`Started from … Amounts were adjusted manually.`) on payment terms card and/or plan review drawer — customer page does not
- [ ] In customize mode, only eligible rows allow editing **CO change** amount; settled rows remain read-only
- [ ] Validation summary shows **Change Order amount**, **Allocated amount**, and **Remaining amount** updating live
- [ ] **Use this payment plan** stays disabled until remaining amount is exactly $0.00 and no invalid row edits exist
- [ ] Manual edits persist as generated customer terms from saved allocations (no freeform payment text)
- [ ] **Target paid after acceptance** — apply fails with payment allocation drift message
- [ ] **Customer allocation preview** — customer page shows allocation table without internal IDs
- [ ] Payment terms are **generated from allocation** (no freeform contradicting table)

## Work impact composer (draft)

- [ ] Add manual **CANCEL_TASK** on an open task — shows “Manually added cancellation”
- [ ] DONE task is disabled in cancel picker with readable reason
- [ ] Add manual **MODIFY_TASK** (title/instructions/scope) — shows “Manually added task change”
- [ ] Add manual **ADD_TASK** — shows “Manually added” (not amber generated label)
- [ ] Unsaved work impact banner appears after adding/editing ops
- [ ] **Save execution impact** button appears in banner and persists changes after refresh
- [ ] **Send** stays blocked until execution impact is saved
- [ ] Work impact does **not** edit payment terms; legacy payment instruction (if present) shows deprecated warning only

## Save separation

- [ ] Edit commercial lines and work impact in same session — mixed-save warning appears
- [ ] Edit payment terms and work impact — mixed-save warning appears; save commercial first
- [ ] Both save buttons disabled with clear copy until one section is saved first
- [ ] Save commercial changes first — work impact manual ops remain intact
- [ ] Save execution impact second — no silent clobber of manual ops
- [ ] Payment strategy changes appear on customer preview/checkpoint **after** save commercial changes

## Send readiness and price-only Change Orders

- [ ] Price-impact CO with **saved payment plan** but no work impact shows **Confirm no work impact** blocker (not vague “must pass validation”)
- [ ] Readiness panel lists **Commercial / Payment plan / Work impact** status separately
- [ ] Send blockers show **title**, **explanation**, and **Next action** (not one generic string)
- [ ] **Mark as price-only / no work impact** in Work impact panel → save execution impact → send unblocks (if payment saved)
- [ ] Price-only path does **not** create fake ADD_TASK rows
- [ ] Work-impact CO with generated tasks shows **Review generated task suggestions** with count
- [ ] Saved payment plan does **not** also show payment-save blocker
- [ ] Legacy payment instruction conflict shows **Refresh work impact** / save commercial guidance with exact error
- [ ] Server send rejection matches readiness panel reason (try send via UI; error toast matches blocker)

## Send and customer flow

- [ ] Send price-impact CO to customer
- [ ] Customer page shows price delta, revised total, and **payment terms** in plain English
- [ ] Customer page shows due timing / affected payment / credit wording when applicable
- [ ] Customer page hides internal IDs (`targetPaymentRequirementId`, plan version, execution internals)
- [ ] Customer accept copy mentions scope, revised total, **and payment terms**
- [ ] Customer page does **not** claim work is automatically blocked unless product actually enforces it
- [ ] Customer **request changes** returns CO to editable state
- [ ] Office can edit commercial + work impact after customer requested changes
- [ ] Customer **accept** from sent link

## Apply and failure states

- [ ] Staff accept (if zero-dollar path) or customer accept enables apply when validation passes
- [ ] **Apply to job plan** succeeds and CO shows applied state
- [ ] Payment materialization failure shows **Apply failed** with specific payment message (not generic error)
- [ ] Stale plan / **needs execution review** state shows warning in work impact panel
- [ ] **Apply failed** state shows failure summary in readiness panel; customer-approved payment terms still visible
- [ ] Settled target after accept — apply blocked; job payments unchanged after failed apply

## Workstation Sales Queue panel

Open **Workstation → Sales** (`tab=commercial`), select a Change Order card, and verify the in-panel actions (not the generic launcher).

- [ ] **SENT price-impact CO** as office role shows **Mark internally accepted** primary action when canon allows staff accept
- [ ] Same **SENT price-impact CO** as viewer / no approve permission does **not** show staff accept as primary (Open full change order only)
- [ ] **Apply-blocked** accepted CO shows a short reason near **Review and apply** (e.g. `Apply is not available yet: …`) without duplicating the full blocker list
- [ ] **Apply-ready** accepted CO applies from the panel; drawer clears or updates after success (item leaves Sales attention when applied)

## Read-only lifecycle

- [ ] **SENT**, **ACCEPTED**, **APPLIED**, **VOID**, **REJECTED**, **SUPERSEDED** — no add/edit/remove controls in work impact
- [ ] Read-only banner: “Work impact is read-only at this stage”
- [ ] Payment terms card read-only on non-editable statuses

## Regression

- [ ] No breadcrumbs added
- [ ] No raw execution JSON or payment JSON shown in office UI
- [ ] Validation errors appear on the affected operation row, not toast-only
- [ ] Legacy `UPDATE_PAYMENT_REQUIREMENT` not shown as normal payment path for new COs
