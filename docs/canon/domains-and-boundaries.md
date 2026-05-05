# Domains and boundaries — Struxient v5 (canon)

> **Purpose:** Define **capability domains** and the **seams** between them so modules, APIs, and UX do not smuggle responsibilities across boundaries by accident.

## Domain map (conceptual)

1. **Intake and routing** — Ingestion from channels; **dedupe warn**, **manual assign default**, **Inbox queue** — see [locked-decisions-v1.md](./locked-decisions-v1.md) §4; creation of leads and routing to users.
2. **Customer graph** — Customer records, **user-created tags**, **system-derived lifecycle signals** (where the product knows state—e.g. has approved job, has unsold quote, import provenance), and relationships to leads/quotes/jobs. Prefer **separating** flexible manual tags from **derived** signals when implementation allows, so operators are not asked to maintain as tags what the system already knows.
3. **Quote authoring** — Line items, pricing, internal vs external descriptions, operational enrichments, templates, quote-level tasks for preparation.
4. **Template library** — Reusable definitions; versioning and update semantics vs instances on quotes/jobs.
5. **Workflow and tasks** — Assignment, dependency, ordering, readiness, blocking reasons, detours, return points; spans pre-sale and post-sale.
6. **Commitment and activation** — Customer approval/signature; conversion to executable job structure; immutability rules for commercial baseline (see invariants).
7. **Execution and operations** — Field and office execution, attachments, resource needs (crew, equipment, parts), operational checklists.
8. **Events and corrections** — Interruptions, change orders, rework, pauses; causal metadata and ownership.
9. **Scheduling and calendar** — Task due/start/end + **appointments**; calendar UI reads same truth; **no** resource-leveling engine v1 — see [locked-decisions-v1.md](./locked-decisions-v1.md) §5.
10. **Payments** — Schedules, statuses, portal presentation, **payment gating** of work where configured.
11. **Customer portal** — **Link-first** v1, optional accounts later; e-sign via **vendor acceptable** with Struxient-owned UX shell — [locked-decisions-v1.md](./locked-decisions-v1.md) §9; customer-safe projections of quotes, payments, and selected job updates. **Internal** sign-in: I18.
12. **Workstation** — **Role-aware action-discovery** and aggregation of actionable state across jobs, tasks, calendar, payments, **quotes**, **customer follow-ups**, **change orders**, and related operational signals—not merely a nav grouping ([workstation-canon.md](./workstation-canon.md)).

## Boundary: internal vs customer-visible

**Hard boundary:** Internal operational richness (tasks assigned to crews, internal notes, dependency graphs, vendor coordination) **defaults to internal**. The **customer portal** and **customer-facing quote view** are **explicit projections** controlled by the company.

**Implication for builders:** do not assume “one quote object serialized two ways” unless the product defines a **projection layer** or equivalent pattern. Internal and external representations may diverge **by design**.

## Boundary: quote vs job

**Quote** optimizes for **selling and defining scope**. **Job** optimizes for **doing work under constraints**.

Canon requires **continuity** across the boundary (no manual rebuild of the same structure), while allowing **execution-only** enrichments post-commitment (e.g., dispatch detail that was not sold textually).

**Execution planning seam:** Users may attach **stages/tasks** on the quote as **draft planning** or **template-driven structure**, or add most execution detail **only after** approval. The job phase must support **editing the workflow** without treating quote-time tasks as an unchangeable “legal diagram.” Commercial anchor remains **sold line items** and customer-visible terms—not every internal task stub created while estimating. See [templates-and-execution-planning.md](./templates-and-execution-planning.md).

## Boundary: templates vs instances

**Template library** is a **catalog**. **Quote and job** carry **instances**.

Canon expects **instance isolation**: editing an instance must not unintentionally mutate other quotes/jobs or the catalog definition. Updating the catalog must not silently rewrite historical commercial documents unless the product explicitly defines such a migration (generally discouraged for signed artifacts).

## Boundary: tasks on lead vs quote vs job

Tasks serve different **psychological and legal** contexts:

- **Lead/quote tasks** often represent **sales process** and **pre-construction preparation**.
- **Job tasks** represent **delivery**, **compliance**, **coordination**, and **closeout**.

The same task engine may power all three, but **UX and permissions** should respect context: customers must not see internal pre-sale tasks unless intentionally exposed (unlikely).

## Boundary: payments vs scheduling vs tasks

These three create **cross-domain blockers**:

- A task may be **not ready** until payment milestone satisfied.
- A schedule constraint may block assignment or start.
- A payment may be **due because** a milestone completed.

Canon requires that **blocker reasons** be attributable: users should answer *why* work is stopped without opening five screens.

### Payment schedule vs payment gate vs payment task (money truth)

- **Payment schedule** is the **source of money truth**: what is owed, when, and why (milestones, deposits, ties to scope, change orders, company rules).  
- **Payment gates** are **readiness constraints** on execution (or on specific transitions) **derived from** the schedule and org rules—they answer “may work proceed?” not “what is owed?”  
- **Payment follow-up tasks** (e.g. spawned from a `payment_block` issue) exist to **coordinate humans**; they are **not** a substitute for the schedule. Completing a task does not by itself rewrite obligations unless the product explicitly ties that action to recorded payment state.  
- **Payment-block issues / events** explain **why** execution stopped or is risky; they **do not replace** the schedule as the ledger of what money is expected.

This prevents treating payment as “just another task”: tasks may **reflect** or **chase** the schedule; the schedule remains authoritative for **money expectations**.

## Integrations seam (future-facing)

Lead sources include **future integrations and imports**. Canon treats intake as **pluggable at the edge** even if v5 ships with a subset. The model should not hard-code “only web form leads” in ways that break other sources.

## Analytics seam

Analytics may aggregate workstation signals. Canon positions analytics as **downstream of truthful operational state**, not as the system of record for tasks.

## Non-domain (explicit)

This canon does not mandate a specific **tech stack**, **multi-tenant topology**, or **third-party accounting** architecture—only behaviors and boundaries those choices must respect.

---

*Canon update (2026-05-05): Customer graph — system-derived signals vs user tags; payment schedule vs gate vs task (money truth).*
