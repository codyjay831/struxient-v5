# Locked product decisions — v1 baseline (Struxient v5)

> **Status:** **Canon** for v1 planning and implementation unless explicitly superseded by a dated canon update.  
> **Principle:** Prefer patterns that already work in **Struxient_v3 / v4** and familiar trade software, unless a clearly better approach serves the **execution wedge** (line items → stages/tasks → templates → change orders → **construction issues / events** → **Workstation**).

## Competitive posture (why this stack is the edge)

Mainstream **Jobber-class** tools optimize **simplicity** and day-to-day CRM/scheduling; heavy **construction PM / ERP** tools optimize **control** and often burden small trades. **Struxient v5** intentionally occupies a **focused wedge**: **commercial line items** stay the anchor; **stages and tasks** carry execution; **templates** speed repeat work; **change orders** keep sold truth honest; **construction issues** (typed events) keep reality from derailing the board; the **Workstation** makes **next action** obvious. Other apps have **good** scheduling or **good** tasks; fewer tie **quote → job → events → cockpit** as one coherent spine **without** forcing a rigid pre-built workflow. This doc **locks v1 choices** that support that wedge.

---

## 1. Staff RBAC — roles, crews, subcontractors

### Role enum (staff `Membership.role`)

| Role | Purpose (v1) |
|------|----------------|
| **Owner** | Full org control; billing; delete org; manage all memberships. |
| **Admin** | Same as Owner except **destructive org deletion** and **owner transfer** (product may still gate those to Owner only). |
| **Office** | Leads, customers, quotes, jobs, scheduling views, payments **recording**; template library; cannot change **sensitive integration secrets** unless Admin. |
| **Field** | **Assigned** work: tasks (and jobs) where user is **assignee** or member of **assigned crew**; add notes, photos, complete tasks; **no** org-wide financial admin by default. |
| **Viewer** | Read-only across org (for bookkeeper / investor view). |
| **Subcontractor** | **Job-scoped only** (see below); never org-wide quote/job list without explicit job grant. |

### Crew vs user

- **User** = login identity (`Membership` + role).  
- **Crew** = **named team** (e.g. “Crew A”) used for **dispatch and filtering**; **CrewMember** links `userId` ↔ `crewId`.  
- **Field** visibility: user sees tasks assigned to **them** **OR** to a **crew** they belong to **OR** (optional v1 rule) tasks with **no assignee** on jobs they’re **job manager** on—**default v1**: **assignee OR crew** only; unassigned pool visible to **Office+** on Workstation **Unassigned** lens.

### Subcontractors and non-employee access

- Subcontractors are **Users** with role **Subcontractor** and **JobCollaborator** (or equivalent) rows: `(jobId, userId, permissions)`.  
- **Permissions** on collaborator: `view_job`, `view_tasks`, `update_assigned_tasks`, `upload_files`, `comment` — **v1 default**: view + upload + complete **only tasks explicitly assigned to them** on that job. **No** default access to **internal cost** or **other jobs**.  
- **No separate “sub portal product”** in v1: same app shell, **heavily filtered** nav and job URL access enforced **server-side** (I19).

---

## 2. Lifecycle naming — leads, quotes, jobs

### Lead states

| State | Meaning |
|--------|---------|
| `open` | Active lead; not yet converted or closed. |
| `qualifying` | Optional—used when company wants explicit pipeline stage (else stay `open`). |
| `quoted` | At least one quote sent or linked; still a lead until converted. |
| `converted` | Linked to **customer** and primary opportunity captured; may still have open quotes. |
| `lost` | Closed lost. |
| `archived` | Inactive / noise cleared from default views. |

### Quote states

| State | Meaning |
|--------|---------|
| `draft` | Editable; not customer-visible. |
| `sent` | Customer-facing link active; still editable only per product rules (prefer explicit **send update** / supersede flows over silent drift; checkpoints capture sends—see [quote-truth-and-checkpoints.md](./quote-truth-and-checkpoints.md)). |
| `approved` | Customer commitment recorded; triggers **job activation** path. |
| `declined` | Customer declined or company voided. |
| `expired` | Past validity without approval. |
| `superseded` | Replaced by a newer quote revision for same opportunity. |

### Job states

| State | Meaning |
|--------|---------|
| `scheduled` | Sold work exists; mobilization / start date may be set; not necessarily in progress. |
| `active` | Execution in flight. |
| `on_hold` | Paused (customer, weather, payment, etc.); Workstation shows **hold reason** when possible. |
| `complete` | Work satisfied operationally; may still have **financial closeout**. |
| `closed` | Administrative done; archive-friendly. |
| `cancelled` | Job will not be executed (void after sold—rare; use events + CO where possible). |

**Note:** Exact DB enum strings may vary; **semantic** equivalence to this table is required unless canon is revised.

