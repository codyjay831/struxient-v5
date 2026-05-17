# Guardrails Pass 3 — stabilization triage

> **Purpose:** Classify current **warn-only** guardrail findings before changing product code. Pass 2 added detectors so drift is **visible**; Pass 3 decides **what to do about each finding** without blindly “fixing warnings.”
>
> **Related:** [architecture-guardrails.md](./architecture-guardrails.md) · [task-payment-recovery-guardrails.md](./task-payment-recovery-guardrails.md) · [source-of-truth-map.md](./source-of-truth-map.md)

## How to run the inventory

From `apps/web/`:

```bash
npm run guardrails
```

Do **not** require `GUARDRAILS_STRICT=1` in normal development until warnings are triaged or allowlisted; strict mode is for CI tightening once the backlog is understood.

## Triage categories (pick one per finding)

| Category | Meaning | Typical action |
|----------|---------|----------------|
| **A — Legitimate intentional exception** | Behavior is correct; detector is too naive | Document in this file + optional narrow allowlist in the script |
| **B — Should be allowlisted** | Pattern is safe in this path (e.g. display-only partition) | Add path/pattern to script allowlist with one-line comment why |
| **C — Refactor later** | Real drift, but depends on an open product/architecture decision | Link decision; schedule refactor; do not “paper over” with allowlist without rationale |
| **D — Actual architecture bug** | Violates stored vs derived or duplicates source of truth | Fix soon; prefer canonical helper or single code path |

## Current inventory (as of Pass 2)

Re-run `npm run guardrails` after merges; line numbers may shift.

### 1. Payment status drift (`detect-payment-status-drift.mjs`)

**Where:** `apps/web/src/components/jobs/job-payment-manager.tsx` (typically 6 hits: active vs historical filters and similar string compares on `r.status`.)

**Context:** The job page already receives `effectivelyDueRequirementIds` from the server (good). The client still partitions “active” vs “historical” rows using raw `"DUE"` / `"PENDING"` / `"PAID"` / etc. That is **display partitioning**, not the same as operational due-ness (`isPaymentEffectivelyDue`), but it is still easy for a future edit to drift from enum reality.

**Overlapping product decision (do not skip):**

- Today, **payment holds** are surfaced in UI (`deriveTaskPaymentHold`, badges) while **`deriveTaskState` / `completeJobTaskAction` do not enforce payment gates.** Canon ([I9 — Payment schedule as signal provider](./canon/invariants-and-decision-rules.md)) points at money as a first-class gate; the code path for **signals** on paid/waived exists in `job-payment-actions.ts`.
- Before “fixing” the six warnings, decide: **display-only** vs **block task completion** when an effectively due requirement exists. That decision drives whether refactors are **C** (wait) or **D** (fix).

**Suggested triage rows (fill in after review):**

| Hit (approx.) | Provisional category | Notes |
|-----------------|----------------------|--------|
| Active filter (`DUE` / `PENDING`) | C or B | If product stays display-only, consider `JobPaymentRequirementStatus` enum + comment; or allowlist this file with rationale |
| Historical filter (`PAID` / …) | B or A | Often safe display bucketing; still prefer enum for consistency |
| Other compares | ? | Re-check each line after re-run |

### 2. Corrections stage literal (`detect-corrections-constant-drift.mjs`)

**Where:**

- `apps/web/src/app/(workspace)/jobs/job-issue-actions.ts` — local `CORRECTIONS_STAGE_NAME = "Corrections"`
- `apps/web/src/app/(workspace)/jobs/recovery-actions.ts` — same

**Context:** Canonical constant lives in `job-payment-readiness.ts` as `CORRECTIONS_STAGE_NAME` (used for payment main-path vs recovery stage logic). Duplicated literals risk rename skew.

**Suggested triage:**

| File | Provisional category | Notes |
|------|----------------------|--------|
| `job-issue-actions.ts` | **C — Refactor later** (low risk) | Mechanical: import shared constant; small diff when touching issues |
| `recovery-actions.ts` | **C — Refactor later** | Same |

**Avoid** allowlisting without comment unless you explicitly want three sources of truth for the string.

## After triage is recorded

1. Update this doc’s tables with **final** category (A–D) and owner/date.
2. If **B:** patch the detector allowlist in `scripts/guardrails/detect-*.mjs` and add one line in [architecture-guardrails.md](./architecture-guardrails.md) under Automated guardrails.
3. If **C:** open a ticket or canon note for the product decision; link it here.
4. If **D:** implement fix in a dedicated PR; re-run `npm test`, `npm run lint`, `npm run guardrails`.

## Cursor prompt (copy when ready for Pass 3 execution)

Use when you want implementation work, not just documentation:

> Read `docs/guardrails-pass3-triage.md`. For each open finding, apply the recorded category. For category B, update the guardrail script allowlist with a comment. For category C tied to payment gates, do not change `completeJobTaskAction` until product direction is explicit. For category D, fix with canonical helpers and tests. Run `npm test`, `npm run lint`, and `npm run guardrails` (non-strict).

---

*Created 2026-05-16 — Guardrails Pass 3 triage template.*
