# Workstation guardrails

> **Canon:** [workstation-canon.md](./canon/workstation-canon.md) · **Experience:** [experience-canon-lead-to-workstation.md](./canon/experience-canon-lead-to-workstation.md) · **Invariant:** [I10 — Workstation is action-first](./canon/invariants-and-decision-rules.md)

## Purpose

The Workstation answers: **“What should I pay attention to or do next?”**

It is the **operational cockpit**—high situational awareness, low hunting, emphasis on **now**, **next**, and **blocked**. It is **not** a replacement for every deep record page, but it **must not** become a second workflow engine with its own rules.

## Canonical implementation

| Concern | Location |
|---------|----------|
| Work item aggregation | `apps/web/src/lib/workstation-query.ts` — `queryWorkstationWorkItems()` |
| Lane ranking | `apps/web/src/lib/workstation/rank.ts` |
| Role-based feeds | `apps/web/src/lib/workstation/role-feeds.ts` |
| URL state (lens, filter, selection) | `apps/web/src/lib/workstation/url-state.ts` |
| Shared next-action model | `apps/web/src/lib/record-workflow-surface.ts` |
| Primary route | `apps/web/src/app/(workspace)/workstation/page.tsx` |
| Shell UI | `apps/web/src/components/workstation/` |

## Lanes and lenses (implementation)

Work items carry:

- **`lane`:** `critical` | `due` | `upcoming` | `watch` (via `rank()`)
- **`lens`:** `attention` | `today` | `waiting` | `upcoming` | `all`
- **`group`:** e.g. `blocked`, `active`, `investigate`, `scheduled`

**Do not** invent a parallel priority system in a new component—extend `queryWorkstationWorkItems` and `rank()`.

## What Workstation should do

- Surface **ranked signals** across leads, quotes, jobs, tasks, issues, payments, visits, daily logs
- Open **shared work surfaces** for the selected item (task, lead, quote)
- Use the same **derived readiness** as record pages (`deriveTaskState`, quote/lead readiness helpers)
- Emit **payment attention** through `getUnsettledEffectivelyDueRequirements` (single payment emission path in query)
- Keep **job summary** panels lightweight (`workstation-job-panel.tsx`)—counts and next step, not full job editor

## What Workstation must not become

- A **raw dump** of all tasks, payments, or leads without ranking
- A place to **reimplement** quote authoring, lead intake, payment recording, or recovery logic
- A source of **fake metrics** or placeholder analytics presented as product truth
- A **duplicate** payment card or task editor with different blocking rules than the job page

## Shared work surfaces (allowed embeds)

| Work type | Canonical surface | Loader |
|-----------|------------------|--------|
| Task execution | `components/jobs/task-work-surface.tsx` | `loadJobTaskExecutionPayload()` |
| Lead commercial | `components/work-surfaces/lead-commercial-surface.tsx` | `loadLeadCommercialSurface()` |
| Quote | `components/work-surfaces/quote-work-surface.tsx` | `loadQuoteWorkSurface()` |

**Rule:** When adding Workstation actions on a work type, **embed or link to these surfaces**—do not fork a second editor under `components/workstation/`.

## Attention vs full record pages

Record routes (`/jobs/[id]`, `/quotes/[id]`, `/leads/[id]`) remain valid for **browse and maintain at length**. Workstation is for **discovery and immediate action**. Both should share derived state from the same helpers (see [source-of-truth-map.md](./source-of-truth-map.md)).

## Known drift risks (watch)

These are documented risks from architecture audit—not necessarily bugs:

- Task work items set `isBlocked` from `deriveTaskState` only; job-level payment blocking is separate
- Job detail wrapper in Workstation counts `JobTaskStatus.TODO` without derived readiness
- Full `QuoteWorkSurface` embedded in drawer is powerful but heavy—avoid adding more tabs/logic only in Workstation

**Do not “fix” these in guardrails v1** unless explicitly approved; document and route changes through canonical helpers.

## Checklist before changing Workstation

- [ ] Does this change **ranking or discovery**, or does it add a **new editor**?
- [ ] Does it reuse `queryWorkstationWorkItems` / `rank()` / shared surfaces?
- [ ] Does task blocking still go through `deriveTaskState`?
- [ ] Does payment attention still go through `job-payment-readiness.ts` helpers?
- [ ] Does copy match [workstation-canon.md](./canon/workstation-canon.md)?

---

*Created 2026-05-16 — Guardrails v1 Pass 1.*
