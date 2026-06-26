# Quote clarification cleanup — Phase 0 / Phase 1 plan

> **Status:** Planning only — **no code, migrations, or model renames in Phase 0.**  
> **Canon:** [quote-clarification-canon.md](../canon/quote-clarification-canon.md)  
> **Prerequisite for:** [scope-clarification-execution-realignment.md](./scope-clarification-execution-realignment.md)

---

## Phase 0 deliverables (this document + canon)

- [x] Canon file: `docs/canon/quote-clarification-canon.md`
- [x] Index updates: `docs/canon/README.md`, `docs/source-of-truth-map.md`, `docs/canon/glossary.md`
- [x] Stale spec banner: `docs/specs/scope-clarification-schema-proposal.md`
- [x] Cross-link: `docs/canon/quote-truth-and-checkpoints.md`

**Exit criteria for Phase 1:** Canon merged, team agrees legacy compat rules for existing `QuoteScopeDecision` rows, single send-gate helper design approved.

---

## A. Canon doc changes (file list)

| File | Action |
|------|--------|
| **`docs/canon/quote-clarification-canon.md`** | **Created** — authoritative for this domain |
| **`docs/canon/README.md`** | Add index row + reading-order note after quote-truth |
| **`docs/source-of-truth-map.md`** | Add rows: quote send blockers, scope gaps, clarification answers, scope facts |
| **`docs/canon/glossary.md`** | Add Clarify Scope, scope gap, Selection (future); deprecate Scope Details Needed |
| **`docs/canon/quote-truth-and-checkpoints.md`** | Short § cross-link to clarification canon (pre-send working truth) |
| **`docs/canon/templates-and-execution-planning.md`** | One paragraph pointer: execution questions ≠ send blockers |
| **`docs/specs/scope-clarification-schema-proposal.md`** | Mark **superseded in part** — schema shipped; behavior canon lives in quote-clarification-canon |
| **`docs/plans/scope-clarification-execution-realignment.md`** | Update prerequisite: Phase 1 clarification cleanup complete |
| **`.cursor/rules/struxient-architecture.mdc`** | Optional: add `quote-clarification-canon.md` + helper row after Phase 1 |

### Canon sections (all in `quote-clarification-canon.md`)

1. Quote clarification truth model  
2. AI suggestion lifecycle  
3. Send readiness and blocker rules  
4. Customer-facing vs internal clarification  
5. Execution planning boundary  
6. Scope gap classification  
7. Future selections boundary  

---

## B. Existing code compatibility plan

**Principle:** compatibility layer first. No schema migration in Phase 1 unless blocking bug requires it (not expected).

### Model / field usage

| Artifact | Current role | Phase 1 compatibility strategy |
|----------|--------------|----------------------------------|
| **`QuoteScopeDecision`** | AI gap tracker + triage UI | Keep table. Stop user-facing panels. Rows created on Quick Scope apply remain loadable. New closes via Clarify apply + dismiss/defer actions inside Clarify—not standalone triage action. |
| **`QuoteLineClarification`** | Structured answers | **Keep as SoT** for structured facts. No change to storage shape. |
| **`ClarificationQuestionSet`** | Org library | **Keep.** Continue DB-backed sets + matching. |
| **`customerIncludedNotes` / `internalNotes`** | Projections + legacy text | **Keep** merge-on-apply. Stop duplicating Quick Scope `missingInfo` into internal notes (see item 7 below). Rename customer merge header in code when touching merge helper. |
| **`quoteImpact`** | Always `NONE` today | **Populate on new rows** where classification is known. **Legacy compat:** existing `OPEN` rows with `quoteImpact = NONE` remain **send-blocking** until explicitly dismissed/deferred/answered (conservative—prevents accidental send unblock on old quotes). Phase 2: backfill or reclassify via script with audit. |
| **`resolvedByClarificationId`** | Unused | **Wire on Clarify apply** when normalized title/question match closes a gap. Nullable; no migration. |
| **`resolutionTiming`** | Set only via old triage | Set via Clarify outcomes: defer → `EXECUTION`, dismiss → `NOT_NEEDED`, assumption → `ASSUMPTION`. |

