# Invariants and decision rules — Struxient v5 (canon)

> **Purpose:** Short, enforceable rules for product and engineering. If an implementation conflicts with an item here, **either change the implementation or update canon explicitly**—do not “quietly disagree.”

## I1 — Version scope

All artifacts in `docs/canon/` describe **Struxient v5** only. Other repos or versions are not authoritative unless linked.

## I2 — Quote as commercial anchor

The **baseline for what was sold** at activation time is defined by the **approved checkpoint** (proof of what was committed) plus explicitly attached customer-facing terms. The **Quote** remains the team’s **working record** for ongoing authoring where product rules allow—see [quote-truth-and-checkpoints.md](./quote-truth-and-checkpoints.md).

- **Must not:** silently discard sold line structure on activation without user-visible reconciliation.  
- **Must:** support a **customer-facing projection** distinct from internal operational detail.

**v5 app slice:** after **`APPROVED`** (commercial acceptance recorded), **internal** quote-line draft execution may still be edited until **job activation** exists—commercial checkpoints and customer projections remain **commercial-only** (no internal execution leakage).

**v5 app slice (Job runtime V1):** **activation** is the boundary at which execution becomes runtime: `Job`, `JobStage`, `JobTask`, and `JobSignal` rows are materialized. Activation copies the quote's draft execution tasks including their **Provides** and **Requires** signal wiring. Later quote / template edits **must not** mutate already-activated job tasks—runtime rows preserve lineage (`sourceQuoteLineItemId`, `sourceQuoteLineExecutionTaskId`, `sourceTaskTemplateId`) but never live-read from the source.

## I3 — No manual rebuild as the default activation path

After customer **approval / signature**, the system **must** provide a **direct materialization** of executable work aligned to the approved quote intent.

- **Must not:** require users to re-enter the same scope as the **default** path to begin work.  
- **Must:** auto-satisfy any required signal that has no provider in the job at activation time **unless** the task is marked as requiring a **Hard Signal**.
- **May:** allow optional reconfiguration when reality demands it, with **traceability** (event/correction posture).

## I4 — Template instance independence

Applying a template to a quote or job creates an **instance** editable in that context.

- **Must not:** unintentionally mutate other quotes/jobs when editing an instance.  
- **Must not:** unintentionally mutate the library template when editing an instance.  
- **Must:** provide an **explicit** user action to update a library template from an instance when that is intended.

## I5 — Internal vs customer visibility

Internal workflow detail **defaults hidden** from customers.

- **Must:** treat portal and customer-facing quote views as **controlled disclosures**.  
- **Must not:** expose full internal task graphs, internal notes, or crew assignment details by default.

## I6 — Blocker attributability

If work cannot proceed, the system should represent **a attributable reason** (payment, dependency, missing artifact, schedule conflict, approval, etc.), not merely “stuck.”

## I7 — Events have causal ownership

Non-trivial interruptions should record **what happened**, **what is required next**, and **who owns the next step** at the experience level (storage mechanism is implementation).

## I8 — Flexibility via Signals

Workflow structure must support **dependencies and ordering** via a **Signal Bus** without becoming **brittle** to normal change.

- **Must not:** rely on internal database IDs for task-to-task dependencies; use named **Signals** (e.g., `roof-sealed`) instead.
- **Must not:** adopt a model where legitimate field changes routinely destroy executability without a recovery path.  
- **Must:** support **Events** that can hijack signals to pause work and provide a return path.

## I9 — Payment schedule as Signal provider

Payment expectations must be understandable **before** and **after** signing, internally and (where applicable) in the portal.

- **Must:** represent **what is owed**, **when**, and **whether work is gated** by publishing a signal (e.g., `payment:deposit:cleared`) when conditions are met.

## I10 — Workstation is action-first

The Workstation’s primary obligation is **operational clarity** (now / next / blocked / changed), not recordkeeping aesthetics.

## I11 — Intake extensibility

Lead creation must remain compatible with **multiple sources** and **future integrations** without redefining “what a lead is” per channel.

## I12 — Tagging over false rigidity

Customer classification should prefer **tags and signals** over forcing a single rigid category when the business is not configured for rigidity.

## I13 — Template granularities coexist

The template library **must** support saving **line-item-only** templates **and** **composite** templates that include **line items with stages and/or tasks** (plus other allowed metadata), without forcing users into only one style.

## I14 — Quote-time vs post-sign execution planning

The product **must** support:

- **Planning execution during the quote** (optional richness: tasks on line items, often from templates with pre-wired signals), **and**  
- **Deferring execution planning until after approval** (commercially complete quote, minimal or no signal wiring),

**both** as first-class paths. Neither path may be the only “correct” workflow.

## I15 — Post-sign workflow refinement

