# Glossary — Struxient v5

> **Scope:** Definitions are authoritative for **Struxient v5** (`Struxient_v5`) only.

## Product identity

| Term | Definition |
|------|------------|
| **Struxient v5** | This repository and product generation; canonical behavior lives under `docs/canon/`. |
| **Struxient** | Product family name; **v5** is the scoped line unless otherwise stated. |
| **Appearance (light / dark)** | v5 is **not** dark-only or light-only by intent: **both** modes must stay professional and legible for trade use, with a **user-facing** theme or appearance control planned for the shell (**I23**). |

## Roles and surfaces

| Term | Definition |
|------|------------|
| **Workstation** | Internal **role-aware action-discovery surface** and operational cockpit: surfaces what needs attention across jobs, tasks, quotes, schedule, payments, customer follow-ups, change orders, and related records—not merely a navigation category. Authoritative sentence: [workstation-canon.md](./workstation-canon.md) §Authoritative positioning. |
| **Customer portal** | Customer-facing surface with **controlled disclosure** of quotes, payments, approvals, and selected job updates. **Auth:** first-party (see I18); magic links / SMS links encouraged where appropriate. |
| **Struxient authentication (v5)** | **No Clerk.** First-party sessions and sign-in UI; **reference prior art:** Auth.js (NextAuth) v5 **Credentials** + **bcrypt** + **Prisma** as in **Struxient_v4** (email/password + org membership in session) or **Struxient_v3** (email/password/**tenantId** when tenant must be chosen at login). |
| **Authorization (authZ)** | **What** a principal may do and **which org’s data** they access—**after** auth. Implemented with **org-scoped resources** + **membership role** (staff) or **scoped portal tokens / customer grants** (customers); **always server-enforced** (I19). |
| **Organization context** | Active **company / tenant** bound to the session for staff; every internal entity that matters for isolation should be keyed for **server checks**. |
| **Membership** | Join of **User** ↔ **Organization** with a **role** (and optional metadata); primary lever for staff permissions inside an org. |
| **Invite (staff)** | Signed, expiring link or code used to create or link a **User** and **Membership** without shared passwords; preferred team onboarding pattern in canon. |
| **Customer-facing quote view** | Projection of a quote for customers; may simplify or group line items compared to internal authoring view. |
| **Internal quote view** | Full quote authoring view including operational fields not meant for customers by default. |

## Commercial and relationship objects

| Term | Definition |
|------|------------|
| **Lead** | Early-stage opportunity or inquiry; may auto-create from a channel or be manual; may or may not yet map cleanly to a customer. |
| **Customer** | Durable business relationship record; may exist with or without a preceding lead. |
| **Tag / label / metadata** | Non-exclusive signals describing origin, lifecycle state, or segmentation. **User tags** are manual/company-specific; **system-derived lifecycle signals** (e.g. has approved job, import provenance) should be modeled separately when the product already knows them—see [domains-and-boundaries.md](./domains-and-boundaries.md) (Customer graph). |
| **Quote** | **Working record** where the team defines **what is for sale**; may carry operational hints for later execution. **Commitment** and **immutable proof** at send/approve/activate are captured in **checkpoints**, not by turning the quote into a user-managed version tree—see [quote-truth-and-checkpoints.md](./quote-truth-and-checkpoints.md). |
| **Line item** | A row on a quote representing a sellable/billable unit; may carry tasks, resources, dependencies, and disclosure variants. |
| **Approval / signature** | Customer commitment boundary; triggers **activation** into executable work. |
| **Checkpoint** | **Hidden proof record** created at **commitment moments** (e.g. quote sent, approval/signature, job activation, approved customer-facing change) so the system can preserve **what was true** without making users manage “versions” as daily work—[quote-truth-and-checkpoints.md](./quote-truth-and-checkpoints.md). |
| **Change order (CO)** | Post-approval **append** of commercial scope/price (and linked tasks); does **not** silently rewrite **approved baseline truth** (checkpoint / execution rules)—[locked-decisions-v1.md](./locked-decisions-v1.md) §7. |
| **Job collaborator** | Subcontractor (or guest) **job-scoped** access grant; see **Subcontractor** in locked decisions §1. |
| **Construction issue** | Typed operational problem (delay, defect, inspection fail, payment block, …); **guided event** with required fields and optional **spawned tasks** — [locked-decisions-v1.md](./locked-decisions-v1.md) §10. **Must not** be only unstructured note when execution is affected (I16). **MVP lifecycle:** open → triaged/in_progress → resolved (optional cancelled/misfiled); task completion does not silently close the issue unless explicitly defined. |

## Execution and workflow

| Term | Definition |
|------|------------|
| **Task** | Actionable unit with ownership and state; may exist in lead prep, quote prep, or job execution contexts. |
| **Stage** | Phase-like **grouping** of work (often under a line item or within a job); may ship inside **composite templates** with tasks. |
| **Draft execution plan (quote-time)** | Stages/tasks attached **before approval** to rehearse or accelerate delivery; **internal operational intent**, not by default customer commitment. May be **partial** or **rich**. |
| **Job** (canonical umbrella) | Post-approval **executable container** for delivering sold work; name in UI may vary. |
| **Dependency** | Constraint where one piece of work requires completion or readiness of another (or of an external condition). |
| **Blocked** | Work cannot proceed for a **known reason** (should be attributable). |
| **Event / interruption** | Real-world change driving corrections, new tasks, pauses, detours, or return paths. |
| **Detour** | Temporary alternate path while preserving intent to return when appropriate. |
| **Return point** | Conceptual resume location after a detour or correction. |

## Accelerators

| Term | Definition |
|------|------------|
| **Template** | Reusable **catalog** entry; may be **line-item-only** or **composite** (line item + stages/tasks and other allowed bundles). |
| **Composite template** | Template that saves a line item **together with** nested execution shape (e.g., stages and tasks). |
| **Instance** | Materialized quote/job content derived from templates or manual authoring; editable independently per **I4** invariants. |

## Money

| Term | Definition |
|------|------------|
| **Payment schedule** | **Source of money truth**: structured expectations of **amounts, timing, and rationale**, possibly tied to milestones, line items, deposits, completion, or change orders. |
| **Payment gate** | **Readiness constraint** derived from schedule/org rules: **execution** (or a transition) may not proceed until payment conditions are met—not a substitute for the schedule itself. |

## Channel and provenance

| Term | Definition |
|------|------------|
| **Lead source** | Origin channel or mechanism (phone, SMS, email, web, portal, manual, integration). |
| **Provenance** | Trace of where information came from and how it entered the system. |

## Prior product lines (local repos)

| Term | Definition |
|------|------------|
| **Struxient_Full_Cursor** | **First / genesis** Struxient repo under **Projects**—early docs, epics, and ideas; **not** the live UI baseline for v5. |
| **Struxient v2 / v3 / v4** | Numbered follow-on **Projects** folders; **prior art** for v5. v5 canon **supersedes** them unless v5 explicitly imports a decision. **v2** is the recorded **preferred UI/UX baseline** (visual/interaction inspiration—not a mandate to copy routes, auth, or data model; see [lineage-and-prior-art.md](./lineage-and-prior-art.md)). |

## Usage notes (language discipline)

- Prefer **job** / **task** language in execution contexts; prefer **quote** / **line item** language in commercial contexts.  
- Avoid calling the Workstation a “portal”; **portal** implies customer audience.  
- Use **projection** when discussing customer-visible subsets of internal data.  
- Prefer **checkpoint** / **approval record** for preserved commitment truth; reserve **snapshot** for implementation innards (e.g. serialized payload inside a checkpoint), not primary UX copy.

---

*Canon update (2026-05-06): Glossary — **Quote**, **Checkpoint**, **CO** rows aligned with [quote-truth-and-checkpoints.md](./quote-truth-and-checkpoints.md); usage note on snapshot wording.*
