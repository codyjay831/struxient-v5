# Conceptual model — Struxient v5 (canon)

> **Purpose:** A **conceptual** model for alignment across product, design, and engineering. It is not a database schema. Names may evolve; **relationships and responsibilities** should not drift without a canon update.

## Primary concepts

### Lead

A **lead** is an early-stage opportunity or inquiry. It may arrive from many channels (phone, SMS, email, web form, portal action, manual entry, future integrations). A lead may be **system-created** or **user-created**.

**Responsibility:** capture enough context to decide **whether and how** to pursue work, and to route into **customer** and **quote** preparation without losing provenance.

### Customer

A **customer** is a durable party you do business with (person, organization, or both—canon does not fix CRM theory; the product must support **metadata and tags** rather than a single rigid category).

A lead may:

- Create a new customer,
- Attach to an existing customer, or
- Remain a lead until identity and relationship are clear.

Customers may also be created **without** a lead.

**Responsibility:** hold **history signals** that explain origin and situation (e.g., imported, website lead, past customer, unsold quote) without forcing a false taxonomy. **User-created tags** stay flexible for company-specific meaning. Where the system **already knows** a fact (e.g. an approved job exists, a quote is unsold, provenance from import or web lead), prefer **derived / system lifecycle signals** over asking humans to maintain the same thing as a manual tag—see [domains-and-boundaries.md](./domains-and-boundaries.md) (Customer graph).

### Quote

A **quote** is the primary internal artifact where the company defines **what is for sale** and increasingly **what may need to happen if sold**. It contains **line items** and may accumulate **tasks** and **operational attachments** relevant to preparation and eventual execution.

In v5, treat the **quote** as the **working record** day to day; **immutable proof** at commitment moments (send, approve, activate, approved customer-facing change) is captured in **checkpoints**—see [quote-truth-and-checkpoints.md](./quote-truth-and-checkpoints.md). That separation keeps the main UI off a “version manager” while still preserving sold truth.

Execution-oriented structure on a quote (e.g., **stages**, **tasks** under line items) may exist as **draft execution planning** while still pre-approval: useful for speed and templates, **not** synonymous with customer-facing commitment unless explicitly published.

**Responsibility:** be the **authoritative commercial definition** of sold scope at approval time, while supporting **internal-only** detail that must not leak to the customer view without explicit configuration.

### Line item

A **line item** is a quote row representing a sellable or billable unit: work, service, material, labor, phase, package, or company-specific unit.

Line items may carry **execution-oriented metadata**: tasks, crew/equipment/parts needs, dependencies, scheduling notes, payment hooks, internal vs customer-facing descriptions, files, checklists, etc.

**Responsibility:** keep **commercial meaning** and **operational hints** co-located so context does not scatter.

### Task

A **task** is an actionable unit of work with **ownership**, **state**, and usually **placement in a workflow** (order, dependency, readiness). Tasks may exist on **leads** (pre-quote preparation), on **quotes** (line-item-attached or quote-level), and on **jobs** (execution).

**Responsibility:** make the path **executable**—answer *what*, *who*, *next*, *blocked*, *why*.

### Job (active work)

After customer **approval / signature**, the sold intent should transition into **active executable work** without forcing users to **rebuild** the job structure manually. Canon uses **job** as the umbrella term for “post-approval executable container” (implementation naming may differ).

**Responsibility:** preserve **continuity from the approved quote** while allowing **operational enrichment** as reality unfolds—including **editing the executable workflow** after sign (assignments, ordering, new tasks) as normal operations. Quote-time tasks/stages, when present, **seed** the job graph; they do not **forbid** post-sign refinement.

### Stage (execution grouping)

A **stage** is a lightweight **preset / container** that groups tasks under a line item or within a job. Stages help humans and crews read **chunks** of work; they may appear in **templates** together with tasks.

> **Canon phrase (I24):** *Stages are presets and containers. Tasks are the execution power layer.*

