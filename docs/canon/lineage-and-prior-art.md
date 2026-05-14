# Prior Struxient lines and what v5 should carry forward (canon)

> **Scope:** This document is **orientation for Struxient v5** (`Struxient_v5`). It references sibling folders under the same **Projects** root as **prior art**, not as competing canon. Chronologically: **`Struxient_Full_Cursor`** (first / genesis), then **`Struxient_v2`**, **`Struxient_v3`**, **`Struxient_v4`**. Where older docs or code disagree with v5 canon files, **v5 wins**.

## How to read “failed attempts”

Earlier repos are **failed as wholesale end states**—not “failures at everything.” v5 should **mine** them deliberately: **UX patterns**, **route map completeness**, **schema ideas**, and **written architecture** are all assets. The recurring product failure mode across attempts is **not** “we had no ideas,” it is:

1. **Quote → execution → Workstation** did not stay a **clear, trustworthy path** under real use.  
2. **Execution workflow** was too often experienced as **rigid** (hard to draft during quote, painful to fix after sign, brittle when reality changed).  
3. **Construction issues and events** lacked a **simple, hard-to-mess-up** path from “something went wrong” to **owned follow-up work** visible in the cockpit.

v5 canon already addresses (1)–(3) elsewhere; this file ties them to **what to salvage from which repo**.

---

## Struxient_Full_Cursor — **first version (genesis)**

**Chronology:** This folder is the **very first Struxient** line—origin repo for ideas, early canon, epics, and exploratory structure before numbered v2–v4 iterations.

**Why it matters:** It establishes **DNA**: big `docs/` investment (e.g. canon_fresh, epics, legacy trees), early domain thinking (sales, portal, finance, intake), and the habit of **writing product intent down**—even when the runnable app later lived elsewhere.

**Keep / reuse:** Historical **story and epic threads**, early **terminology**, and **intake / portal / finance** notions worth **re-validating** against v5 canon (merge or discard explicitly—do not treat as silent truth).

**Leave behind:** Using it as the **current** UX or schema reference; **v2** is the preferred **UI/UX baseline**, and **v5 `docs/canon/`** is the only **live** canon index.

*Note:* If a local copy was ever created under a misspelled folder name, treat it as the **same lineage** as `Struxient_Full_Cursor` once reconciled on disk.

---

## Struxient v2 — **primary UI/UX and vertical-slice reference**

**Why it matters:** It is the most **complete application-shaped** line: real App Router pages for **quotes, jobs, workstation, portal quote preview, sales/leads/inbox, catalog, templates, packages, task definitions, flowspec, finance hooks, change orders**—closer to “Jobber-shaped surface area” plus Struxient’s execution ambition.

**Keep / reuse as inspiration (non-exhaustive):**

