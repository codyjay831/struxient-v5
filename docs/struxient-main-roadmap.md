# Struxient v5 Main Roadmap

> **Purpose:** Single planning document for **what to work on next** in Struxient v5.  
> **Not:** An implementation spec, sprint plan, or duplicate of canon.  
> **Last consolidated:** 2026-05-18 (from repo docs, guardrails, and code comments).

---

## Current Status

**Execution Durability Phase 2 MVP is complete on `main`** (per product/engineering sign-off):

- **Slices 1–6** shipped: derived **job execution health** (`job-execution-health.ts`), recovery/override durability, Workstation integration (health on work items), task completion gates aligned with `deriveTaskState`, manager override with issue guard (not full force-with-ack).
- **Fix pass** done after slice merge.
- **Payment hard-blocking (Slice 7)** was **intentionally deferred** — money is **attention-only** in completion paths today (`PAYMENT_ATTENTION_ONLY` warning in execution health; `completeJobTaskAction` does not gate on payment).
- **Workstation pruning (Slice 5B)** deferred — do not demote/hide task cards until QA confidence.
- **Force-with-ack override** deferred — basic manager override exists; audited acknowledgment flow does not.
- **TaskWorkSurface health header** deferred — job banner exists behind `EXECUTION_HEALTH_BANNER`; task-level health copy not surfaced.
- **Unit tests** exist for readiness, payments, recovery, execution health (`npm test`); **E2E / Playwright** and broad integration coverage remain optional/future.

The app is **pre-launch**. Prefer **clean architecture**, **canonical helpers**, and **product clarity** over legacy preservation or speculative features.

**Note:** Formal “Execution Durability” slice write-ups are not in `docs/`; slice numbering appears in code comments (`Slice 1`, `Slice 5`, etc.). This roadmap uses team context plus repo evidence.

---

## Priority 1 — Slice 7: Payment Hard-Blocking Decision + Implementation

**Status:** Not implemented. **Do not code until product sign-off.**

### Current behavior

- `JobPaymentRequirement.status` is stored; **effective due-ness** is derived via `isPaymentEffectivelyDue()` / `getUnsettledEffectivelyDueRequirements()` (`job-payment-readiness.ts`).
- Workstation and job UI surface **payment attention**; `deriveTaskPaymentHold()` can show holds on tasks.
- **`completeJobTaskAction` does not block** on effectively due payments — only issues, signals, and proof (`job-task-actions.ts`).
- Execution health emits `PAYMENT_ATTENTION_ONLY`: “completion not blocked yet” (`job-execution-health.ts`).
- Paid/waived actions can publish **`payment-cleared`** signals (`job-payment-actions.ts`); tasks may `requiresSignals` on those names — but completion is not hard-gated today.

### Product decision required (choose before implementation)

| Option | Meaning |
|--------|---------|
| **A. Hard blockers** | Selected requirements block task completion (and possibly activation transitions) when effectively due. |
| **B. Attention-only** | Keep today’s model; payments visible in Workstation/job but never block DONE. |
| **C. Configurable per requirement** | Org or per-`JobPaymentRequirement` flag: attention vs hard gate. |

**Canon tension:** [I9 — Payment schedule as Signal provider](./canon/invariants-and-decision-rules.md) and [domains-and-boundaries § payments](./canon/domains-and-boundaries.md) describe payment **gates** as readiness constraints. Code deliberately lags canon until Slice 7 — **not a bug**, a **deferred product choice** ([guardrails-pass3-triage.md](./guardrails-pass3-triage.md)).

### Recommended next step

1. **Product decision** (A / B / C) with examples (deposit before mobilization, milestone before stage, final balance).
2. **Short implementation plan** (not this doc): wire gate in one completion path, extend tests, update guardrail triage for payment status drift.
3. **Then** implement in a focused PR.

### Likely touch areas (when approved)

| Area | Role |
|------|------|
| `apps/web/src/lib/job-payment-readiness.ts` | Due-ness, holds, promotion PENDING→DUE |
| `apps/web/src/app/(workspace)/jobs/job-task-actions.ts` | `completeJobTaskAction` gate |
| `apps/web/src/components/jobs/task-work-surface.tsx` | Blocked copy, actions |
| `apps/web/src/lib/job-execution-health.ts` | `PAYMENT_ATTENTION_ONLY` → blocker states |
| `apps/web/src/lib/workstation-query.ts` | Job/task attention consistency |
| `apps/web/src/lib/task-readiness.ts` | Only if payment becomes a derived task state (prefer payment check at completion write) |
| Tests | `job-payment-readiness.test.ts`, `job-execution-health.test.ts`, new completion integration tests |
| Docs | [task-payment-recovery-guardrails.md](./task-payment-recovery-guardrails.md), [guardrails-pass3-triage.md](./guardrails-pass3-triage.md) |