### Readiness helpers — unify

| Helper | Today | Phase 1 target |
|--------|-------|----------------|
| **`evaluateQuoteSendReadiness`** | Blocks on `OPEN` count only | Block on **send-blocking gaps** via shared `countSendBlockingScopeDecisions()` |
| **`assertQuoteReadyToSendInTx`** | Same | Call shared counter |
| **`getQuoteWorkflowPresentation`** | Blockers use `openScopeDecisionCount` (OPEN+DEFERRED) | Use **same shared counter** as server; split display: required vs optional/deferred |
| **`getQuoteReadiness`** | Ignores gaps; always offers Send on draft | **Do not overload** with gap logic if avoidable—instead derive `canSend` from shared blocker helper in workflow presenter only, OR add optional `sendBlockers` input to readiness presentation |
| **`canSend` flag** | `primaryAction === SEND_QUOTE` | `canSend = sendBlockers.length === 0 && draft prerequisites met` |

**New file (recommended):** `apps/web/src/lib/quote/quote-send-blockers.ts`

```text
// Pure functions — unit tested
isSendBlockingScopeDecision(decision, { legacyTreatOpenNoneAsBlocking: true })
countSendBlockingScopeDecisions(decisions)
buildQuoteSendBlockers(input) → { requiredCommercial, optionalInternal, ... }
evaluateQuoteSendReadiness(input) // consumes counts from above
```

**Legacy compat rule (critical):**

```text
isSendBlockingScopeDecision(d):
  if d.status !== OPEN: return false
  if d.quoteImpact === REQUIRED or d.quoteImpact === POSSIBLE: return true
  if d.quoteImpact === NONE and d.status === OPEN: return true  // legacy rows
  return false
```

After Phase 2 classification, flip legacy flag off per org or after backfill.

### Quick Scope apply path

| Step | Change |
|------|--------|
| Create line rows | **Keep** |
| Create `QuoteScopeDecision` from `missingInfo` | **Keep** internally for now |
| Write `missingInfo` bullets to `internalNotes` | **Stop** (or feature-flag `WRITE_LEGACY_MISSING_INFO_NOTES=1` for one release) |
| Expose Scope Details panel | **Remove** |

### Clarify apply path

| Step | Change |
|------|--------|
| Merge notes + upsert `QuoteLineClarification` | **Keep** |
| Match open scope decisions by normalized title / question label | **Add** `resolveMatchingScopeDecisionsForClarification(tx, ...)` |
| Set `resolvedByClarificationId`, status `RESOLVED`, timing null | **Add** |
| Do not resolve on partial/unknown answers for required questions | **Add** validation in apply action |

### Actions to deprecate (UI first, server later)

| Action | Phase 1 |
|--------|---------|
| `updateQuoteScopeDecisionAction` with `resolve` | Remove from UI; server rejects bare `resolve` without linked clarification OR migrate to admin-only |
| `QuoteScopeDetailsNeededQuoteSummary` / `LineSummary` | Remove from `quote-authoring-surface.tsx` |
| Inline Clarify hidden when gaps exist | **Invert:** Clarify always visible; badge shows count |

**Keep loading** `scopeDecisions` in `quote-work-surface-loader.ts` for Clarify modal + readiness until model merge is complete.

---

## C. Minimal Phase 1 code plan (ordered)

### Slice 1 — Readiness alignment (production risk first)

1. Add `quote-send-blockers.ts` with legacy compat rules + tests.  
2. Update `evaluateQuoteSendReadiness` / `assertQuoteReadyToSendInTx` to use it.  
3. Update `quote-work-surface-loader` + `getQuoteWorkflowPresentation` to use same helper for `openScopeDecisionCount` / blockers / `canSend`.  
4. Fix `canSend` so Send UI hidden/disabled when blockers exist.