In MVP, v5 ships a single **default stage preset — Standard Project**: **Pre-Construction → Engineering & Permits → Materials → Installation → Final Inspection & Closeout**. This preset is a planning affordance, not a required permanent job shape. Activation materializes the stages actually used by the accepted execution plan, plus any explicit starter/planning path when no tasks exist. A reserved future preset, **Service Work**, will support smaller service execution using the **same** core line-item / stage / task model (no separate task engine). Detailed product framing lives in [templates-and-execution-planning.md](./templates-and-execution-planning.md) §6.

**Responsibility:** organize execution **without** replacing the **line item** as the commercial anchor and **without** becoming the operational power layer themselves. Depth (ownership, ordering, dependencies, blockers, completion truth) lives on **tasks** (and downstream models like payments, approvals, daily logs, and execution records). Stage architecture must remain **preset-flexible** — presets can later be renamed, hidden, merged, specialized, or selected per real contractor usage; code must route through preset/library abstractions and must not depend on the five Standard Project labels. **Kanban** and **placement** framings are out of bounds.

### Event / interruption (conceptual)

An **event** is something that changes reality relative to plan: customer change, weather, failed inspection, missing info, payment block, crew discovery, internal error, etc.

Events may create **new line items**, non-blocking coordination work, **recovery paths**, **pauses**, or **detours**, and must support a **return** to the prior path when appropriate. For `BLOCKS_WORK` issues, remediation is `JobIssue` + `JobRecoveryFlow` + recovery `JobTask` rows; random spawned follow-up tasks do not clear blockers or replace recovery/resume semantics.

**Responsibility:** preserve **causality** (what happened), **ownership** (who fixes), and **narrative continuity** (paused vs parallel vs abandoned steps).

### Templates

**Templates** are reusable **catalog** entries. Granularity is intentionally flexible:

- **Line item only** templates (individual sellable row presets).  
- **Composite** templates: line item **plus** **stages** and/or **tasks** (and optionally crew/equipment/parts bundles).

**Responsibility:** speed authoring **without** creating accidental **global edits** to past quotes or active jobs when someone edits an instance. See [templates-and-execution-planning.md](./templates-and-execution-planning.md) for quote-time vs post-sign planning posture.

### Payment schedule

