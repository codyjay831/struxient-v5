# Quote clarification, scope gaps, and send readiness (v5)

> **Status:** Canon — **Phase 0** (2026-06-25). Governs quote-time scope clarification, AI suggestions, send blocking, and execution-planning boundaries. Complements [quote-truth-and-checkpoints.md](./quote-truth-and-checkpoints.md), [templates-and-execution-planning.md](./templates-and-execution-planning.md), and [business-profile-and-ai-context-canon.md](./business-profile-and-ai-context-canon.md).
>
> **Implementation:** See [quote-clarification-cleanup-phase0-1.md](../plans/quote-clarification-cleanup-phase0-1.md).

## Authoritative positioning

**Clarify Scope** is the only user-facing path from an unresolved quote gap to **confirmed quote truth**.

AI may **suggest** gaps, answers, line items, and draft execution tasks. AI suggestions are **not** truth until a human explicitly confirms through the appropriate review-and-apply surface.

**Scope Details Needed** is **deprecated** as user-facing product vocabulary. Do not ship new UI, copy, or workflows under that name.

The internal persistence model `QuoteScopeDecision` may remain during cleanup as a **compatibility / gap-tracking record**. It must be merged into Clarify Scope behavior—not exposed as a parallel workflow.

---

## 1. Single truth path

### What counts as quote truth

Confirmed quote truth lives in:

| Layer | Location | Role |
|-------|----------|------|
| **Structured answers** | `QuoteLineClarification.answersJson` | Canonical structured facts per line + question set |
| **Customer projection** | `QuoteLineItem.customerIncludedNotes` (and related customer scope fields) | What may appear on the customer proposal |
| **Internal projection** | `QuoteLineItem.internalNotes` | Staff-only scope context |
| **Commercial row** | `QuoteLineItem.description`, qty, price, customer scope fields | What the customer is buying |

Rendering clarification answers into note fields is a **projection** of structured answers, not a second source of truth. Re-apply must remain idempotent (see `clarification-scope-merge.ts`).

### AI suggestion lifecycle

AI-generated gaps, answers, and scope text are **proposals** until confirmed.

Every suggested gap must end in exactly one of:

| Outcome | Meaning | Send impact (default) |
|---------|---------|----------------------|
| **Accepted into Clarify Scope** | Becomes a structured question or promoted required gap | Blocks send only if classified **required commercial** |
| **Answered and saved** | Clarify Scope apply writes structured + projected truth | Clears matching required gap |
| **Dismissed — not needed** | Explicit human decision with audit | Does not block send |
| **Deferred to execution** | Internal planning input; not a customer obligation | Does not block send |
| **Internal-only note** | Staff context; not customer-facing | Does not block send |
| **Future: Selection** | Product/finish/model choice on the line (not built in this cleanup) | Blocks send only when required for price/terms |

**Must not:** persist AI `missingInfo` strings as send-blocking records without individual human promotion or classification.

**Must not:** treat Quick Scope apply checkbox selection as confirmation of every nested `missingInfo` item—only selected commercial rows are confirmed; gaps require explicit downstream handling in Clarify Scope.

---

## 2. Scope Details Needed deprecation

### User-facing

- Remove or hide **Scope Details Needed** panels, **Manage handling**, and gap-level **Apply** / **Resolve** triage from the quote tab.
- Do not use **Apply** for metadata-only gap closure anywhere the user expects quote scope to change.
- Prefer **Clarify**, **Save to quote**, **Dismiss**, **Not needed**, **Defer to execution**.

### Internal model (`QuoteScopeDecision`)

Keep the model for now. Treat rows as **internal gap records** that Clarify Scope owns behaviorally:

- Created by Quick Scope, manual staff entry, or future flows—not shown as a separate product surface.
- Closed only through Clarify apply (answered), explicit dismiss, or explicit defer—not through “Resolve” with no truth captured.
- Linked to clarifications via `resolvedByClarificationId` when answers satisfy a gap.

**Do not delete** the model in Phase 1 unless a repo audit proves zero production dependency beyond the paths documented in the implementation plan.

---

## 3. Send gating rule

A **draft quote** may be sent only when **required commercial quote gaps** are resolved and existing commercial send prerequisites are met (line items, jobsite, payment schedule—see `quote-send-readiness.ts`).

### Required commercial gaps (block send)

Unresolved gaps that affect:

- Price or quantity basis
- Included work
- Excluded work
- Customer obligations
- Material/product choice **required for the quote**
- Warranty or risk language
- Legal or customer-facing quote terms

Implementation signal: `QuoteScopeDecision.quoteImpact = REQUIRED` or `POSSIBLE` with `status = OPEN`.

### Must NOT block send (default)

- Scheduling preference (“customer available after 3pm”)
- Pure execution planning input (crew, photos, internal task prep)
- Optional office note
- Future job setup task
- Non-price site condition unless explicitly marked required
- AI suggestion not yet promoted to required clarification
- Gap explicitly **deferred to execution** or **dismissed**

### Single derived gate

**Must:** one canonical derived helper owns “can this quote be sent?” UI and server must call the same rules.

- **Canonical location (target):** `evaluateQuoteSendReadiness()` / `assertQuoteReadyToSendInTx()` in `apps/web/src/lib/quote/quote-send-readiness.ts`, fed by a shared blocker builder also consumed by `getQuoteWorkflowPresentation()`.
- **Must not:** `getQuoteReadiness()` offering Send while workflow blockers or server send gate disagree.

---

## 4. Resolve-without-truth is forbidden

**Resolve** must not mean “close ticket.”

For **required commercial** gaps, clearing send blockage requires one of:

