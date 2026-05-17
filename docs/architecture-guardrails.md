# Architecture guardrails (implementation)

> **Purpose:** Engineering guardrails that connect **product canon** to **code conventions**. This is execution metadata—not duplicate canon. When canon and code disagree, fix code or update canon explicitly.
>
> **Product truth:** [`docs/canon/`](./canon/README.md) · **Engineering bar:** [I22 / I23](./canon/invariants-and-decision-rules.md) · **Living risks:** [build-concerns-risks-and-gaps.md](./build-concerns-risks-and-gaps.md)

## What this folder is for

Struxient v5 is a pre-launch construction workflow app. The core promise: **the system knows what is happening on a job and tells the right person what should happen next.**

AI-assisted coding can make code compile while accidentally:

- Creating duplicate sources of truth
- Bypassing canonical helpers
- Duplicating work surfaces
- Adding schema for derived state
- Weakening the execution model (signals, readiness, recovery, payments)

These guardrails exist to **steer implementation** toward the architecture already described in canon and embodied in `apps/web/src/lib/`.

## Document map

| Document | Scope |
|----------|--------|
| [source-of-truth-map.md](./source-of-truth-map.md) | Stored vs derived concepts and canonical helpers |
| [workstation-guardrails.md](./workstation-guardrails.md) | Workstation as cockpit; attention vs editors |
| [task-payment-recovery-guardrails.md](./task-payment-recovery-guardrails.md) | Task readiness, payments, issues, recovery flows |
| [guardrails-pass3-triage.md](./guardrails-pass3-triage.md) | Warn-only backlog: categories, payment decision context, next steps |

## Repo layout (runnable app)

| Path | Role |
|------|------|
| `apps/web/` | Next.js app, Prisma, all domain logic |
| `apps/web/src/lib/` | Canonical helpers (readiness, payments, workstation query, issue resolve) |
| `apps/web/src/app/` | Routes + co-located `*-actions.ts` server actions |
| `apps/web/src/components/` | UI; shared work surfaces under `work-surfaces/` and `jobs/` |
| `docs/canon/` | Authoritative product and architecture canon |

There is no `packages/` monorepo layer—keep domain logic in `lib/`, not scattered in components.

## Core architecture principles (summary)

1. **Stored state vs derived state** — Status enums and workflow facts are stored. Readiness, attention, blocking, and display labels are derived through canonical helpers unless canon explicitly stores them.
2. **Task execution** — Task readiness goes through `deriveTaskState` / `toTaskReadinessInput`. Completion uses stored fields consistently (`status`, `completedAt`, `completedByUserId`, completion proof).
3. **Payments** — Requirement `status` is an audit fact. Due-ness and attention use `isPaymentEffectivelyDue` and related helpers in `job-payment-readiness.ts`.
4. **Recovery & issues** — Resolution goes through `resolve-job-issue-core.ts`; recovery progress is derived from recovery tasks.
5. **Workstation** — Attention and priority surface, not a second workflow engine. See [workstation-canon.md](./canon/workstation-canon.md).
6. **Shared work surfaces** — Lead, quote, and task work reuse shared surfaces; record pages and Workstation open the same components where possible.
7. **Lead → Quote → Job** — Quote is the working commercial record; checkpoints are hidden proof; job is runtime execution. See [quote-truth-and-checkpoints.md](./canon/quote-truth-and-checkpoints.md).
8. **Activity & AI** — `JobActivity` records what happened; AI proposals are review-then-apply, not silent persistence.
9. **UI / theme** — Semantic tokens from `globals.css`; avoid raw palette classes. See I23.
10. **Schema** — No schema changes without explicit approval. Prefer existing fields and derived helpers first.

## Automated guardrails

Run from `apps/web/`:

```bash
npm run guardrails
```

`GUARDRAILS_STRICT=1` — drift detectors that normally **warn** will **fail** the run (use when tightening CI).

| Script | Default | Behavior |
|--------|---------|----------|
| `detect-schema-changes.mjs` | **Fail** | Uncommitted `apps/web/prisma/schema.prisma` unless `ALLOW_SCHEMA=1` |
| `detect-deprecated-tag-count-fields.mjs` | **Fail** | References to deprecated `Tag.usageCount*` fields in `apps/web/src` (non-comment lines) |
| `detect-payment-status-drift.mjs` | **Warn** | Raw `"DUE"` / `"PENDING"` / etc. payment status string compares outside allowlist |
| `detect-task-readiness-drift.mjs` | **Warn** | `deriveTaskState` / `toTaskReadinessInput` used without a `task-readiness` import |
| `detect-raw-palette.mjs` | **Warn** | Raw `zinc-*` / `gray-*` / `slate-*` Tailwind utilities in `src` |
| `detect-corrections-constant-drift.mjs` | **Warn** | Literal `"Corrections"` instead of `CORRECTIONS_STAGE_NAME` |
| `detect-client-db-import.mjs` | **Warn** | `"use client"` files importing `@/lib/db` |

Orchestrator: `scripts/guardrails/run-all.mjs`.

## Cursor rules

Project rules live in `.cursor/rules/`:

- `struxient-architecture.mdc` — Overall architecture discipline
- `source-of-truth.mdc` — Canonical helper requirements
- `no-schema-without-approval.mdc` — Schema change gate
- `post-task-checklist.mdc` — Self-check after every task

## When to update this doc

- New canonical helper added → update [source-of-truth-map.md](./source-of-truth-map.md)
- New guardrail script added → update this file and `scripts/guardrails/run-all.mjs`
- Canon revised → link here; do not copy canon prose into this file

---

*Created 2026-05-16 — Guardrails v1 Pass 1. Updated Pass 2 — drift detectors + `resolve-job-issue-core` tests. Pass 3 — [guardrails-pass3-triage.md](./guardrails-pass3-triage.md).*