After customer **approval / signature**, users **must** be able to refine the internal execution plan—during **Execution Review** (pre-activation) and again on the **job** after activation (tasks/stages, assignments, signal wiring, additions)—as **normal operations**. Quote-time execution drafts **may** carry forward but **must not** create a canonically “locked” internal graph that can only be changed by rebuilding the sold quote, except through explicit **change-order / recommit** flows that affect **sold scope**.

## I16 — Construction issues and events: signal muting

Recording a **construction issue** or operational **event** (delay, defect, discovery, failed inspection, supply problem, etc.) **must** have a **primary, low-error path** that:

- **Produces attributable state** (cause, owner, and signal-blocking behavior)—not **only** an unstructured note.  
- **Mutes signals** of the affected task/stage so downstream work is automatically paused.
- **Surfaces in the Workstation** (or equivalent operational home) so “what now” stays trustworthy.  
- **Allows correction** if the user misclassified the issue, without corrupting **sold commercial baseline** except through explicit change-order / scope flows.

**Must not:** rely on free-text alone as the only system-visible record for issues that should drive execution.  
**May:** add rich text and attachments **in addition** to structured capture.

## I17 — Quote → execution → workstation continuity (north star)

The end-to-end story **lead / quote → customer commitment → executable job → Workstation clarity** is a **north-star integration**. Features may ship incrementally, but **must not** regress toward **disconnected silos** where users cannot see how **sold scope** became **today’s tasks**, or where **events** fail to update **next action** truth.

## I18 — First-party authentication; no Clerk

**All** Struxient v5 authentication—**internal staff** and **customers**—**must** be **first-party**: Struxient-controlled **UX**, **sessions/tokens**, and **trust boundary**.

- **Must not:** use **Clerk** (or any Clerk-hosted / Clerk-branded sign-in) for **any** user class.  
- **Must not:** substitute another **hosted identity widget** (customer- or staff-facing) as the **default** sign-in experience when it replaces Struxient’s own login surfaces—**magic links**, **SMS links**, **email+password**, and future first-party methods remain in bounds.  
- **May:** use third-party **infrastructure** (email send, SMS, captcha, hosting) that does **not** own the **account** or **sign-in UI**.

### Prior-art baseline (v3 / v4 — not mandatory file-for-file)

**Struxient_v4** and **Struxient_v3** both implement **Auth.js (NextAuth) v5** with a **Credentials** provider, **bcrypt** password verification, and **Prisma**-backed users—**first-party**, no Clerk. That stack is the **default reference** for v5 unless a future canon update replaces it.

| Line | Login shape (summary) | When to lean on it |
|------|------------------------|-------------------|
| **v4** | Email + password; session enriched with **organization membership** from Prisma | Simpler default when a single org context per deployment or post-login org pick is acceptable. |
| **v3** | Email + password + **tenantId** in the credential form; JWT carries tenant + role | When **tenant must be known at sign-in** (explicit multi-tenant login). |

**“Better than v3/v4”** for v5 means **same architectural family** (first-party sessions, your UI) plus **product hardening** over time—rate limiting, device/session management, optional MFA or passkeys, audit—**not** reverting to hosted identity widgets.

### Customer portal (same I18)

Customer access still favors **magic-link** and **SMS-link** flows where they reduce friction; those remain **Struxient-issued** first-party patterns, not exceptions to I18.

## I19 — Server-side authorization

**Permissions** (org scope, role, assignment, customer token scope) **must** be **enforced on the server** for every mutation and for sensitive reads. **Must not:** rely on **client-only** hiding of navigation or buttons as the sole protection.

## I20 — Change orders for post-approval commercial delta

**Customer-visible or monetary** changes to **approved** sold scope **must** go through a **change order** (append model) or an explicit **new quote / supersede path** per [locked-decisions-v1.md](./locked-decisions-v1.md) §7—**must not** silently mutate **approved baseline truth** (checkpoint / execution rules). **Customer re-approval** follows the rules in that section (default: re-approve when CO has **price impact**).

## I21 — v1 multi-tenant default

**Default** SaaS posture: **one Organization per contractor**, **active organization in session** (v4-style), **org switcher** for users in multiple orgs. **Tenant-at-login** (v3-style) is **only** for an **explicitly configured** deployment mode—not the default customer-facing product story. Details: [locked-decisions-v1.md](./locked-decisions-v1.md) §6.

## I22 — Engineering delivery standards

Struxient is built for **real operators and customers**. Implementation should meet a **product standard**, not a “minimal pass,” demo-only bar, or throwaway scaffold.

