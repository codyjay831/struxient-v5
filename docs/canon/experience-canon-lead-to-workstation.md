# Experience canon — Lead → Quote → Customer approval → Workstation

> **Struxient v5 only.** This document is the **authoritative experience reference** for how the product should **feel and behave** across the lifecycle named in the title. It informs UX, product, and engineering alignment. It is **not** a sprint plan or confirmation that every capability ships in a given release.

---

## 1. Lead intake experience

### Intent

Leads enter from **many real-world channels**; the system must not assume a single front door. The **Intake Composer** allows organizations to build custom, multi-step forms tailored to their specific trades.

### Canonical channels (non-exhaustive)

- Phone calls (Manual entry)
- Website forms (WebFormAdapter)
- Text messages (SMSAdapter - stubbed)
- Email (EmailAdapter - stubbed)
- Webhooks (WebhookAdapter - stubbed)
- Manual entry by office users

### Behavioral requirements

- A lead may be created **automatically** from a source or **manually** by a user.
- Intake must support **dynamic forms** built from **System Atoms** (blessed fields like `contact.name`, `address.service`) and **Custom Fields** (trade-specific data).
- **Conditional Visibility** allows forms to adapt to user input (e.g., showing emergency details only if "ASAP" is selected).
- Intake should preserve **provenance** (channel) and a **formSnapshot** (immutable record of the form schema at the time of submission).

### 1.5 Trust & Verification (Enrichment)

### Intent
Reduce friction and risk by automatically verifying the identity and credentials of parties as early as possible.

### Canonical behaviors
- **Auto-fill:** Entering a Contractor License Number and State should automatically populate company name, address, phone, and brand assets (logo).
- **Verification Loop:** The system uses an "AI Search & Scrape" approach to verify license status against official state registries and cross-reference with Google Maps.
- **Trust Badges:** Verified records display real-time status (e.g., "Active License," "Verified Address") to build confidence before a quote is even sent.
- **Deep Search:** For high-value partnerships, the system can perform a deeper "Due Diligence" search into safety records (OSHA), reputation sentiment, and project history.

### Architectural note

Treat intake as a **capability seam**: new sources should not require redesigning the core lead model each time. The **Lead** model uses a thin core with **JSONB** fields (`contact`, `request`, `address`, `signals`) for maximum flexibility.

---

## 2. Leads and customers

### Intent

Separate **early intent** (lead) from **ongoing relationship** (customer) without forcing premature promotion.

### Canonical behaviors

- A lead may **create a new customer**, **attach to an existing customer**, or **remain a lead** until enough is known.
- A customer may be created **directly** without a lead.

### Customer understanding without rigid taxonomy

Customers support **metadata, tags, or status labels** that explain history and situation. Examples (illustrative, not exhaustive):

- Imported customer  
- Website lead  
- Phone lead  
- Existing customer  
- Customer with sold job  
- Customer with unsold quote  
- Non-sold customer  
- Past customer  
- Manual entry  

### Requirement

Tags should **reduce ambiguity** for humans (“what kind of customer is this?”) **without** forcing every customer into a single mandatory category tree unless the company configures one.

### System signals vs user tags

**User-created tags** remain available for **company-specific** segmentation and habits. **System-generated lifecycle signals** (when the product can infer them—e.g. **has approved job**, **has unsold quote**, **imported customer**, **website lead**) should live **separately** from manual tags where practical, so teams are not asked to duplicate state the system already holds.

---

## 3. Lead-to-quote experience

### Intent

Progress from lead to quote must scale from **lightweight** to **process-driven** per company and per job type.

### Simple path

For simple organizations or simple job types, the experience may be as light as a **single quote checklist page** (or equivalent minimal flow).

### Structured path

For more advanced organizations, lead → quote may include **assigned tasks**, e.g.:

- Call customer  
- Confirm address  
- Gather photos  
- Schedule site visit  
- Complete site visit  
- Build estimate  
- Review quote  
- Send quote  

Tasks may be assigned **automatically** or **manually** (rules are product territory; canon requires both **modes** to be conceptually supported).

### Dual requirement

The system must support:

1. **Simple lead → quote** with minimal ceremony.  
2. **Structured lead → task-based quote preparation** when needed.