- **Information architecture and navigation** — the mental model of jumping between **sales**, **quotes**, **jobs**, and a **dedicated workstation** without everything living inside one quote screen forever.  
- **Workstation as a first-class route** (`/workstation` full-bleed style in v2) — matches v5 **cockpit** and **action-discovery destination** intent; v5 canon does **not** treat Workstation as “only a sidebar grouping” ([workstation-canon.md](./workstation-canon.md#authoritative-positioning)). Shell IA may evolve toward that intent without requiring a literal copy of v2’s route shape.  
- **Customer portal entry** for quotes — separation of internal vs external truth.  
- **Catalog / templates / packages** — aligns with v5 template granularity (line-only vs composite).  
- **Engineering hygiene** — typecheck gates, tests, template validation scripts: reuse the *discipline*, not necessarily every rule.  
- **Tech stack posture** (Next, Prisma, Tailwind, component library) — only where v5 explicitly chooses it; not canon by itself.

**Leave behind / redesign consciously:**

- Anything that made **flowspec / workflow builder** feel like the **price of admission** for quoting or executing. v5 prioritizes **flexible planning** via **Signals** and **post-sign refinement** over “draw the full machine up front.”  
- **Anti-FlowSpec stance:** v5 explicitly rejects the v2 "FlowSpec" engine (Workflow/Node/Outcome/Gate) as too complex for users. The **Signal Bus** is the lightweight replacement.
- Any UX that **locked** execution structure because it existed on the quote.  
- **Clerk** for authentication—v2 used Clerk; **v5 canon forbids Clerk** for any user class (**I18**). Reuse v2 **pages and layout patterns**, not its **auth vendor**.

**User preference (recorded):** **v2 UI/UX is the preferred aesthetic and interaction baseline** for v5 unless a deliberate redesign supersedes it.

### v2 baseline scope (what “baseline” means)

Treat **v2** as **visual and interaction inspiration** and the **preferred UI/UX baseline**—density, patterns, flows that feel “product complete.” It is **not** a mandate to copy **route structure**, **component architecture**, **authentication**, or **data model**. Where **v2 code or docs conflict with v5 canon**, **v5 canon wins**.

---

## Struxient v3 — **spine language and schema laboratory**

**Why it matters:** README frames **trade-first, line-item-fronted, packet-driven** commercial-to-execution spine—**conceptually aligned** with v5. The repo was positioned as **docs + Prisma**, with application code TBD.

**Keep / reuse:**

- **Vocabulary** (“line-item-fronted,” packets/chunks of reusable work) — harmonize with v5 **glossary** and **templates** canon.  
- **Schema and seed experiments** — useful when designing v5 data boundaries (quote vs job, activation), even if tables are rewritten.  
- **Authentication prior art** — **Auth.js (NextAuth) v5** with **Credentials** (email + password + **tenantId** in the form), **bcrypt**, JWT/session callbacks carrying **tenant + role**. Use when v5 needs **tenant explicit at login**.

**Leave behind:**

- Treating v3 as “the running app” — it was intentionally incomplete as a product surface.

---

## Struxient v4 — **architecture writing goldmine; implementation caution**

**Why it matters:** `docs/architecture/` (especially **execution-workflow**, **work-station**, **change-orders**, **customer-portal**, **data-model**, **calendar**) is the richest **written** articulation of lifecycle, outcomes, events, deterministic derivation, and role-aware feeds.

**Keep / reuse (as ideas) when porting into v5 canon selectively:**

- **Authentication prior art** — **Auth.js (NextAuth) v5** with **Credentials** (email + password), **bcrypt**, Prisma user lookup, session callbacks attaching **organization membership**—**no Clerk**. This is the **simpler default reference** for v5 staff login when tenant is not required on the sign-in form.  
- **Execution-first questions** (“what now,” blocked, ready, recommended next) — already mirrored in v5 `workstation-canon.md`.  
- **Sales vs sold split** bridged by the quote — aligns with v5 domains.  
- **Outcomes on tasks** driving **structured** follow-ups — good for **construction issues** if exposed as **simple choices**, not only a rules engine admin panel.  
- **Customer view as projection** — matches v5 hard boundary.  
- **“Deterministic ≠ rigid”** framing in v4 docs — **keep the definition** (repeatable explanations from recorded facts) **without** reintroducing a **rigid builder-first** product experience.

**Leave behind / defer until v5 proves the happy path:**

- Heavy emphasis on a **full deterministic execution engine** and **workflow graph authoring** as the **default** user burden before value is obvious.  
- Any implication that users must **perfect** the graph **before** quote sign-off to get a clean job; v5 explicitly allows **plan after sign** and **edit after sign**.

When mining v4, copy **principles and scenarios** into v5 discussions; do **not** treat v4 folders as live canon for v5.

---

## Product positioning sentence (v5)

**Jobber-class simplicity** on everyday objects (customers, quotes, schedule-ish views, getting paid) **plus** a **meaningfully better execution path**: tasks, ownership, blockers, and **event-safe** corrections that always land back in the **Workstation** as **clear next actions**.

---

## North-star concerns (from iteration history)

These are **explicit v5 priorities**, not generic startup goals:

| Concern | v5 response (where canon lives) |
|--------|---------------------------------|
| Clear **quote → execution → workstation** path | `experience-canon-lead-to-workstation.md`, `conceptual-model.md`, `invariants-and-decision-rules.md` (I3, I14–I15) |
| **Flexible** execution planning | `templates-and-execution-planning.md`, I14–I15 |
| **Construction issues / events** without failure modes | `experience-canon-lead-to-workstation.md` §7, `invariants-and-decision-rules.md` I16 |

---

*Canon update (2026-05-05): Added lineage guidance tying v5 priorities to prior Struxient folders and recorded v2 as preferred UI/UX baseline.*  
*Canon update (2026-05-05): Clarified v2 baseline scope (UI/UX inspiration; not route/auth/schema mandate; v5 wins on conflict).*  
*Canon update (2026-05-05): Named `Struxient_Full_Cursor` as the first (genesis) version; corrected folder naming in scope.*