---

## Priority 2 — Manual QA of Execution Durability

Validate Phase 2 behavior end-to-end before more UX or Workstation churn.

| Flow | What to verify |
|------|----------------|
| Normal task completion | `completeJobTaskAction` → DONE, signals published, activity logged |
| Checklist / proof completion | `validateTaskCompletionReadiness` rejects incomplete proof |
| Issue blocks task | Open `BLOCKS_WORK` issue → `BLOCKED_BY_ISSUE` |
| Recovery path active | Recovery tasks visible; main path blocked appropriately |
| Recovery complete → Resume | `resolveIssueAndResumeAction` / `resume` mode completes flow |
| Unsafe override rejected | Override blocked when open `BLOCKS_WORK` issue on task/stage |
| Signal-blocked task | Appears in Workstation **waiting** lens (`lens: "waiting"` when `BLOCKED_BY_SIGNAL`) |
| Activation blocked | Quote with missing stage / hard orphan signal → activation error |
| Payment attention-only | Due payment shows attention; completion still allowed until Slice 7 |
| Manager override | Signal-blocked task can override when no blocking issue |
| Execution health banner | Set `EXECUTION_HEALTH_BANNER=1` — banner copy sane, not alarming |

Use journey seed data (`docs` + `prisma/seeds/journey-fixtures.ts`) for roof signal handshake and bathroom approved-not-activated quotes.

---

## Priority 3 — Execution Health UX Polish

| Item | Notes |
|------|--------|
| **TaskWorkSurface health header** | Deferred; surface `deriveJobExecutionHealth` headline/detail on task work surface without duplicating job banner noise |
| **Blocked-state copy** | Align task card, work surface, and health `blockers[]` labels |
| **Recovery / resume copy** | “Resume original path” vs “Resolve issue” — consistent with `resolve-job-issue-core` modes |
| **Job health banner copy review** | `JobExecutionHealthBanner` is “preview”; tune headline/detail for field users |
| **`EXECUTION_HEALTH_BANNER` production decision** | Env flag in `job-execution-health.ts` — default off; decide on-by-default for launch |
| **Avoid noisy/scary health** | Prefer actionable next step over invariant jargon |

---

## Priority 4 — Workstation Refinement

**Rule:** [workstation-canon.md](./canon/workstation-canon.md) — attention cockpit, not a second workflow engine ([workstation-guardrails.md](./workstation-guardrails.md)).

| Item | Notes |
|------|--------|
| **Keep cockpit discipline** | Extend `queryWorkstationWorkItems` / `rank()` — do not fork editors under `components/workstation/` |
| **Health chips/cards after QA** | Slice 5 wired health into work items; evaluate signal-to-noise post–Priority 2 QA |
| **Slice 5B pruning (deferred)** | Demote redundant task cards only after confidence — risk hiding real work |
| **Waiting lens** | Tasks `BLOCKED_BY_SIGNAL` → `waiting` lens; improve copy and grouping |
| **Known drift (documented, not urgent)** | Task `isBlocked` from task state only; job-level payment blocking separate ([workstation-guardrails.md](./workstation-guardrails.md)) |
| **Legacy UI retirement** | [DELETION-legacy-lead-ui.md](./tickets/DELETION-legacy-lead-ui.md) — inbox split, lead popup, `HandoffPanel` after `LeadCommercialSurface` stable |
| **Browse vs lenses** | [workstation-ia-ui-note.md](./workstation-ia-ui-note.md) — Jobs/Schedule may split from `/workstation/*` later; not frozen |

---

## Priority 5 — Lead / Public Intake Simplification

**Canon:** [experience-canon-lead-to-workstation.md](./canon/experience-canon-lead-to-workstation.md) — intake is the first impression; Lead → Quote → Signed → Activate Job must stay obvious.