### Anti-patterns

- Forcing heavy process on trivial work.  
- Offering “flexibility” that hides **who owns the next step** when process *is* required.

### Opportunity progress posture (v5)

Pre-sale progress must be shown as a **derived interpretation** of facts, not as a second manually maintained lifecycle:

- Lead lifecycle/disposition facts (`Lead.status`)  
- Lead visit facts (`LeadVisitRequest`)  
- Quote facts (`Quote`, `QuoteCheckpoint`)  
- Customer-requested change facts (`QuoteChangeRequest`)  
- Job activation fact (`Job`)

The contractor-facing surface should answer: **where it is**, **how long it has been there**, **what blocks it**, and **what action is next**.

Use broad orientation phases:

```text
Intake -> Discovery -> Estimating -> Customer Review -> Won
```

Treat this as orientation, not a strict one-pass pipeline. Discovery and estimating may loop after customer feedback.

### Sales pipeline board (v5)

The **Sales** page (`/leads`) is the contractor-facing **pipeline orientation** surface for open opportunities. It is a **derived, non-draggable** board—not a manually maintained CRM pipeline.

**Column placement** uses actionable **condition groups** derived from `getOpportunityFlow().conditionCode`, not broad phase names alone. Example lanes:

- Needs info · Customer match review · Needs site survey · Site survey set · Ready to quote · Quote draft · Quote sent · Changes requested · Approved / ready for job · Job active

The five orientation phases (`Intake → Discovery → Estimating → Customer Review → Won`) appear as **card context**, not as the primary column structure, because `Discovery` and `Estimating` are too vague for scan-at-a-glance work.

**Movement rules:**

- Cards move when **stored facts** change (intake completeness, visit schedule/completion, quote draft/send/approval, change requests, job activation)—never when a user drags a card.
- `Lead.status` remains lifecycle/disposition metadata; it does **not** control board placement.

**Card requirements:** where it is (condition label + phase context), how long it has been there (`ageLabel`), what blocks it (`requirements`), and what action is next (`primaryAction`).

**Workstation vs Sales:** Workstation ranks **attention and next action** across the business; Sales shows **full open-opportunity orientation** by actionable lane. Sales must not become a second priority engine.

### Progress anti-patterns

- Persisting UI condition as a database lifecycle enum.
- Overloading `QuoteStatus` to carry sales-operational conditions.
- Treating “site visit” as a universal single-completion pipeline stage.
- Building a visible workflow editor for normal contractor operation.
- **Drag-to-advance** boards where column placement mutates lifecycle state.
- Using broad phase columns (`Discovery`, `Estimating`) as the primary Sales board structure when actionable condition lanes are available.

---

## 4. Quote authoring experience

### Intent

Quoting is where the company defines **what is sold** and increasingly **what will need to happen** if sold.

**v5 app alignment:** the internal quote workspace advances **Draft → Sent → Approved → Archived** on the persisted quote record; **Send** and **Acceptance** each create hidden **commercial** checkpoint rows (staff-only). **Execution Review** and internal draft execution stay **separate** from customer-facing checkpoints until activation materializes a job.

**v5 app alignment (Job runtime V1):** an **Activate job** action on Execution Review creates **one** `Job` per approved quote, with **shared stages** (canonical phases merged across lines) and **separate work blocks** (one per source line) copied from the quote's draft execution. Job pages are minimal in V1—no scheduling, assignments, or completion workflow yet—but stage/task lineage to the source quote is preserved on every row.

### Line items

Line items represent sold work, services, materials, labor, phases, packages, or other quoteable units per company workflow.

### Line item richness (canonical fields / attachments)

Line items may include (non-exhaustive):

- Title, description, quantity, price  
- Internal notes vs customer-facing description  
- Attached tasks  
- Crew requirements, equipment requirements  
- Parts/materials  
- Dependencies and scheduling considerations  
- Payment requirements  
- Other execution-relevant information  

### Requirement

The quote should be the **primary place** where users define **commercial scope** and **operational implications** together, so execution does not depend on memory or side documents.

---

## 5. Line item and task templates

### Intent

Templates accelerate repeat business while respecting **instance independence**.

### Canonical template contents

