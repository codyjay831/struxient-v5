# Struxient v5 — Product and architecture overview (canon)

> **Identity:** Canon for **Struxient version 5** only (`Struxient_v5`). Earlier Struxient lines are not authoritative here unless explicitly imported into this canon set.

## What Struxient v5 is

Struxient v5 is a **construction management product aimed primarily at trades and field service** organizations. It spans **commercial intake → quoting → customer commitment → operational execution**, with particular emphasis on making **work legible, assignable, and sequenced** in the real world—not only documented in an estimate.

The product thesis: **the quote defines what was sold; tasks and workflow define what must happen; the Workstation tells people what to do next.** v5 intentionally connects **sales artifacts** (quotes, approvals, money expectations) to **execution artifacts** (jobs, tasks, dependencies, corrections) without collapsing them into a single rigid project-management paradigm.

**Flow keeper (authoritative):** Struxient accepts **messy human input** and returns **clear execution flow**—office work (invoices, reminders, logs) as **automated side effects**, not a second job. Full philosophy: [product-philosophy.md](./product-philosophy.md).

## Strategic edge (v5)

The differentiated corner of the product is **tasks and execution**, not generic CRM or document storage.

- **Workstation** is the flagship operational surface: a **cockpit**, not a passive dashboard. It exists to answer, continuously and with low cognitive load: *what needs action, by whom, in what order, under what constraints, and what changed*. **Authoritative positioning** (verbatim) lives in [workstation-canon.md](./workstation-canon.md#authoritative-positioning): *Workstation is not a navigation category; Workstation is the role-aware action-discovery surface that surfaces what needs attention across jobs, tasks, quotes, schedule, payments, customer follow-ups, change orders, and other operational records.*
- Quoting remains essential because it is the **contractual and commercial anchor**; execution remains essential because it is where margin, schedule, and customer outcomes are realized. v5 treats **misalignment between quote and field** as a first-class problem domain (events, corrections, return paths), not an edge case.
- **Appearance:** the product targets **both light and dark modes** with the same professional, trade-focused feel; details and enforcement live under **I23** in [invariants-and-decision-rules.md](./invariants-and-decision-rules.md).

## Audience and posture

- **Primary operators:** office and field roles at **trade and service companies**, with emphasis on **small crews** where the owner often sells and the same people execute (estimators, CSRs, dispatch, leads, owners, technicians).
- **Secondary audience:** **customers** via a **portal** that exposes only what the company chooses—never the full internal operational graph by default.

The system must scale **behavioral complexity** with company maturity: **simple paths stay fast**; **structured paths stay honest** (tasks, dependencies, ownership visible).

## Positioning vs familiar tools (plain language)

v5 aims for **Jobber-like simplicity** on the surface people use every day (customers, quotes, money, basic scheduling metaphors) while being **materially stronger** where trades actually lose money and time: **execution**—a credible path from **sold scope** to **field reality**, surfaced in the **Workstation** without turning every job into a science project.

## Prior Struxient folders (Full_Cursor → v2–v4)

**`Struxient_Full_Cursor`** is the **first (genesis)** line; numbered folders followed. Earlier repos are **partial successes**: good UI, good docs, or good schema experiments—**not** a single line to copy wholesale. The **repeat lesson** is weak **quote → execution → workstation** continuity when workflow was treated as **brittle**, and **events/issues** that did not map cleanly to **owned next steps**.

What to **salvage from which line** (and what v5 **rejects**) is summarized in [lineage-and-prior-art.md](./lineage-and-prior-art.md). **Struxient v2 is the preferred UI/UX baseline** for v5 unless deliberately superseded.

## Canon document map (for builders)

| Document | Use when you need… |
|----------|-------------------|
| [product-philosophy.md](./product-philosophy.md) | **Why** Struxient exists: flow keeper, phasing, automation posture, field intelligence intent |
| [glossary.md](./glossary.md) | Shared language; internal vs customer-facing naming |
| [conceptual-model.md](./conceptual-model.md) | Entities, relationships, lifecycle intent; authN vs authZ |
| [domains-and-boundaries.md](./domains-and-boundaries.md) | Where responsibilities split; internal vs portal seams |
| [business-profile-and-ai-context-canon.md](./business-profile-and-ai-context-canon.md) | Minimal Business Profile, setup boundaries, AI context hierarchy, provenance, and profile/settings separation |
| [experience-canon-lead-to-workstation.md](./experience-canon-lead-to-workstation.md) | End-to-end UX and behavioral requirements (lead → workstation) |
| [journey-contractor-intake-to-completion.md](./journey-contractor-intake-to-completion.md) | Contractor narrative: intake → completion |
| [templates-and-execution-planning.md](./templates-and-execution-planning.md) | Templates (line-only vs composite), quote vs post-sign execution planning |
| [lineage-and-prior-art.md](./lineage-and-prior-art.md) | What to carry forward from Full_Cursor (genesis) + v2–v4; repeated failure modes; positioning |
| [workspace-ux-canon.md](./workspace-ux-canon.md) | **Execution-first UX philosophy**: shell, operational queues, Sales row/drawer contracts, vocabulary lock |
| [workstation-canon.md](./workstation-canon.md) | Deep rules for the cockpit / “what’s next” experience |
| [invariants-and-decision-rules.md](./invariants-and-decision-rules.md) | Non-negotiable rules, default decisions, engineering delivery standards (I22), appearance (I23) |
| [locked-decisions-v1.md](./locked-decisions-v1.md) | **v1 locks:** RBAC, lifecycle state names, accounting boundary, intake, calendar, tenancy, change orders, payments, portal, construction issues, Workstation, phased roadmap |

## Core product principle (authoritative)

Struxient v5 should **connect quoting to execution without becoming overly rigid**.

- The **quote** defines what is being sold and anchors customer-facing truth (within redaction rules).
- **Templates** accelerate authoring; they must not silently create **shared mutable instances** across quotes or jobs.
- **Tasks** make work executable: ownership, order, readiness, and blockers must be representable.
- **Events** (interruptions, corrections, scope changes) must be first-class so reality does not orphan the plan.
- The **Workstation** is the operational home for **next action** and **state of the work**.
- The **customer portal** shows **only** what the customer needs to see; internal workflow detail remains internal unless explicitly published.

## Pillars (experience-level)

1. **Clarity of next action** — Users can always discover what they should work on now, what is blocked, and what changed.
2. **Quote–execution continuity** — Approved quotes materially inform active work; users should not re-enter the same structure by hand to “start the job.”
3. **Adaptive structure** — Dependencies and ordering exist where needed; detours, pauses, and return paths are supported without discarding intent.
4. **Appropriate disclosure** — Internal richness (crew, parts, internal notes) coexists with customer-safe presentations.
5. **Payment legibility** — Schedules and blockers are understandable internally and in the portal.
6. **Forgiving capture, enforced flow** — Messy intake and field moments become structured facts; the engine keeps the job moving (see [product-philosophy.md](./product-philosophy.md)).

## Explicit non-scope of this canon

These documents describe **intended product behavior and architectural intent**. They are **not** a sprint plan, delivery guarantee, or exhaustive feature checklist. Engineering may ship **incrementally** (narrow vertical slices), but each slice should **respect the invariants**, follow **engineering delivery standards** ([invariants-and-decision-rules.md](./invariants-and-decision-rules.md) §I22), honor **appearance rules** (§I23), and **not** contradict canon without an explicit canon update.

## Locked v1 product decisions

RBAC matrix, lifecycle **state names**, accounting vs payments vs QBO/Xero phasing, lead dedupe/assignment, calendar v1 depth, multi-tenant default, change orders, payments processor and blocks, customer portal v1, construction issue types, Workstation tabs, and phased “second wave” items are **locked** in [locked-decisions-v1.md](./locked-decisions-v1.md). Update that file (with a dated changelog line) when product revises a decision.

## Fine-grain still open (optional)

- **Payment service provider** contract (Stripe vs peer) if commercial terms change—must stay **in-app PCI** pattern and **first-party** UX (I18).  
- **Legal review** of e-sign vendor choice per jurisdiction.

When these close, add a one-line note to `locked-decisions-v1.md` footer.