**Files:** `quote-send-readiness.ts`, `quote-send-readiness.test.ts`, `quote-workflow-presenter.ts`, `quote-workflow-presenter.test.ts`, new `quote-send-blockers.ts`

### Slice 2 — Hide deprecated UI

1. Remove `QuoteScopeDetailsNeededQuoteSummary` + `QuoteScopeDetailsNeededLineSummary` from quote authoring surface.  
2. Always show **Clarify** on lines; add badge `Clarify (N)` when line has open blocking gaps (derived).  
3. Remove `ScopeDecisionManageHandling` from product surfaces (keep module for admin/debug if needed).  
4. Update copy in Clarify modal sections: Required / Optional / Suggested gaps.

**Files:** `quote-authoring-surface.tsx`, `quote-scope-decisions-panel.tsx` (trim exports or delete panel components), `quote-work-surface.tsx` if duplicated

### Slice 3 — Clarify owns gap closure

1. Add `resolveMatchingScopeDecisionsOnClarificationApply` in `quote-scope-decision-core.ts` or new `quote-clarification-gap-bridge.ts`.  
2. Call from `applyLineClarificationAnswersAction` after successful upsert.  
3. Add dismiss/defer/not-needed actions **inside Clarify modal** that call scoped server actions (wrap existing core with validation).  
4. Show AI suggested gaps in Clarify (read open `QuoteScopeDecision` rows for line + quote-wide).

**Files:** `quote-line-clarification-actions.ts`, `quote-line-clarify-scope-panel.tsx`, `quote-scope-decision-core.ts`

### Slice 4 — Stop duplicate notes + classify new gaps

1. Remove `missingInfo` section from `mapCommercialSuggestionToLineFields` (or gate behind env flag).  
2. When creating scope decisions from Quick Scope, set `quoteImpact` from simple classifier helper (keyword/heuristic v1—no ML).  
3. Pass unresolved decisions into Clarify on open (already partially done for AI).

**Files:** `quote-scope-suggestion-persist.ts`, `quote-scope-suggestions-apply-core.ts`, new `quote-scope-gap-classifier.ts`

### Slice 5 — Execution UX secondary

1. Rename draft execution toggle default label to **Plan work (internal)**.  
2. Collapse draft execution summary by default on quote tab (expand on interaction).  
3. Ensure execution AI `missingContext` opens Clarify but does not create scope decisions.

**Files:** `quote-line-draft-execution-inline-toggle.tsx`, `quote-line-draft-execution-panel.tsx`, `quote-authoring-surface.tsx`

### Slice 6 — Header rename (low risk copy)

1. Change `CLARIFICATION_CUSTOMER_HEADER` to `Confirmed scope:` in `clarification-scope-merge.ts` + tests.

---

## D. UX target

### Quote tab structure

```text
┌─ Quote readiness summary ─────────────────────────────┐
│ Required before send (N)                               │
│   • [blocker messages with Fix → Clarify]              │
│ Optional for job setup (M)                             │
│   • deferred execution / scheduling notes              │
└────────────────────────────────────────────────────────┘

┌─ Line items ──────────────────────────────────────────┐
│ [description] [Edit] [Clarify (N)] [Plan work ▾]      │
│   └─ collapsed internal execution summary              │
└────────────────────────────────────────────────────────┘
```

### Clarify modal

```text
┌─ Clarify scope — {line description} ──────────────────┐
│ Suggested gaps (AI)     [Dismiss] [Add to questions] │
│ Required before send    * questions                  │
│ Optional / internal       questions                  │
│                                                      │
│ [Suggest answers (AI)]                               │
│ [Save to quote]  [Not needed]  [Defer to execution]  │
└──────────────────────────────────────────────────────┘
```

### Do not expose

- Scope Details Needed  
- Manage handling  
- Resolve (standalone)  
- Apply (gap triage)  

---

## E. Test plan