| Item | Notes |
|------|--------|
| **Reduce duplicate customer/address/contact friction** | Lead attach/create customer, service location from lead, match hints — simplify UX paths |
| **One service address model** | `resolveServiceLocationSnapshotFromFormData`, lead `address` JSON, customer service locations |
| **Public intake clarity** | `/request/[companySlug]`, default intake form, `formSnapshot` on ingest |
| **Quote action on lead workspace** | `LeadCommercialSurface` / `getLeadCommercialProgress` — “start quote” should feel attached to lead, not orphaned |
| **Intake Composer / atoms** | Dynamic forms per canon; balance power vs simple path for small jobs |
| **License enrichment (optional)** | [specs/contractor-license-enrichment.md](./specs/contractor-license-enrichment.md) — Phase 1–4 spec exists; schema approval needed for license fields |
| **Rate limiting** | `public-lead-actions.ts` TODO: per-IP/slug rate limit when traffic warrants |

**Recent fix area:** `createLeadAction` must not catch `redirect()` (NEXT_REDIRECT) — leads save but error UI shows if unfixed.

---

## Priority 6 — Test Hardening / Guardrails

| Item | Status |
|------|--------|
| Workstation waiting lens + task card regression | Optional — no dedicated test file found |
| Activation transaction + `publishSignal` integration | Optional — activation logic in `quote-job-activation-actions.ts` |
| `completeJobTaskAction` integration coverage | Optional — unit tests cover helpers; not full action/DB path |
| Guardrail: direct `DONE` writes | **Not built** — only readiness-import drift detector today |
| Execution health edge cases | Partial — `job-execution-health.test.ts` exists; expand as bugs found |
| `npm run guardrails` strict mode | [architecture-guardrails.md](./architecture-guardrails.md) — tighten CI when triage complete |
| Corrections constant drift | [guardrails-pass3-triage.md](./guardrails-pass3-triage.md) — import `CORRECTIONS_STAGE_NAME` from shared module |
| Payment status string drift | Triage **C** until Slice 7 decision — `job-payment-manager.tsx` display partitions |

---

## Deferred / Needs Product Decision

Explicitly **not missed work** — parked until decided:

| Item | Why deferred |
|------|----------------|
| **Slice 7 — payment hard-block** | Requires product sign-off (Priority 1) |
| **Force-with-ack override** | Basic override shipped; audited ack + expanded policy not |
| **Skip task** | No first-class “skip” — would need canon + signal/retraction rules |
| **Reopen issue** | Resolve is one-way for standard flow; reopen not specified |
| **Revert DONE → TODO / signal retraction** | `retractSignal` exists; `updateJobTaskStatusAction` comment: retraction on revert **not implemented v1** |
| **Workstation pruning 5B** | Hide/demote cards until QA |
| **Payment gate configurability** | Depends on Slice 7 option C |
| **Production `EXECUTION_HEALTH_BANNER`** | Env-gated preview |
| **Legacy lead inbox / HandoffPanel** | [DELETION-legacy-lead-ui.md](./tickets/DELETION-legacy-lead-ui.md) |
| **Stripe / QBO / invoicing** | [locked-decisions-v1.md](./canon/locked-decisions-v1.md) phase 2; `/payments` page “future systems” stub |
| **Customer portal depth** | Link-first v1; password optional later |
| **E-sign vendor** | Legal/jurisdiction ([build-concerns-risks-and-gaps.md](./build-concerns-risks-and-gaps.md) A4) |
| **Change orders** | Commercial spine + portal shipped; **execution delta architecture** canon locked — schema approval + Pass 2 apply refactor ([change-order-canon.md](./canon/change-order-canon.md)) |
| **Tasks route stub** | `/tasks` page says runtime task graph deferred — misleading vs real `JobTask` (cleanup when routing IA settles) |

---

## Wishlist / Later Ideas

Lower priority; from canon, specs, or code comments — **not scheduled**:

| Idea | Source hint |
|------|-------------|
| AI-assisted repair / recovery suggestions | `recovery-flow-builder.tsx` review-then-apply pattern; extend AI secretary |
| Richer execution health explanations | Deeper blocker narratives, links to proof/checklist |
| PM / job-flow surface | Canon “flexibility” — no dedicated PM board in v5 yet |
| Job health dashboard | Owner-level roll-up across jobs (canon workstation themes) |
| Company operating profile → task generation | Template/preset specialization per org trade |
| Deeper Workstation preferences | Role feeds exist (`workstation/role-feeds.ts`); persona toggles in canon |
| Public intake builder improvements | Intake Composer, conditional visibility |
| Contractor license enrichment | [specs/contractor-license-enrichment.md](./specs/contractor-license-enrichment.md) |
| Work priority views (SLA, customer tier) | [workstation-canon.md](./canon/workstation-canon.md) |
| Playwright E2E for quote→job spine | [build-concerns-risks-and-gaps.md](./build-concerns-risks-and-gaps.md) R2 |
| Separate Browse Jobs/Schedule routes | [workstation-ia-ui-note.md](./workstation-ia-ui-note.md) |
| Offline writes / native apps | [locked-decisions-v1.md](./canon/locked-decisions-v1.md) §12 |
| Reporting / job costing | Phase 2 locked |
| `NEXT_PUBLIC_USE_LEAD_COMMERCIAL_SURFACE` rollout | [feature-flags.ts](../apps/web/src/lib/feature-flags.ts) |