1. **Answered through Clarify Scope** and saved to quote (structured + projection)
2. **Dismissed** as not applicable (audited; `DISMISSED` / `NOT_NEEDED`)
3. **Deferred to execution** with non-blocking classification (`DEFERRED` / `EXECUTION`)
4. **Documented assumption** (`RESOLVED` / `ASSUMPTION`) — internal only; must not invent customer-facing scope text silently

**Must not:** expose a standalone **Resolve** action that sets `QuoteScopeDecision.status = RESOLVED` without one of the above and without writing quote truth when the gap was customer-facing or price-bearing.

---

## 5. AI boundary

AI **may**:

- Suggest line items (Quick Scope capture)
- Suggest possible missing facts
- Suggest clarification answers and question sets
- Suggest draft execution tasks

AI **must not** silently create canonical quote truth.

Human confirmation is required before:

- Customer-facing scope changes are persisted as commitment-oriented fields
- Send readiness is cleared for a required gap
- Execution tasks are created from uncertain scope (quote-line AI must remain review-then-apply; see execution-engine canon)
- Customer obligations or exclusions are added

All AI outputs in this domain follow **review-then-apply** ([invariants-and-decision-rules.md](./invariants-and-decision-rules.md), architecture guardrails).

---

## 6. Clarify Scope ownership

Clarify Scope owns:

| Concern | Owner |
|---------|--------|
| Structured quote questions | `ClarificationQuestionSet` + `ClarificationQuestion` |
| Per-line answers | `QuoteLineClarification.answersJson` |
| Customer-facing scope detail projection | Merge into `customerIncludedNotes` under controlled header |
| Internal clarification notes | Merge into `internalNotes` under controlled header |
| Required vs optional gap status | Gap classification + readiness helper (not ad-hoc UI) |
| Closing matching internal gap records | On apply: wire `resolvedByClarificationId`, set terminal status |

Clarify Scope **does not** own draft execution tasks, payment schedule, or checkpoint creation.

### Customer-facing vs internal

- Each clarification question carries `customerFacing`.
- Customer-facing answers project to proposal-oriented fields only through controlled merge helpers.
- Internal-only answers must not leak into customer checkpoint payloads.

Rename projection header **away from** “Scope details:” in implementation (canon phrase: **“Confirmed scope:”** or **“Included details:”**) to avoid collision with deprecated “Scope details needed” language.

---

## 7. Execution planning boundary

Draft execution (`QuoteLineExecutionTask`) is allowed during quote drafting. It is **internal operational intent**, not customer commitment—[templates-and-execution-planning.md](./templates-and-execution-planning.md), [quote-truth-and-checkpoints.md](./quote-truth-and-checkpoints.md).

- **Add draft execution** may remain on the quote tab but must be **visually secondary**, labeled internal (e.g. “Plan work (internal)”).
- Execution planning questions must not block quote send unless they also affect commercial scope, price, exclusions, or customer obligations.
- Unresolved execution `missingContext` from AI plans must not create send-blocking gap rows by default.
- Future realignment from clarified facts → execution proposals remains **proposal-only**—[scope-clarification-execution-realignment.md](../plans/scope-clarification-execution-realignment.md).

---

## 8. Scope gap classification

Use this taxonomy for prompts, UI grouping, and `quoteImpact` / `resolutionTiming` assignment:

| Class | Examples | Default send block | Default customer visibility |
|-------|----------|-------------------|------------------------------|
| **Commercial scope** | SF to replace, baseboard inclusion, transitions | Yes if price/terms depend on it | Often yes |
| **Material / selection** | Flooring product, shingle color | Yes if required for quote | Often yes |
| **Customer decision** | Choose option A vs B before quote final | Yes | Yes |
| **Internal office decision** | Which crew approach internally | No | No |
| **Execution planning input** | Photo checklist, internal prep | No | No |
| **Scheduling preference** | “After 3pm”, preferred week | No | No |
| **Site condition** | Subfloor condition | Only if affects price/warranty/terms | Case-by-case |

Reset-approved cleanup path: do not preserve old `OPEN + quoteImpact = NONE` compatibility behavior; classification must mark blocking gaps as `REQUIRED`/`POSSIBLE` at creation time.

---

## 9. Selections boundary (future — not this cleanup)

Document direction only:

- Lightweight **Selections** on quote line items: label, chosen value, required flag, customerFacing.
- Examples: flooring product, fixture model, paint color.
- **Avoid in this cleanup:** inventory, vendor pricing, purchase orders, takeoffs, supplier catalogs, full material system.

Selections are not clarifications. A product choice may spawn both a Selection row and zero or one clarification answers.

---

## 10. Relationship to other canon

| Document | Relationship |
|----------|--------------|
| [quote-truth-and-checkpoints.md](./quote-truth-and-checkpoints.md) | Checkpoints capture commercial proof at send; clarifications feed the working quote before send |
| [sales-site-visit-canon.md](./sales-site-visit-canon.md) | Visit facts inform quotes via review-then-apply only |
| [execution-engine-canon.md](./execution-engine-canon.md) | Draft execution vs activation; AI review-then-apply |
| [workspace-ux-canon.md](./workspace-ux-canon.md) | Quote tab IA; no breadcrumbs; vocabulary lock |

---

## Discouraged vs preferred vocabulary

| Avoid (user-facing) | Prefer |
|---------------------|--------|
| Scope Details Needed | **Clarify** / **Quote needs clarification** |
| Manage handling | *(inside Clarify modal only)* |
| Resolve (standalone on gaps) | **Save to quote**, **Dismiss**, **Defer to execution** |
| Apply (on gap triage) | **Save to quote** (Clarify only) |
| Scope details: (customer header) | **Confirmed scope:** or **Included details:** |

---

*Canon created 2026-06-25: Phase 0 quote clarification truth model, AI lifecycle, send gating, execution boundary, selections direction.*
