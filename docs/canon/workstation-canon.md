# Workstation — operational cockpit (canon, Struxient v5)

> **Strategic role:** The Workstation is the **center of gravity for execution**. It embodies the product edge: **tasks, sequencing, ownership, and reality-based change** surfaced as **action**, not buried in records.

## Authoritative positioning

> Workstation is not a navigation category; Workstation is the role-aware action-discovery surface that surfaces what needs attention across jobs, tasks, quotes, schedule, payments, customer follow-ups, change orders, and other operational records.

Treat the Workstation as a **real product surface and destination**: the main place users **discover what to do next** and **what needs attention** across the business. Shell layout (single route, grouped sidebar links, or hybrid) is **implementation**, but the experience **must not** reduce the Workstation to “just a label above ordinary module links” without delivering **role-aware, cross-record operational signal** and **actionable next steps**.

**Struxient’s edge** stays **executable workflow** plus **role-aware action discovery**—not parity with every competitor’s left-nav pattern.

## Definition

The **Workstation** is the primary **internal** operational surface where users **act on work** and **discover work worth doing**. It is intentionally a **cockpit**: high situational awareness, low hunting, emphasis on **now**, **next**, and **blocked**.

It is **not**:

- **Only** a sidebar section title or generic **navigation category** (see **Authoritative positioning** above).  
- A replacement for **every** deep editor (quote authoring may remain its own focused surface).  
- A passive “wall of widgets” with no notion of priority.  
- A customer portal.  
- A substitute for **record-based** pages (**Jobs**, **Tasks**, **Schedule**, **Quotes**, **Customers**, **Leads**, etc.) where users **browse and maintain** those objects at length—those routes can remain for larger, list- and detail-oriented work. The Workstation is **different** because it **aggregates actionable work and operational state across** those domains so users are not forced to **hunt module-by-module** just to see what matters.

## Role, permissions, and assignment

What appears in the Workstation **depends on** the user’s **role**, **permissions**, and **assigned work** (and related rules such as crew membership). Illustrative intent:

- **Field workers** — Most weight on **their** assigned and **available near-term** work, readiness to execute, and blockers that stop **them**.  
- **Office roles** — Broader **operational signals**: blocked items, quote prep and follow-ups, customer follow-ups, schedule conflicts or risk, **payment holds**, items **needing review**, jobs **needing coordination**.  
- **Managers / owners** — Higher-level **workflow and business visibility**: bottlenecks, **stale** work, **capacity** pressure, **priority** decisions, and cross-job patterns—still grounded in **truthful task/job state**, not analytics theater.

### MVP role slices (default feeds)

For a **first-pass Workstation**, prioritize **information presence** per persona as follows—these are **MVP / default slices**, not a permanent ceiling on what each role may see later.

- **Field** — My **assigned** tasks; **crew** tasks that affect me; **blocked** work that affects me (with attributable reasons); **today / upcoming** schedule-oriented work.  
- **Office** — **Unassigned** work needing assignment; **blocked** jobs/tasks; **quote** follow-ups; **payment holds** / payment-blocked execution; **schedule** conflicts or at-risk commitments; items **needing review** or coordination.  
- **Owner / Admin** — **Company today** (cross-cutting operational picture); **stale** work; **bottlenecks**; **payment-blocked** work; **overdue** work; **unassigned** work needing ownership.

Shell labels (tabs, routes, toggles) may differ; the intent is **role-appropriate default attention**, not a fixed permission wall.

## North-star question

The Workstation should answer, without making users click through every module first:

**“What should I pay attention to or do next?”**

## Primary user questions (must be answerable)

From the Workstation, a user should be able to recover answers quickly (exact UI patterns are not canon; **information presence** is):

1. **What should I work on today?** (personal and/or role-based prioritization)  
2. **What is blocked?** (and **why**)  
3. **What is overdue?**  
4. **Which jobs need attention** even if no single task is “late”?  
5. **What task comes next** in a given job’s executable path? (What signal is it waiting on?)
6. **What changed** since I last looked? (activity, edits, new events, signal overrides)
7. **What needs approval, payment, scheduling, or correction** before progress is safe or allowed? (Which signals are missing?)