Templates may include:

- **Line item only** (saved individually—commercial row presets without stages/tasks)  
- **Line item + stages and/or tasks** (composite templates: same line item shape, plus phase-like **stages** and executable **tasks** and related metadata when desired)  
- Line item + crew/equipment/parts info (with or without stages/tasks)  
- Task-only templates  
- Task groups  
- Useful combinations of reusable quote and execution information  

**Canon clarification:** “Line item template” and “line item + stages + tasks template” are **both** valid, common shapes—not mutually exclusive product modes.

### Canonical user actions

- Add templates to a quote  
- Customize instances on the quote  
- Save new quote content back as reusable templates (from a **single line item** up through **line item + nested execution structure**)  
- Keep template changes **separate** unless the user **intentionally** updates the library template  

### Invariant (experience-level)

Templates help users move faster; once applied, **quote/job instances** must be editable **without unintentionally changing** other uses of that template.

### Execution planning timing (quote vs after sign)

Users must be able to:

- **Plan during the quote** (tasks attached while selling—often via templates with pre-wired signals), **or**  
- **Defer execution planning** until after customer approval, **without** being penalized for choosing either path.

Rich execution structure on a quote must remain **refinable after customer signature** during **Execution Review** (internal, pre-activation), then **again on the job** as normal operational edits after activation. AI can assist in wiring signals during both phases. See [templates-and-execution-planning.md](./templates-and-execution-planning.md).

---

## 6. Executable workflow behavior

### Intent

Quotes and tasks create a **clear executable path** that survives real life.

### Quote-time vs job-time planning

**Pre-approval:** execution structure on the quote may be **partial**, **draft**, or **rich**; the primary obligation of the quote remains **commercial clarity** and controlled customer disclosure.

**Post-approval (customer sign):** teams finalize or attach internal execution through **Execution Review** before **job activation** creates runtime stages/tasks. **Post-activation:** the job’s executable graph remains the **operational home** for day-to-day refinement—reorder, assign, add mobilization tasks, split work, etc.—without implying that every quote-time stub was a **customer commitment**. Full intent: [templates-and-execution-planning.md](./templates-and-execution-planning.md).

### Questions the system should help answer

- What needs to happen?  
- Who is responsible?  
- What comes next?  
- What is blocked? (Waiting on which signal?)
- What changed?  
- What needs to be fixed?  
- How do we return to the original path?  

### Structure vs rigidity

Support **Signals**, but avoid brittleness where normal change invalidates the plan. The posture: **enough structure** for clarity, **enough flexibility** for reality. AI acts as a "Secretary" to handle the boring manual wiring.

### Flow keeper — forgiving capture, enforced flow

Operators **dislike office work**; field capture is often **messy**—and that is expected. The product must:

- Accept **low-friction input** (short descriptions, photos, voice-to-text future, half-filled lead forms).  
- Convert capture into **engine facts** (tasks, issues, attachments, activity)—not orphan notes.  
- Keep field interactions **short**; invoices, reminders, and log rollups are **side effects** of execution facts, controlled by **org settings**—not a user-built trigger system. See [product-philosophy.md](./product-philosophy.md) and [locked-decisions-v1.md](./locked-decisions-v1.md) §16.  
- Surface **next action** on Workstation so nobody **manually maintains** pipeline state for the system to work. A **system-derived** Sales board is allowed; operator drag-and-drop CRM boards are not.

**Anti-pattern:** Requiring clean data entry before the user gets value. **Anti-pattern:** Gallery software where photos never gate work or inform proposals.

---

## 7. Events, interruptions, and corrections

### Intent

Treat change as **normal**, not exceptional.

### Example events (illustrative)

Customer change requests, material issues, failed inspections, site discoveries, weather delays, missing information, payment issues, scheduling conflicts, scope changes, internal mistakes.

### Canonical outcomes of an event

An event may create or trigger:

- New tasks that **publish signals** to unblock work.
- New tasks that **require signals** to pause work.
- A temporary detour that "hijacks" the signal bus.
- A defined return point to the prior path.

### Transparency requirements

For meaningful interruptions, users should see:

