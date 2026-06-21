# Lead Intake Canon

> **Status:** Approved for implementation (pre-launch).  
> **Scope:** Public intake, internal/manual intake, composable intake setup, Lead Review, Lead→Quote handoff.  
> **Not in scope:** A generic survey product, AI-as-truth, instant pricing automation, sixth implementation slice, or a competing lead/quote spine.

Struxient Lead Intake is the **front door** into a structured contractor request. It must be open-ended across trades, service lines, and scoped construction work while remaining bounded by construction-specific intake primitives and the Lead → Quote source-of-truth model. It is **not** a generic form-builder product: customer-facing intake stays clean, contractors start from defaults/templates, and configurability is exposed as purposeful intake setup rather than raw schema editing.

## Product verdict

**Continue with the existing foundation; consolidate before expanding.**

- **Keep:** `ingestLead` (canonical ingestion), `promoteLeadToQuote` (canonical Lead→Quote), channel adapters, derived readiness helpers (`evaluateLeadReadiness`, `getLeadCommercialProgress`, `getQuoteReadiness`).
- **Fix:** fragmented public/default intake, split settings model, alternate quote-start paths, notes-string parsing as pseudo-structure.
- **Do not:** rewrite the domain spine or add a competing lead/quote system.

Label: **Good foundation, fragmented product model — rebuild the presentation, then scale the composer.**

---

## Core chain

```text
Customer request
  → structured Lead (ingestLead)
  → Quote (promoteLeadToQuote / staff review)
  → Signed (checkpoints)
  → Activate Job
  → executable work
  → Workstation next-action signals
```

---

## Composable intake chain

Product direction:

```text
Default customer/internal intake
  -> Request type / service line
  -> Optional request-type detail pack
  -> Additive custom questions
  -> Intake/scope signals
  -> Quote template filtering/suggestions
  -> Contractor review
```

This chain is the scalable intake model. Implementation may phase it, but new work must not hardcode assumptions that block request-type detail packs, specialized customer forms, additive custom questions, conditional visibility, or signal-driven suggestion layers later.

The correct product promise is **open-ended construction intake, bounded by blessed primitives**:

- All practical trades and scoped construction/service work should be supportable over time through reusable atoms, sections, templates, detail packs, conditional visibility, and optional custom fields.
- "Open-ended" means unknown future combinations of construction work, not arbitrary non-construction questionnaires.
- Contractors should not build from raw internals by default.
- Customer-facing forms should avoid giant questionnaires; ask the minimum useful questions, then adapt based on request type and answers.
- Staff/internal intake may be denser because staff are trained users and can capture messy call/email/walk-in details faster.
- Every submitted form must still land as structured Lead truth through `mapIntakeFormDataToLeadInput` -> `ingestLead`.

---

## Canon model

### Lead

- Canonical incoming request workspace and pre-quote decision surface.
- Holds customer-submitted truth + staff triage decisions.
- Single handoff anchor into Quote; no side-channel quote creation for lead-origin flows.

### Intake submission

- Event producing/augmenting a Lead via **`ingestLead`** only.
- Staff and public intake share **`mapIntakeFormDataToLeadInput`** → **`ingestLead`**. Surface differences are handled by `surfaceMode` (public vs staff) and staff-only internal details — not a separate manual adapter.

### Intake surfaces and path types

First-class surfaces:

| Surface | Purpose |
|------|---------|
| `defaultCustomerIntake` | Main public customer request path. Every org starts here. |
| `defaultInternalIntake` | Staff/office intake for phone, email, walk-in, referral, and field-originated leads. |
| `specializedCustomerForm` | Optional additional public entry point for campaign links, trade-specific pages, referral partners, or distinct service lines. |

Practical path types — not separate systems:

| Mode | Purpose |
|------|---------|
| `defaultService` | Lightweight default; works without setup |
| `tradeTemplate` | Repeated-scope trades; structured MC/checkbox follow-ups |
| `complexProjectTriage` | Big-picture triage only; no giant questionnaire |

### Intake template / question layer

- Atom/section infrastructure is the engine; contractors should see **defaults, templates, detail packs, and readable field groups** before raw atoms.
- Custom questions are **additive and guardrailed**. They are valid and important, but they should not be the first thing a new contractor has to understand.
- Conditional visibility is first-class for keeping customer forms short while still supporting complex request types.
- Form snapshots/provenance are required so the team can reconstruct what the customer or staff member saw at submit time.

### Public request settings

Own **presentation policy** only:

- Copy, branding, link behavior, submit button text
- Request type option labels (machine keys → display)
- Path enablement / default path (future)
- Instant-pricing guardrails (disabled until post–Slice 3)

**Do not** duplicate structural form schema here — that lives in `IntakeFormDefinition.schema`.

### Lead Review surface