- **Must:** ship **user-visible** work on the **production-shaped** application path—the **same** routing, chrome, auth, and UX discipline end users experience—not a separate **dev preview**, throwaway shell, or parallel “builder-only” surface as the **primary** home for the feature.
- **Must:** keep each slice **coherent** with existing code (naming, layout patterns, server-side enforcement, errors, empty states) so it is **safe to extend**, not a one-off that forces a later rewrite.
- **Must not:** treat **temporary** artifacts (stub-only pages, placeholder flows, duplicate preview UIs, `_temp`-style experiments checked in as the **done** state) as acceptable product. Prefer **smaller real surfaces** over **broad fake ones**; if scope is cut, the code that **does** ship should still be **real product**, not scaffolding labeled “temporary.”

## I23 — Light and dark appearance (shell / design system)

Struxient v5 supports both light and dark appearance modes. The design system should preserve the same professional, clear, trade-focused product feel in both modes; neither mode should be treated as a throwaway variant.

- **Must:** design tokens, components, and **app shell** chrome so that **light** and **dark** are both **first-class**—readable, calm, and appropriate for **construction / trade** daily use.  
- **Must:** plan for a **user-controlled** appearance control (e.g. theme toggle or explicit light / dark / system choice) in the product shell; **must not** treat v5 as **dark-only** or **light-only** by product intent. (Implementation may temporarily follow **system** preference only; that is not a license to ignore the second mode in design work.)  
- **Light mode** should stay **clean and legible**—professional neutrals, sufficient contrast, **not** toy-like or novelty styling.  
- **Dark mode** should stay **polished and high-contrast** where it matters for text, borders, and focus—without crushing hierarchy or hiding state semantics.

## I24 — Stages are presets and containers; tasks are the execution power layer

> **Canon phrase:** Stages are presets and containers. Tasks are the execution power layer.

MVP execution planning ships **default stage containers** so users do not have to design stages from scratch. The real operational power in v5 lives in **line items, tasks, signals, activity history, and customer / job changes**—not in stage architecture.

The **default MVP stage preset** is **Standard Project**: **Pre-Construction → Engineering & Permits → Materials → Installation → Final Inspection & Closeout**. These are stored in an org-scoped **Stage** table, not a hardcoded enum.

- **Must:** treat stages as **lightweight default containers / presets** that group tasks for legibility; depth and ordering live on **tasks** (via signals), not on stages.  
- **Must:** keep the implementation **preset-flexible**—presets must be able to be **renamed, hidden, merged, specialized, or selected** per real contractor usage.
- **Must:** support **Stage Gates** where a stage can require or provide signals.
- **Must not:** introduce **kanban** language (no “board / column / swimlane” framing for stages).  
- **Must not:** introduce **placement** language (stages do not “place” line items or tasks).  
- **Must not:** force users into a single rigid stage model; the **Stage** table is the source of truth.
- **Must not:** push expressive depth (custom workflow design, kanban-style operations, placement semantics) into stages in MVP.

Detailed product framing and the do/do-not list live in [templates-and-execution-planning.md](./templates-and-execution-planning.md) §6.

---

## Default decision rules (when product is ambiguous)

These are **defaults** for builders when canon does not specify a finer rule:

1. **Prefer explicit state over implicit lore** for execution (tasks should reflect reality).  
2. **Prefer attachment to anchor** (line item/task/job) over global free-floating notes for execution-critical detail.  
3. **Prefer customer safety** when unsure whether to show something in portal.  
4. **Prefer continuity** from quote to job when unsure whether to duplicate or link—**never** silent loss of sold scope.  
5. **Prefer progressive disclosure** in the Workstation over forcing all users into advanced views.  
6. **Prefer separating sold scope from internal execution drafts** when UX ambiguity would otherwise trap users between “messy quote graph” and “can’t fix after sign.”  
7. **Prefer a guided “log issue” flow** over expecting users to manually rebuild graphs when reality goes sideways.  
8. **Prefer [locked-decisions-v1.md](./locked-decisions-v1.md)** for v1 product constants (roles, states, payments, portal) when other prose is silent or ambiguous.

---

## Canon change protocol (lightweight)

When product decisions contradict prior canon:

1. Update the relevant canon file with the new rule.  
2. Add a one-line **“Canon update (date): …”** note in that file’s footer or changelog section.  
3. Update [glossary.md](./glossary.md) if terminology shifts.

---

*Canon update (2026-05-05): Added I22 — engineering delivery standards.*

*Canon update (2026-05-06): Added I23 — light and dark appearance (shell / design system).*  
*Canon update (2026-05-06): I2 + I20 — **working quote** vs **checkpoint** / approved baseline wording; link to [quote-truth-and-checkpoints.md](./quote-truth-and-checkpoints.md).*  
*Canon update (2026-05-06): Added I24 — Stages are presets and containers; tasks are the execution power layer. Default MVP preset **Standard Project**; reserved future preset **Service Work**. Architecture must stay preset-flexible. Detailed framing in [templates-and-execution-planning.md](./templates-and-execution-planning.md) §6.*