- **Cause** (what happened)  
- **Remediation work** (what must be fixed)  
- **Ownership** (who owns the fix)  
- **Signal impact** (what is paused/muted)
- **Return** (how the job resumes the prior path when appropriate)  

### Anti-patterns

- **Too rigid:** every field edit breaks the workflow.  
- **Too loose:** users cannot tell what must happen next after chaos.

### Construction issues and events — “non-fail” handling (v5 priority)

Field construction is **issue-prone by nature**. The product must offer a **primary path** that is **hard to get wrong**:

- **Guided capture** — logging an issue should **not** depend on users understanding internal workflow theory. Prefer a small number of **clear choices** (what happened, severity, who is affected, does this stop work) over a blank text box as the only structure.  
- **Always produces actionable state** — a meaningful issue should **mute signals** of the affected task/stage, automatically pausing downstream work and appearing in the **Workstation** as a blocker.
- **Ownership and causality by default** — every recorded issue should support answering: **what changed**, **who owns the next step**, **what is blocked**, without hunting through unrelated notes.  
- **Forgiving edits** — users should be able to **correct a mis-filed issue** or **re-scope follow-up tasks** without orphaning the job or breaking sold scope; commercial changes still flow through **explicit** change paths when needed.

This is the experiential counterpart to “flexible execution”: **events are first-class**, not a side channel where important work goes to die.

### Construction issue — MVP lifecycle (states)

Use a **small** default lifecycle so implementation stays predictable:

1. **open** — recorded, not yet triaged to a clear next operational posture.  
2. **triaged** or **in_progress** — owned next steps exist (may include spawned tasks).  
3. **resolved** — the issue’s driving concern is handled for operational purposes (may still leave follow-up history).  
4. **cancelled** or **misfiled** (optional) — duplicate, mistake, or withdrawn without implying the original problem was “fixed.”

**Anchoring:** an issue may block a **job**, **task**, **stage**, or **line item** by **muting** its signals. If the anchor is **unclear**, default to a **job-level** issue plus a **triage task** so ownership lands somewhere visible.

**Tasks vs issue closure:** completing a **spawned task** may **suggest** resolution but must **not silently close** the construction issue unless the product **explicitly** defines auto-close rules. Otherwise humans keep explicit control over issue lifecycle.

---

## 8. Customer-facing quote view

### Intent

Same underlying quote; **controlled disclosure** to the customer.

### Internal vs external

Internal quotes may contain detailed operational information. Customer-facing views show **only** what the company chooses.

### Customer-facing may include (when enabled)

Exact line items, simplified or grouped descriptions, optional details, payment schedule, terms, approval/signature area—**as configured**.

### Requirement

Users control whether customers see **exact internal structure** or a **cleaner presentation**.

---

## 9. Customer portal access

### Intent

Customers interact with **safe projections** of quotes and job information.

### Access patterns (canonical)

- Customer login (first-party Struxient auth UX—see below)  
- Secure email link  
- Secure SMS link  
- Future account-based patterns  

### Customer authentication (v5 preference)

**Customers** authenticate through **Struxient-native** flows: your **branding**, your **trust boundary**, and your **session / token / magic-link** model—see **I18** in [invariants-and-decision-rules.md](./invariants-and-decision-rules.md) (**no Clerk**; staff and customers alike).

- **Magic links and SMS links** remain **first-class** and compatible with this (Struxient-issued, first-party).  
- **Optional** richer login (e.g. customer password, OTP) is allowed if it stays **first-party**.  
- **Staff** sign-in uses the **same** first-party policy (I18); v5 may still use **different screens and flows** for staff vs customers, but **not** a different *class* of product (no Clerk for either).

### Canonical customer abilities (when enabled)

View quote, approve/sign, view payment schedule, pay, view selected job updates, upload/respond to requested information.

### Boundary requirement

Portal must not default to exposing **internal-only workflow** detail.

---

## 10. Signing and job activation

### Intent

Commitment is the **handoff** from commercial definition to operational truth.

### After sign / approval

Work moves into the **executable work system**. The quote remains the anchor for **what was sold** and what must be executed.

### Requirement

Users should **not** have to manually rebuild the job from scratch after signing; the transition should **materialize** executable structure consistent with the approved intent.