Decision surface; must answer in one view:

- Who / where / what
- Timing, urgency, access
- Photos/files
- Missing info (derived)
- Quote readiness (derived)
- Next best action (derived)
- Quote action
- Activity trail

### Sales site visits

Pre-job sales site visits / estimate visits belong to `LeadVisitRequest`, not `Lead.status`, `Quote.status`, `JobScheduleEvent`, `JobVisit`, or a duplicate sales-visit entity.

Lead Review is the primary sales surface for visit context and outcome. It should support schedule/reschedule/complete/no-show, access snapshot review, outcome selection, and next-action capture through shared visit actions or a shared visit work surface.

The lead remains the commercial/request context. If a quote exists, the quote may display linked visit state through the lead relationship, but visit notes must not silently mutate quote scope, quote lines, customer-facing text, pricing, or checkpoints. See [sales-site-visit-canon.md](./sales-site-visit-canon.md).

### Quote handoff

- **One canonical path** for all lead-origin quote starts: `promoteLeadToQuote` (via `performCreateQuoteDraftFromLead` or equivalent wrapper).
- Readiness gate, customer + service location, templates, `LeadEvent`, consistent `CONVERTED` semantics.
- **Deprecated:** lead-origin flows that call `createQuoteDraft` without promotion invariants.

### AI assist layer

- Derived, review-first only.
- May suggest: classification, missing info, follow-ups, line-item starters, template candidates.
- Must never silently persist truth or bypass contractor review.

### Activity / audit layer

- `LeadEvent` append-only backbone for intake and handoff.
- Handoff events must be consistent regardless of UI entry point.

---

## Source-of-truth rules

| Category | Examples | Storage |
|----------|----------|---------|
| **Customer-submitted truth** | Contact, jobsite/address, request type/description, timing/access inputs, attachment refs | `Lead.contact`, `Lead.request`, `Lead.address`, `Attachment` |
| **Sales site visit facts** | Visit request, scheduled time, assigned rep, arrival window, access snapshot, confirmation state, completion outcome, next action | `LeadVisitRequest` + `LeadEvent` audit |
| **Staff-reviewed truth** | Qualification, customer link/create, quote start, explicit overrides | `Lead.status`, `Lead.customerId`, staff notes, quote rows |
| **Derived** | Missing info, commercial progress, quote readiness, workstation next action, future intake/scope signals | Helpers only — **never** new competing status columns |
| **AI may suggest** | Classification, missing-info candidates, follow-ups, line starters, template filter candidates | Ephemeral until review/apply |
| **AI must never persist as truth** | Final classification, readiness, quote lines, execution tasks, customer pricing/commitments | — |

### Lead status vs opportunity condition

`Lead.status` is lifecycle/disposition truth (open/paused/lost/archived-style intent), not the contractor-facing “current sales condition” explanation.

The current condition shown in list/workstation/record surfaces must be derived from combined facts (lead readiness + visits + quote/send/approval + customer change requests + activation), not manually set as a second status field.

### Sales page vs Lead Review

- **Lead Review** (single-record workspace/dialog): decision surface for one opportunity—who/where/what, missing info, next action, quote CTA.
- **Sales** (`/leads`): browse **all open opportunities** on a derived condition board (actionable lanes such as “Needs site survey”, “Quote sent”) plus list fallback. Board placement comes from `getOpportunityFlow().conditionCode`; `Lead.status` does not drive column placement.

**Legacy note:** `parseIntakeNotes()` and notes-marker protocols are **display/legacy only** — do not grow them; new fields belong in `Lead.request` / `Lead.address` JSON.

---

## Settings hierarchy

| Level | What | MVP visibility |
|-------|------|----------------|
| 1 | **Default customer intake** — main public request path | Shown |
| 2 | **Default internal intake** — staff/office lead capture path | Shown |
| 3 | **Public copy/branding/status** — page wrapper around customer intake | Shown |
| 4 | **Request types / service lines** — bounded choices that can drive detail packs | Shown once defaults are clear |
| 5 | **Specialized customer forms** — optional extra public slugs for campaigns, trades, partners, or service lines | Secondary, not labeled as the main path |
| 6 | **Intake templates / detail packs** — reusable question sets by trade/request type | Presets / guided setup |
| 7 | **Optional custom questions** — additive, capped, and reviewed | Power setting, but not treated as an afterthought |
| 8 | **Instant-pricing guardrails** | Hidden/disabled until intake + quote handoff are stable |

**Hidden from first-run users:** atom-level schema editing, channel jargon, raw JSON, and deep branching/rules engines.

**Important:** "Advanced" is not a product category for intake. All intake surfaces can become powerful. The user-facing model is:

- Default customer intake
- Default internal intake
- Optional specialized customer forms
- Templates/detail packs/custom questions as tools inside those surfaces

---

