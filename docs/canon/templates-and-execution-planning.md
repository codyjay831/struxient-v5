# Templates and execution planning (quote vs job) — Struxient v5 (canon)

> **Purpose:** Lock in **product intent** for (1) what can be saved as a **template**, (2) how **execution planning** relates to **fast quoting**, and (3) why **post-signature workflow editing** must feel natural—not a punishment for having planned early on the quote.

---

## 1. What may be saved as a template (granularity)

Templates are **reusable catalog entries**. v5 canon explicitly allows **multiple granularities**, including **all of the following** (alone or in combination when the product supports packaging):

| Template shape (conceptual) | Meaning |
|----------------------------|---------|
| **Line item only** | Commercial row preset (scope/price patterns, descriptions, internal vs customer-facing text patterns)—**no** stages/tasks required. |
| **Line item + execution shape** | Same, but also saves **stages** (phase-like groupings) and/or **tasks** (and optionally crew/equipment/parts presets) as part of the reusable package. |

**Yes:** users can save **line items individually** as templates, **and** save **line items that include stages and tasks** (and related execution metadata) as templates. Those are **first-class, co-equal** template styles—not an either/or product philosophy.

Other template shapes already in canon (task-only, task groups, bundles) remain valid; this document **adds clarity** that **stages + tasks under a line item** are an expected part of “rich” templates when companies want repeatability for **how** work gets done, not only **what** was sold.

---

## 2. Two valid planning postures (both must be easy)

Struxient v5 must support **fast quote turnover** and **flexible execution planning** as **joint goals**, not a tradeoff where one destroys the other.

### Posture A — Plan during the quote (“front-load”)

Users may attach **stages, tasks, dependencies, resource hints** while quoting—especially when using templates or when the estimator already knows the crew path.

**Intent:** capture reality while context is hot; reuse next time via templates.

### Posture B — Defer execution detail until after the quote (“sell first, plan second”)

Users may ship a **commercially complete** quote with **minimal or no** execution graph, then **design or refine** the executable workflow **after** customer approval (or after deposit, mobilization, etc.—rules are product territory).

**Intent:** keep quoting lightweight when speed matters; **do not** force a full execution design to win the job.

### Canon requirement

Both postures must be **first-class**. The product must not implicitly say: “If you touched tasks on the quote, you chose the hard path forever.”

---

## 3. Known friction (acknowledged) and how v5 should behave

### The problem users hit elsewhere

When **tasks and stages** are attached **during quoting**, systems often blur:

- what is **sold / customer-facing**, vs  
- what is **internal execution draft**, vs  
- what is **locked** as soon as the quote is sent or signed,

…which makes it **difficult** to maintain a **clean execution workflow draft** on the quote and then **edit freely** once the quote is signed. Teams end up with **messy graphs**, **duplicate cleanup**, or **fear of planning early**.

### Canon stance for Struxient v5

1. **Commercial truth vs execution plan** — The **approved quote** anchors **what was sold** (line items, customer-facing disclosures, payment expectations). The **executable workflow** (tasks/stages on the job) is **operational** and must remain **editable** through normal delivery **without** rewriting sold scope unless a **controlled** change path (e.g., change order) says so.

2. **Draft semantics on quotes** — Execution structure on a **pre-approval quote** should be treatable as **planning intent** or **draft**: useful for speed (templates) and for internal rehearsal, but **not** treated as immutable customer commitment unless explicitly exposed to the customer (which canon discourages for internal tasks by default).

3. **Clean handoff, messy-free default** — Activation should **materialize** a job workflow that is **coherent** for the Workstation: inherit draft structure when present, **without** trapping users in a state where post-sign edits require painful workarounds. If the quote carried **no** execution draft, activation still produces a **usable** job container ready for planning.

4. **Post-sign editing is normal** — Refining assignments, order, dependencies, adding tasks for mobilization, inspections, or punch—after sign—is **expected behavior**, not an exception. Early planning on the quote should **accelerate** post-sign work, not **cement** a wrong plan.

*(Exact UX mechanics—e.g., explicit “draft” toggles, separate tabs, copy-on-activate behaviors—are implementation; **canon** requires the **outcomes** above.)*

---

## 4. Templates vs “create on the fly” (maturity curve)

### Early usage

Teams will **create on the fly** during quoting or on the job: ad hoc line items, ad hoc tasks, one-off ordering. That is **normal** for new adopters and for novel work.

### Maturing usage

Over time, organizations **tend to reuse** more **templates** (line-item-only and composite) because repeat work **stabilizes**. Canon expects **template adoption to grow with usage**—not because the product forces templates, but because **speed and consistency** reward catalog investment.

### Product implication

- **Fast path:** minimal fields, minimal execution on quote, plan after sign.  
- **Accelerated path:** templates (simple or rich) drop structure in **one action**.  
- **Neither path** should invalidate the other.

---

## 5. Relationship to other canon docs

- **Instance independence** and “no silent template bleed”: [invariants-and-decision-rules.md](./invariants-and-decision-rules.md) (I4).  
- **Quote vs job boundary** and continuity: [domains-and-boundaries.md](./domains-and-boundaries.md), [conceptual-model.md](./conceptual-model.md).  
- **Templates section** in journey doc: [experience-canon-lead-to-workstation.md](./experience-canon-lead-to-workstation.md) §5–§6.

---

*Canon update (2026-05-05): Clarified template granularities (line-item-only vs line item + stages/tasks), quote-time vs post-sign execution planning, draft-vs-sold separation intent, and template maturity curve.*