A **payment schedule** expresses **what is owed, when, and why** (milestones, deposits, line-item ties, completion stages, change orders, company rules). It is the **authoritative money-expectation truth** for the product; **payment gates** and **follow-up tasks** derive from or serve it but do not replace it—see [domains-and-boundaries.md](./domains-and-boundaries.md#boundary-payments-vs-scheduling-vs-tasks).

**Responsibility:** be legible **internally and in the portal**, and able to act as a **blocker** when payment gates execution.

### Trust & Verification (Enrichment)

**Trust & Verification** is the layer that validates the identity, legality, and reputation of parties (leads, customers, or marketplace responders). It uses **official records** (contractor licenses, secretary of state filings) and **digital footprints** (Google Maps, web search, reviews) to enrich records and reduce risk.

**Responsibility:** reduce manual data entry through **auto-fill**, provide **real-time verification** of credentials, and enable **due diligence** for high-value partnerships or marketplace bid responses.

### Customer portal presentation

Not a single “entity,” but a **presentation and permissions boundary**: customer-visible subsets of quotes, schedules, payments, selected job updates, uploads when enabled.

**Responsibility:** never default to exposing full internal workflow graphs.

### Workstation

The **Workstation** is the **operational cockpit** and **role-aware action-discovery surface** for people doing and managing work: prioritized surfaces for **today**, **blocked**, **overdue**, **next**, **changed**, and **resource pressure**—including signals that span **quotes**, **payments**, **customer follow-ups**, **change orders**, and **schedule**, not only job/task lists.

**Responsibility:** reduce **hunting** across modules to discover work; align with the strategic edge (**executable workflow** + **role-aware** feeds). **Record-oriented** navigation (lists and detail for jobs, quotes, customers, etc.) may coexist; the Workstation **must** still read as a **first-class destination** for “what should I pay attention to or do next?” ([workstation-canon.md](./workstation-canon.md)).

## Authentication vs permissions (how they work together)

**Authentication** (“authN”) proves **who** signed in: first-party **Struxient** sessions for staff and customers, per **I18**—e.g. Auth.js credentials for **internal users**, plus **magic-link / SMS token** flows for **customers** when you choose frictionless access.

**Authorization** (“authZ”) proves **what they may do** and **which company’s data** they touch. Clerk is not involved; permissions live in **your data model and server checks**, not in a hosted identity dashboard.

### Internal staff (office / field)

Typical pattern (matches **Struxient_v4** prior art):

1. User signs in with **email + password**; you verify password and load a **User** row.  
2. Session (or JWT) carries **`userId`** and **organization context**—e.g. **membership** in an **Organization** with a **role** — see **Staff RBAC** in [locked-decisions-v1.md](./locked-decisions-v1.md) §1.  
3. Every **API route and server action** that reads or writes **quotes, jobs, tasks, customers** checks:  
   - **Org scope** — the resource’s `organizationId` (or equivalent) **matches** the session’s active org.  
   - **Role / permission** — the action is **allowed** for that role (e.g. tech may complete assigned tasks; only some roles may change sold price).  
4. **Workstation “role-aware” feeds** use the same session: filter tasks and jobs the user is **allowed** to see or act on (assignee, crew, role).

If you need **tenant chosen at login** (multi-org B2B), the **Struxient_v3** pattern adds **tenantId** to the sign-in step so org context is unambiguous before session is minted.

### Customers (portal)

Customers are usually **not** rows in the same “staff User + membership” model for every flow:

- **Magic link / SMS link** — a **short-lived, scoped token** grants access only to **specific** resources (e.g. one quote, one payment page). Permissions are “**what this link may do**” (view, sign, pay), encoded in the token or server-side lookup.  
- **Optional customer account** — if you add first-party login for returning customers, still use **scoped grants**: which jobs/quotes that **customer record** may see, still **server-enforced**.

### Canon rules for builders

- **Never rely on UI alone** to hide buttons; **always** enforce org + role + resource rules **on the server**.  
- **Separate channels** — staff session vs customer token are **different permission systems** that can share infrastructure (same app, same auth library) but **must not** confuse customer scope with staff scope.  
- **Exact role matrix** — locked for v1 in [locked-decisions-v1.md](./locked-decisions-v1.md) §1 (adjust via canon changelog when needed).
- **Stale-session posture** — role/status/membership changes must take effect on protected server requests immediately; treat JWT as a transport hint and revalidate current user + membership from DB.
- **Active-org posture** — selected org hints (session/cookie) must always validate against active membership; invalid context fails closed.
- **Role vs permission split** — role selects default product surface; capability + resource relationship checks decide data/action access.

### Account creation and permission modeling (recommended patterns)

**1. Treat the organization as the root of trust.**  
Create or select an **Organization** (company) first. All staff **Users** gain access only through a **Membership** (`userId` + `organizationId` + **role** + optional flags). Data rows (quotes, jobs, customers) carry **`organizationId`** so every query is naturally scoped.

**2. Prefer invite-based onboarding for teams.**  
An **Owner** or **Admin** sends an **email invite** with a signed, expiring token. Accepting the invite creates (or links) the **User**, creates **Membership** with the chosen role, and sets password—**no shared passwords**, no mystery accounts. For **solo** shops, a single **“Create your company”** flow that creates **Organization + first Membership (Owner)** in one transaction is simpler.

**3. Start with a small role enum, enforce in one place.**  
Begin with **coarse roles** (e.g. Owner, Admin, Office, Field). Encode allowed actions in a **single module** (policy map or capability checks) used by every server entrypoint—**avoid** scattering `if (role === …)` across dozens of files. Add finer permissions only when real customers need them; **assignment** (this task assigned to this user) often replaces many “micro-roles” for field staff.

**4. Layer assignment on top of role.**  
Many trades need: “**Field** users only see work assigned to them or their crew” — that is **assignment + org**, not necessarily a dozen role types. **Dispatchers** get broader read across the org.

**5. Customers stay on the token / grant path first.**  
Create **Customer** records under the org; use **magic-link** scopes for quote/pay flows. Add **optional customer accounts** only when repeat portal use justifies it; link accounts explicitly to **Customer** ids and keep grants narrow.

**6. Operational hygiene.**  
Audit **who invited whom**, **role changes**, and **org switches** (if you support multi-org users). Rate-limit sign-in and invite acceptance. **I19** remains non-negotiable: **server** checks org + role + assignment + token scope on every mutation.

## Relationships (canonical intent)

- **Lead** → optional **Customer** association; may feed **Quote** preparation.
- **Customer** has many **Quotes** / **Jobs** over time; carries **tags/metadata** for interpretation.
- **Quote** has many **Line items**; line items may have **Tasks** and **attachments**.
- **Approved quote** → **Job** (executable container) with **Signal-based readiness** reflecting sold intent (plus lawful operational additions).
- **Tasks** may depend on **Signals** (broadcast by other tasks, stages, payments, or events).
- **Events** attach to the **job/quote context** and **publish signals** to mutate or extend the graph.
- **Incompatibility:** If a required signal has no provider in the job, it is auto-satisfied at activation **unless** the task is marked as requiring a **Hard Signal**.

## Lifecycle intent (behavioral, not naming)

### Lead intake

Support **automatic** capture from sources and **manual** entry; support **simple** and **structured** preparation.

### Quote lifecycle

Quoting supports **lightweight** single-page flows and **task-heavy** preparation flows **without** mandating complexity for simple companies.

### Approval / activation

Customer **signing or approval** is the **commitment boundary**. After commitment, the system should **materialize executable structure** aligned to what was sold—not a blank slate.

### Execution

Execution prioritizes **next action clarity**, **blocker visibility**, and **change honesty** (events, corrections, return paths).

## Data gravity (where truth lives)

| Concern | Primary anchor |
|--------|----------------|
| What we offered commercially | Quote (with customer-facing projection) |
| What the customer committed to | Signed / approved quote + portal-visible terms |
| What we must do operationally | Job + tasks (+ line item context) |
| Why the plan changed | Events / audit narrative attached to context |
| What money is expected | Payment schedule tied to quote/job rules |

Canon expects implementations to **avoid duplicate conflicting sources of truth** for the same concern without an explicit reconciliation story.

---

*Canon update (2026-05-05): Authentication vs permissions; account creation and permission modeling patterns; glossary alignment.*  
*Canon update (2026-05-05): Customer signals vs user tags; payment schedule as money truth (pointer to domains-and-boundaries).*  
*Canon update (2026-05-06): Quote section — **working record** vs **checkpoints** pointer to [quote-truth-and-checkpoints.md](./quote-truth-and-checkpoints.md).*  
*Canon update (2026-05-06): Stage entry rewritten as **preset / container** per **I24** canon phrase; default MVP preset **Standard Project** named; reserved future preset **Service Work** noted (same core model, no separate task engine). Detailed framing in [templates-and-execution-planning.md](./templates-and-execution-planning.md) §6.*
*Canon update (2026-06-14): Auth/permissions section clarified stale-session fail-closed checks, selected-org validation, and role-surfacing vs permission-enforcement split.*
*Canon update (2026-06-19): Clarified Standard Project as a planning affordance, not permanent job architecture; event/interruption language now routes `BLOCKS_WORK` remediation through `JobIssue` + `JobRecoveryFlow` + recovery `JobTask` rows.*