## UX model (target)

- **Customer-facing:** clean progressive flow; default path automatic; specialized forms optional; no giant questionnaires.
- **Internal/staff:** faster dense capture where appropriate; optimized for calls, emails, walk-ins, referrals, and field-originated leads.
- **Lead Review:** one-page triage + missing info + next action + quote CTA.
- **Quote start:** one obvious action; same semantics everywhere.
- **Missing info:** grouped gaps with fix affordances.
- **Settings:** control center first, defaults obvious, specialized forms understandable, raw internals hidden.

---

## Architecture alignment (code)

| Action | Location |
|--------|----------|
| **Keep** | `ingest-lead.ts`, `promote-to-quote.ts`, `lead-readiness-heuristics.ts`, `lead-commercial-progress.ts`, `quote-readiness.ts`, channel adapters |
| **Consolidate** | `default-intake-form.ts`, `public-lead-actions.ts`, `intake-form-renderer.tsx`, settings split (`intake-forms` vs `public-request-settings`) |
| **Reframe** | UX copy: “intake paths/templates”, “Lead Review”, instant-quote as future guarded automation |
| **Deprecate** | Lead-origin `createQuoteDraft` bypass; conflicting lifecycle semantics |
| **Do not touch yet** | Lead/quote spine redesign, competing intake systems, workstation-wide redesign, unbounded survey-builder expansion, instant pricing |

Canonical code map also in [`docs/source-of-truth-map.md`](../source-of-truth-map.md) (Commercial pipeline).

Schema posture: do not redesign the lead/quote spine or create a competing intake system. Additive schema work is allowed when it supports approved canon-owned facts, such as `LeadVisitRequest` lifecycle, access snapshot, outcome, next action, and audit, with explicit approval.

---

## Implementation slices (5 only)

There are **five active slices**. No sixth slice in the current roadmap.

### Slice 1: Default intake reliability + canon cleanup

- **Goal:** Reliable default customer intake and default internal intake; composer-compatible; no hardcoded blockers.
- **Do not build:** Request Type Detail Packs, Intake/Scope Signal mapping, quote template filtering, auto line items, instant pricing, AI intake, complex rules builder.
- **Acceptance:** Net-new org can submit public intake without setup failure; staff can create internal leads without setup failure; synthetic default form ids do not break submit; settings copy (e.g. submit button) reflected in UI.

### Slice 2: Lead Review decision surface

- **Goal:** Staff triage surface answers missing info + next action + quote path in one place.
- **Do not build:** new workflow engine, expanded workstation scope.

### Slice 3: Canonical Lead→Quote handoff

- **Goal:** All lead-origin quote starts use `promoteLeadToQuote` invariants.
- **Do not build:** auto-quote generation, pricing automation.

### Slice 4: Settings/template simplification

- **Goal:** First-class intake control center; defaults first; specialized forms and templates understandable.
- **Do not build:** unconstrained survey-builder UX.

### Slice 5: AI-ready intake projection

- **Goal:** Single derived DTO for future AI prompts from stored truth + deterministic derivations.
- **Do not build:** auto-apply AI, autonomous quoting.

### Post-stability future direction — not a slice

Future product context only (service/trade/complex depth, detail packs, signals). **Not** an implementation phase in the current roadmap.

---

## Prioritized decisions (approved)

1. One canonical lead-origin quote-start path (`promoteLeadToQuote`).
2. Default customer + default internal intake settings hierarchy; specialized forms are optional paths, not "advanced mode."
3. Source-of-truth contract above (customer / staff / derived / AI).
4. Contractor-type paths as UX policy, not separate systems.
5. No instant pricing expansion until Slices 1–3 are stable.
6. Sales site visits use `LeadVisitRequest` as the pre-job source of truth; no duplicate intake app or sales visit workflow model.

---

## Cursor implementation

**Implementation prompts for Slices 2–5 should be written only after Slice 1 is verified in production-like conditions.**

Slice 1 implementation must reference this document and the Slice 1 guardrails in §Future intake chain.

---

*Last updated: 2026-05-20 — Lead Intake Canon Target planning implementation.*  
*Updated 2026-06-19 — Added Sales Site Visit ownership and Lead Review surface boundary.*
*Updated 2026-06-19 — Reframed “do not touch schema redesign” so it blocks lead/quote spine rewrites and competing intake systems, not approved additive schema for canon-owned `LeadVisitRequest` facts.*
*Updated 2026-06-21 — Reframed intake from small default form to robust composable intake: default customer intake, default internal intake, optional specialized customer forms, templates/detail packs/custom questions, and no "advanced" product category.*
*Updated 2026-06-21 — Clarified "open-ended" intake means support for unknown future combinations of trades, service lines, and scoped construction work while remaining bounded by construction-specific primitives and Lead → Quote truth.*