---

## Not Now / Guardrails

Do **not** start without explicit approval or product decision:

| Avoid | Why |
|-------|-----|
| Giant persisted state machine for readiness | Derived helpers are source of truth ([source-of-truth-map.md](./source-of-truth-map.md)) |
| AI autopilot mutating execution without review | Canon: review-then-apply |
| Payment hard-block in code before Slice 7 sign-off | Intentional deferral |
| Aggressive Workstation 5B pruning before QA | Hides work |
| Schema changes without approval | `.cursor/rules/no-schema-without-approval.mdc`, `ALLOW_SCHEMA=1` |
| Force-with-ack before basic override stable in field | Policy + audit design first |
| Replacing signal-based execution model | Core v5 architecture ([canon/signals.md](./canon/signals.md)) |
| Duplicate work surfaces per route | Reuse `components/work-surfaces/*`, `task-work-surface.tsx` |
| Raw payment `status === "DUE"` for gating | Use `isPaymentEffectivelyDue` |
| Third issue/recovery pattern | [task-payment-recovery-guardrails.md](./task-payment-recovery-guardrails.md) |

---

## Source Notes

| Source | Contributed to roadmap |
|--------|----------------------|
| **Team context (conversation)** | Phase 2 Slices 1–6 complete; Slice 7, 5B, force-with-ack, task health header deferred |
| [task-payment-recovery-guardrails.md](./task-payment-recovery-guardrails.md) | Canonical modules; payment attention vs completion; recovery modes |
| [guardrails-pass3-triage.md](./guardrails-pass3-triage.md) | Payment gate decision before drift fixes; triage categories |
| [workstation-guardrails.md](./workstation-guardrails.md) | Cockpit rules; known drift risks |
| [workstation-canon.md](./canon/workstation-canon.md) | Lenses, waiting, role slices |
| [workstation-ia-ui-note.md](./workstation-ia-ui-note.md) | Browse/lens wiring temporary |
| [architecture-guardrails.md](./architecture-guardrails.md) | Automated guardrails list |
| [source-of-truth-map.md](./source-of-truth-map.md) | Stored vs derived map |
| [build-concerns-risks-and-gaps.md](./build-concerns-risks-and-gaps.md) | Risks, build order, integrations phase 2 |
| [canon/invariants-and-decision-rules.md](./canon/invariants-and-decision-rules.md) | I9 payment signals; I10 Workstation |
| [canon/locked-decisions-v1.md](./canon/locked-decisions-v1.md) | Phase 2 integrations, offline, reporting |
| [tickets/DELETION-legacy-lead-ui.md](./tickets/DELETION-legacy-lead-ui.md) | Legacy UI retirement schedule |
| [specs/contractor-license-enrichment.md](./specs/contractor-license-enrichment.md) | Wishlist enrichment feature |
| `apps/web/src/lib/job-execution-health.ts` | Health states, `PAYMENT_ATTENTION_ONLY`, banner flag |
| `apps/web/src/app/(workspace)/jobs/job-task-actions.ts` | Completion gates; override; revert/signal gap |
| `apps/web/src/lib/job-task-override-guard.ts` | Issue guard on override |
| `apps/web/src/lib/workstation-query.ts` | Slice 5 health; waiting lens |
| `apps/web/src/components/jobs/job-execution-health-banner.tsx` | Slice 1 banner preview |
| `apps/web/src/app/(workspace)/payments/page.tsx` | Deferred money systems UI |
| `apps/web/src/app/(workspace)/tasks/page.tsx` | Stale “task system deferred” stub |
| `apps/web/src/app/(workspace)/jobs/[jobId]/page.tsx` | Stale “read-only tasks” copy |
| `scripts/guardrails/*` | Drift detectors; no DONE-write guard yet |
| `prisma/seeds/journey-fixtures.ts` | QA fixtures for lead→job spine |

---

*Maintainers: Update this file when priorities shift. Link PRs to sections instead of duplicating canon.*