### Activation — MVP product behavior (not a technical saga)

- **Approved quote → job:** customer approval creates (or advances into) a **job** as the executable container.  
- **Sold line items** become the **job scope anchors** for commercial continuity.  
- **Quote-time tasks**, when present, **copy into** the job as **editable job instances** including their **Signal** wiring—the job graph is the operational home for refinement; quote-time structure is **seed**, not an unchangeable diagram.  
- **Signal Bus** is initialized; AI-suggested or manual signals become active.
- If **no** tasks exist at approval, activation still produces a **usable job container** with a **planning prompt** or **starter task** so execution is not a blank slate.  
- Activation **never mutates** **checkpoint proof** for what was approved at sign time; post-approval changes to sold terms flow through **change orders**, **approved change records**, and related canon paths—while **job execution** remains the operational home ([quote-truth-and-checkpoints.md](./quote-truth-and-checkpoints.md)).

---

## 11. Workstation experience (summary)

Detailed rules: [workstation-canon.md](./workstation-canon.md).

### Intent

The Workstation is where **executable work lives** as a **cockpit**: not “just a quote page,” not “just a task list,” but the place that surfaces **what needs action** and **what should happen next**. It is the **role-aware action-discovery surface** for the org—not a generic **navigation category** only (see [workstation-canon.md](./workstation-canon.md#authoritative-positioning)). **Jobs**, **tasks**, **quotes**, **customers**, and **schedule** pages may still exist for record-based wayfinding; the Workstation **aggregates attention and next steps across** them.

### Canonical surface areas (non-exhaustive)

Daily dashboard, jobs, tasks, calendar, analytics, priority views, assigned/blocked/upcoming work, payment-related blockers, crew/resource needs—composed to answer operational questions quickly. **Lenses and filters** (Focus, Ready, Blocked, Needs review, etc.) are **views inside** this surface, not a substitute for treating Workstation as the **main discovery destination** ([workstation-canon.md](./workstation-canon.md)).

---

## 12. Payment experience

### Intent

Money expectations must be **legible** and able to **gate** work when appropriate.

### Schedules

Schedules should be easy to understand **internally** and **externally**.

### Canonical tie-points (examples)

Quote approval, deposits, milestones, specific line items, before-work requirements, completion stages, final payment, change orders, custom company rules.

### Questions users and customers should be able to answer

What is owed, when, what work depends on payment, what is paid/unpaid, and whether payment **blocks** execution.

### Schedule vs gate vs task (short)

The **payment schedule** is **money truth**. **Payment gates** are **readiness rules** (Signals) derived from that truth. **Follow-up tasks** help people **act**; they are **not** the schedule. **Payment-block issues** explain stoppage; they **do not replace** the schedule. See [domains-and-boundaries.md](./domains-and-boundaries.md#boundary-payments-vs-scheduling-vs-tasks).

---

## 13. Attached operational information

### Intent

Execution context stays **attached** to the correct anchor (line item, task, quote, job)—not scattered.

### Examples of attachments (illustrative)

Crew/skill/equipment/parts/materials, photos/files/notes, safety and access instructions, scheduling constraints, inspection/permit needs, internal checklists, vendor requirements.

### Requirement

Avoid scattering critical execution details across unrelated areas when they belong to a **specific** sellable or doable unit.

---

## 14. Core product principle (restated)

See [overview.md](./overview.md). This experience canon exists to keep planning aligned with that principle: **quote defines sold work; templates speed; tasks execute; events adapt; workstation directs; portal discloses appropriately.**

---

*Canon update (2026-05-05): System signals vs user tags (§2); construction issue MVP lifecycle (§7); activation MVP behavior (§10); payment schedule vs gate vs task (§12).*  
*Canon update (2026-05-06): §10 activation — checkpoint proof vs CO / activity wording; link to [quote-truth-and-checkpoints.md](./quote-truth-and-checkpoints.md).*
*Canon update (2026-05-13): Signals recast as the primary readiness engine; AI Secretary introduced; Detours renamed to Events; Stages moved to org-scoped table.*  
*Canon update (2026-05-25): §6 — flow keeper (forgiving capture, enforced flow); cross-ref [product-philosophy.md](./product-philosophy.md).*
