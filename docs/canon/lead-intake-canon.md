# Lead Intake Canon

> **Status:** Approved for implementation (pre-launch).  
> **Scope:** Public intake, manual intake, Lead Review, Lead→Quote handoff.  
> **Not in scope:** Full custom form builder, AI-as-truth, instant pricing automation, sixth implementation slice.

Struxient Lead Intake is the **front door** into a structured contractor request — not a generic form builder. Customer-facing intake stays clean; staff-facing Lead Review is a **decision surface**; configurability lives behind the scenes.

## Product verdict

**Continue with the existing foundation; consolidate before expanding.**

- **Keep:** `ingestLead` (canonical ingestion), `promoteLeadToQuote` (canonical Lead→Quote), channel adapters, derived readiness helpers (`evaluateLeadReadiness`, `getLeadCommercialProgress`, `getQuoteReadiness`).
- **Fix:** fragmented public/default intake, split settings model, alternate quote-start paths, notes-string parsing as pseudo-structure.
- **Do not:** rewrite the domain spine or add a competing lead/quote system.

Label: **Good foundation, fragmented product model — consolidate now, then scale.**

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

## Future intake chain (guardrail — not Slice 1)

Long-term pipeline (compatible with Slice 1; **do not implement full chain in Slice 1**):

```text
Universal Intake
  → Request Type
  → Request Type Detail Pack
  → Intake/Scope Signals
  → Quote template filtering/suggestions
  → Contractor review
```

Slice 1 may only stabilize **Universal Intake** capture and submit invariants. It must **not** hardcode assumptions that block Request Type Detail Packs or signal-driven suggestion layers later.

---

## Canon model

### Lead

- Canonical incoming request workspace and pre-quote decision surface.
- Holds customer-submitted truth + staff triage decisions.
- Single handoff anchor into Quote; no side-channel quote creation for lead-origin flows.

### Intake submission

- Event producing/augmenting a Lead via **`ingestLead`** only.
- Staff and public intake share **`mapIntakeFormDataToLeadInput`** → **`ingestLead`**. Surface differences are handled by `surfaceMode` (public vs staff) and staff-only internal details — not a separate manual adapter.

### Intake path / type (product modes)

Practical modes — not separate systems:

| Mode | Purpose |
|------|---------|
| `defaultService` | Lightweight default; works without setup |
| `tradeTemplate` | Repeated-scope trades; structured MC/checkbox follow-ups |
| `complexProjectTriage` | Big-picture triage only; no giant questionnaire |

### Intake template / question layer

- Atom/section infrastructure stays internal; contractors see **templates** and bounded options.
- Custom questions are **additive and guardrailed** — not the primary UX.

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
| 1 | **Default intake** — always on, minimal fields | Shown |
| 2 | **Enabled intake paths** — toggles for service / trade / complex triage | Simple toggles (future paths post-stability) |
| 3 | **Template selection** — opinionated packs | Presets |
| 4 | **Optional custom questions** — additive, capped | Advanced / tucked away |
| 5 | **Public copy/branding** | Shown |
| 6 | **Instant-pricing guardrails** | Hidden/disabled until Slices 1–3 stable |

**Hidden from MVP users:** atom-level schema editing, channel jargon, deep branching/rules engines.

---

## UX model (target)

- **Public:** single clean progressive flow; default path automatic; no giant forms.
- **Lead Review:** one-page triage + missing info + next action + quote CTA.
- **Quote start:** one obvious action; same semantics everywhere.
- **Missing info:** grouped gaps with fix affordances.
- **Settings:** presets first, power settings buried.

---

## Architecture alignment (code)

| Action | Location |
|--------|----------|
| **Keep** | `ingest-lead.ts`, `promote-to-quote.ts`, `lead-readiness-heuristics.ts`, `lead-commercial-progress.ts`, `quote-readiness.ts`, channel adapters |
| **Consolidate** | `default-intake-form.ts`, `public-lead-actions.ts`, `intake-form-renderer.tsx`, settings split (`intake-forms` vs `public-request-settings`) |
| **Reframe** | UX copy: “intake paths/templates”, “Lead Review”, instant-quote as future guarded automation |
| **Deprecate** | Lead-origin `createQuoteDraft` bypass; conflicting lifecycle semantics |
| **Do not touch yet** | Lead/quote spine redesign, competing intake systems, workstation-wide redesign, form-builder expansion, instant pricing |

Canonical code map also in [`docs/source-of-truth-map.md`](../source-of-truth-map.md) (Commercial pipeline).

Schema posture: do not redesign the lead/quote spine or create a competing intake system. Additive schema work is allowed when it supports approved canon-owned facts, such as `LeadVisitRequest` lifecycle, access snapshot, outcome, next action, and audit, with explicit approval.

---

## Implementation slices (5 only)

There are **five active slices**. No sixth slice in the current roadmap.

### Slice 1: Default intake reliability + canon cleanup

- **Goal:** Reliable default public intake; future-chain compatible; no hardcoded blockers.
- **Do not build:** Request Type Detail Packs, Intake/Scope Signal mapping, quote template filtering, auto line items, instant pricing, AI intake, complex rules builder.
- **Acceptance:** Net-new org can submit public intake without setup failure; synthetic default form id does not break submit; settings copy (e.g. submit button) reflected in UI.

### Slice 2: Lead Review decision surface

- **Goal:** Staff triage surface answers missing info + next action + quote path in one place.
- **Do not build:** new workflow engine, expanded workstation scope.

### Slice 3: Canonical Lead→Quote handoff

- **Goal:** All lead-origin quote starts use `promoteLeadToQuote` invariants.
- **Do not build:** auto-quote generation, pricing automation.

### Slice 4: Settings/template simplification

- **Goal:** Default-first settings; advanced options tucked away.
- **Do not build:** unconstrained custom form-builder UX.

### Slice 5: AI-ready intake projection

- **Goal:** Single derived DTO for future AI prompts from stored truth + deterministic derivations.
- **Do not build:** auto-apply AI, autonomous quoting.

### Post-stability future direction — not a slice

Future product context only (service/trade/complex depth, detail packs, signals). **Not** an implementation phase in the current roadmap.

---

## Prioritized decisions (approved)

1. One canonical lead-origin quote-start path (`promoteLeadToQuote`).
2. Default-first intake settings hierarchy; power settings hidden in MVP.
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