---

## 3. Accounting — ledger vs payments vs QBO/Xero

| Layer | v1 decision |
|--------|-------------|
| **In Struxient** | **Payment schedules**, **invoices/deposits/milestones**, **mark paid**, **payment blocks** on work when configured. **Job- and quote-level** revenue alignment for execution—not a full **GL**. |
| **General ledger** | **Out of scope for v1** inside Struxient. |
| **QuickBooks / Xero** | **Phase 2**: sync or export (customers, invoices, payments); v1 may include **CSV export** and **external reference id** fields on payments for manual reconciliation. |

---

## 4. Lead intake — deduping, assignment, queues

| Topic | v1 decision |
|--------|-------------|
| **Deduping** | **Warn-only** on create: same **normalized phone** or **email** within org shows **duplicate suggestion**; **no auto-merge** without user confirm. |
| **Auto-assignment** | **Off by default**; optional org setting: **round-robin** among **Office** role users or **route by tag/source** (simple rules). |
| **Queues** | Single **Inbox** list: `open` leads with optional **owner** filter; **unassigned** filter for triage. |

---

## 5. Calendar and scheduling — v1 depth

| Topic | v1 decision |
|--------|-------------|
| **System of record for “when”** | **Tasks** carry **due / start / end** (as needed); **Appointments** (optional entity or task subtype) for **hard calendar blocks** (customer install window). |
| **Calendar UI** | **Month/week/day** views reading **task dates + appointments**; **drag reschedule** updates underlying task/appointment **server-side** with permissions. |
| **Depth** | **No** full resource-leveling engine in v1. **Workstation** and calendar stay consistent: if it’s on the calendar, the **task/appointment** reflects it. |

---

## 6. Multi-tenant shape — product default

| Topic | v1 decision |
|--------|-------------|
| **Model** | **One Organization per customer company** (the contractor). Users belong via **Membership**; **activeOrganizationId** in session ( **Struxient_v4-style** ). |
| **Multi-org users** | **Supported**: accountant or owner of two businesses switches **org context** in-app (switcher); **not** tenant-in-login-field by default. |
| **v3-style tenant at login** | Reserved for **hosted multi-tenant** deployments where one login server serves **unrelated** companies and **must** disambiguate at sign-in—**not** the default product posture for typical single-brand SaaS. |

---

## 7. Change orders — sold scope, re-sign, tasks

**v5 posture (UX + truth):** Staff work from the **current quote** as the **working record**; **immutable proof** of what was committed at send/approve/activate lives in **hidden checkpoints** (receipts), not in a user-managed “version browser.” See [quote-truth-and-checkpoints.md](./quote-truth-and-checkpoints.md). Denormalized captures (e.g. JSON) may live **inside checkpoint records** as an implementation detail.

| Topic | v1 decision |
|--------|-------------|
| **Approved quote** | Customer commitment is recorded; **a checkpoint** preserves **immutable proof** of **what was approved** (line items, totals, customer-facing text at sign time). **Must not** silently rewrite that proof for **customer-visible or monetary** sold truth—use **change orders** and related paths. |
| **Scope or price change after approval** | Done through a **Change order** artifact: **new line group / lines** (or explicit CO document) **appended** to the job’s **commercial record**—**not** silent edits to the **approved baseline** encoded in the checkpoint / execution rules. |
| **Minor corrections** | **Typo / internal-only** fixes may use **administrative correction** with audit; anything **customer-visible or monetary** goes through **CO** or an explicit **new quote / supersede path** per org policy—without pretending the prior commitment never happened. |
| **Customer re-sign** | **Required** when CO changes **customer total**, **legal scope**, or **payment schedule** in a material way; configurable **threshold** (e.g. any price change) default = **always re-approve** for any CO with price impact. |
| **Task graph** | CO may **add tasks**; optionally **flag** existing tasks as **review required** when CO affects their line item. |

---

## 8. Payments — processor, modes, blocks

| Topic | v1 decision |
|--------|-------------|
| **Processor** | **Stripe** (or equivalent PCI **payment intent** provider) for **in-app** card/ACH where enabled; **invoice-only** path: record **external** payment + reference. |
| **Modes** | **Deposits**, **milestones**, **balance**; tie milestones to **line items or phases** when useful. |
| **Blocks work** | Org-configurable: **deposit required before `scheduled` → `active`**; **milestone paid before phase tasks unlock**—default **on** for deposit if schedule says so; milestones **off by default** until configured. |

---

## 9. Customer portal v1

| Topic | v1 decision |
|--------|-------------|
| **Access** | **Link-first** (magic / SMS) as **primary**; **optional customer password account** may ship shortly after if needed. |
| **Uploads** | **When enabled per quote/job request** (office toggles); **virus scan / size limit** (see §12). |
| **E-sign** | **Vendor acceptable** (HelloSign / Dropbox Sign / DocuSign, etc.) with **Struxient-owned** redirect and return URLs and **in-app status**—compliant with **I18** (no Clerk; **your** UX owns the journey). |