If a design choice makes these questions **harder** than today’s baseline for the persona, it should be treated as a **regression risk** unless canon is explicitly revised.

The Workstation **must not** be the only path to deep records, but it **should** be the default **honest** answer to **discovery** of urgent, ready, blocked, and assigned work—**without** treating those signals as an afterthought to generic nav.

## Lenses, tabs, and filters (inside the Workstation)

Names and controls are product decisions. Canon requires that **lenses / tabs / filters** (e.g. **Focus**, **Today**, **Ready**, **Blocked**, **Needs review**, **Scheduled**, **Assigned**, or equivalents) are **views inside the Workstation concept**, composable over **one operational truth**—they **do not replace** the Workstation as the **action-discovery surface**, and they **must not** be designed so the whole product feels like **every other app’s sidebar-only** workflow.

Non-exhaustive examples (may mirror v1 tab locks or evolve):

- **Daily dashboard** — prioritized slice for “today.”  
- **Job-centric lens** — attention and executable state **across** jobs, with drill-down to job detail where needed.  
- **Task-centric lens** — tasks across jobs (assigned, unassigned, blocked).  
- **Waiting lens** — tasks that are otherwise ready but waiting on a specific **Signal**.
- **Calendar / schedule lens** — time-based constraints and commitments feeding readiness.  
- **Analytics** — secondary to action; should not steal the default “landing” purpose unless configured.  
- **Work priority views** — explicit sorting by urgency, SLA, payment gate, customer tier (rules product-defined).  
- **Assigned / blocked / upcoming** — canonical triage lenses.  
- **Payment-related blockers** — money as a first-class signal provider, not only a finance screen.  
- **Crew / resource needs** — surfacing understaffing, missing equipment, or missing parts that prevent execution.

Canon treats these as **views over the same underlying truth**, not siloed conflicting queues.

## Relationship to quotes and portal

- **Quotes** remain where **commercial authoring** and **customer-facing packaging** are controlled.  
- **Workstation** is where **delivery** is orchestrated.  
- **Portal** remains **customer-safe**.

Handoff requirement: after approval, the Workstation should **illuminate the executable graph** derived from sold intent; it should not require users to “discover” that a new job exists only by accident.

## Events and the Workstation

When interruptions occur, the Workstation must make **detours legible**:

- Something **new** may need doing (tasks/line items).  
- Something may be **paused**.  
- Ownership may **shift**.  
- A **return point** should be visible when the plan expects return.

Avoid UX that hides interruptions behind generic “notes.” Interruptions that affect execution should affect **visible task state** or an equivalent **actionable representation**.

## Payment gating

If payment rules block work, the Workstation should surface:

- **That** execution is stopped or not startable  
- **Which** obligation is unsatisfied  
- **Who** should act (customer vs internal roles—product rules)

## Simplicity vs sophistication (Workstation-specific)

The same company may need **simple** job execution sometimes and **dense** coordination other times. The Workstation should support **progressive disclosure**:

- Default: **next action clarity**.  
- Drill-down: dependency graph, attachments, history, related quote sections.

## Analytics placement

Analytics informs management; it must not **replace** the truth of tasks. If analytics and tasks disagree, **task/job state is authoritative** for “what is actually happening” unless canon is updated to define otherwise.

## Open design decisions (not canon until chosen)

- Default landing: **personal today** vs **company-wide operations board**.  
- Exact models for **multi-crew dispatch** and map-based views.  
- Notification strategy (in-app vs mobile push vs SMS) — boundary: interruptions should be **discoverable** in the Workstation even if notifications fail.

---

*Canon update (2026-05-05): Authoritative positioning; record-based nav; role-based intent; lenses as views inside the concept; MVP role slices (default feeds by Field / Office / Owner–Admin).*