| # | Test | File (suggested) |
|---|------|------------------|
| 1 | Quick Scope apply creates line; Scope Details panel not rendered | component test or guardrail script |
| 2 | AI `missingInfo` creates internal gap record (not note duplicate when flag off) | `quote-scope-suggestions-apply-tx.test.ts` |
| 3 | Required commercial OPEN gap blocks send | `quote-send-blockers.test.ts` |
| 4 | Scheduling preference gap (`resolutionTiming`, non-required) does not block | `quote-send-blockers.test.ts` |
| 5 | Execution-only deferred gap does not block | `quote-send-blockers.test.ts` |
| 6 | Clarify apply updates line notes + `answersJson` | existing `clarification-*` tests |
| 7 | Clarify apply resolves matching `QuoteScopeDecision` + sets `resolvedByClarificationId` | new integration test |
| 8 | Dismissed gap does not block send | `quote-send-blockers.test.ts` |
| 9 | Deferred gap does not block send; still listed under optional | workflow presenter test |
| 10 | `canSend` false when server would reject | `quote-workflow-presenter.test.ts` |
| 11 | Bare `resolve` action rejected or admin-only | `quote-scope-decision-core.test.ts` |
| 12 | Legacy quote with old OPEN/NONE decisions still loads; still blocks until cleared | loader smoke / fixture test |
| 13 | `getQuoteReadiness` + workflow blockers + server gate agree on count | cross-helper test |

**Fixtures:** Extend `prisma/seeds/journey-fixtures.ts` or add `quote-clarification-fixtures.ts` with: legacy OPEN NONE decisions, REQUIRED gap, DEFERRED execution gap, dismissed gap.

---

## F. Risks and non-goals

### Risks

| Risk | Mitigation |
|------|------------|
| Stale old `QuoteScopeDecision` rows block send forever | Clarify shows them as suggested gaps; dismiss/defer/save paths; optional admin bulk dismiss later |
| Accidental send unblock when switching to `quoteImpact`-only gate | Legacy compat: `NONE + OPEN` stays blocking until Phase 2 backfill |
| Hidden blockers (Send button active, server rejects) | Slice 1 aligns `canSend` with server |
| Breaking old quotes | Loaders unchanged; no delete; conservative blocking |
| Duplicate readiness logic | Single `quote-send-blockers.ts` |
| AI suggestions become truth | No auto-resolve without Save; no note duplication |
| Migrations too early | No schema Phase 1; wire existing fields only |
| Overbuilding selections | Canon documents future only; no Selection model in Phase 1 |

### Non-goals (explicit)

- No full material catalog  
- No inventory, POs, vendor pricing  
- No execution planning rebuild  
- No full schema rename (`QuoteScopeDecision` → `ClarificationItem`) without separate approval  
- No execution realignment from facts (Phase 3+ per existing plan)  
- No change to checkpoint / send / approval commercial immutability rules  

---

## Exact final recommendation

1. **Treat Phase 0 as done** once canon is indexed and team signs off legacy compat rule (`NONE + OPEN` remains blocking).  
2. **Implement Phase 1 in slice order:** readiness alignment → hide UI → Clarify gap closure → dedupe notes → execution de-emphasis.  
3. **Do not delete `QuoteScopeDecision`** in Phase 1; hide it and merge behavior into Clarify.  
4. **Do not migrate schema** until gap classification and backfill strategy are proven in production-like fixtures.  
5. **Phase 2 (later):** populate `quoteImpact` on all new AI gaps, backfill legacy rows, relax legacy compat flag, consider model rename canon.

---

**This is ready for a Cursor planning prompt** (Phase 1 Slice 1–2 implementation prompt, one slice per PR).

---

## Post-Phase 1 Option A operational note (reset-approved)

- This cleanup removes legacy compatibility behavior for older `QuoteScopeDecision` rows that were `OPEN` with `quoteImpact = NONE`.
- Before launch, if any stale development data exists, run a normal database reset/reseed workflow so quote fixtures are rebuilt under current classification rules.
- Seed data must recreate the baseline workspace records required for QA and development flows (owner user, organization/membership, admin/settings defaults, and clarification question sets).
- This plan does **not** run reset logic automatically in app code and does **not** add destructive runtime scripts.