---

## 10. Construction issues — event types, fields, task spawn

### Minimum event types (v1)

`customer_change`, `site_condition`, `material_delay`, `schedule_slip`, `inspection_fail`, `payment_block`, `weather`, `internal_error`, `scope_clarification`, `other`

### Required fields (create)

| Field | Rule |
|--------|------|
| **type** | One of enum above. |
| **title** | Short human label. |
| **severity** | `blocks_work` \| `does_not_block` (default `blocks_work` for inspection/payment types). |
| **job** | Required once job exists; on pre-job quote phase, **optional** with link to quote. |
| **owner** | Defaults to creator; **reassignable**. |

### Default “spawn tasks” behavior

| Type | Suggested auto-tasks (user can cancel) |
|------|----------------------------------------|
| `inspection_fail` | “Re-inspection schedule”; “Document corrective work” |
| `payment_block` | “Follow up payment” (Office assignee) |
| `material_delay` | “Confirm revised ETA”; “Notify customer” |
| `customer_change` | “Draft change order” (Office) |
| `other` / generic | Single “Triage issue” task |

**Canon:** every **blocks_work** issue **must** surface on **Workstation** blocked/next logic (already I16–I17 family).

### Issue lifecycle (MVP; aligns with experience canon)

Default states: **open** → **triaged** or **in_progress** → **resolved**; optional **cancelled** / **misfiled**. Anchor blockers at **job / task / stage / line item** when clear; if unclear, **job-level issue + triage task**. **Task completion** does not **implicitly** close the issue unless the product explicitly defines auto-close—see experience canon §7.

---

## 11. Workstation v1 — default landing and tabs

| Topic | v1 decision |
|--------|-------------|
| **Default landing** | **My work today**: assigned tasks + **blocked** + **overdue** + **payment-blocked** jobs touching user. **Toggle** to **Company today** board for Office+. |
| **Tabs / lenses** | **Today** · **Tasks** · **Jobs** · **Schedule** (read/write per permissions). **Payments** as **widget + filter**, not necessarily top-level tab v1. **Analytics**: **hidden or stub** until execution metrics stable. |
| **Product surface** | Workstation is a **destination** and **role-aware action-discovery surface** across operational records—not **defined by** whether the shell uses a single route, grouped sidebar links, or other chrome. Tabs/lenses are **views inside** that surface (see [workstation-canon.md](./workstation-canon.md)). |

---

## 12. Second wave (explicitly after v1)

| Area | Direction |
|------|-----------|
| **Mobile** | **Responsive PWA** first; **native** apps later if metrics justify. |
| **Offline** | **Read cache** nice-to-have; **offline writes** deferred (conflict risk). |
| **Notifications** | **Email** v1; **SMS** via provider integration; **push** with PWA later; **quiet hours** org setting (default off). |
| **Files / photos** | Default cap **25 MB** per file (org-configurable); retention **job lifetime + 7 years** default (configurable); customer-visible only when **projection** allows. |
| **Reporting** | **Execution metrics** first (cycle time, task SLA); **job costing / win rate** phase 2. |
| **White-label** | **Logo + primary colors** on portal and PDFs v1; **custom domain** later. |
| **Imports** | **CSV** customers/leads v1; **Jobber / Housecall** etc. **phase 2** imports. |

---

## 13. Edge summary (locked)

**v1 product edge =** **Line items** (commercial truth) **+** **stages** (grouping) **+** **tasks** (execution) **+** **templates** (speed) **+** **change orders** (honest sold scope) **+** **construction issues** (typed events → tasks/blockers) **+** **Workstation** (cockpit). Other tools may beat Struxient on **pure CRM** or **pure calendar**; v1 **does not** chase parity there at the expense of this spine.

---

## Canon maintenance

When changing any row in this file, add a one-line **Canon update (YYYY-MM-DD): …** note at the bottom.

---

*Canon update (2026-05-05): Initial v1 locks for RBAC, lifecycles, accounting boundary, intake, calendar depth, tenancy, CO, payments, portal, construction issues, Workstation, second wave, and edge statement. §11 — added **Product surface** row (Workstation as destination / role-aware action-discovery; tabs/lenses as views inside the surface).*  
*Canon update (2026-05-05): §10 — MVP construction issue lifecycle + anchoring + task vs issue closure clarification.*  
*Canon update (2026-05-06): §2 quote `sent` row + §7 — aligned **approved truth** language with **checkpoint** model and [quote-truth-and-checkpoints.md](./quote-truth-and-checkpoints.md); “administrative revision” → **administrative correction**.*
