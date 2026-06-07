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

Users may attach **tasks and signals** while quoting—especially when using templates or when the estimator already knows the trade handshakes. AI may suggest these signals automatically based on task names.

**Intent:** capture reality while context is hot; reuse next time via templates.

### Posture B — Defer execution detail until after the quote (“sell first, plan second”)

Users may ship a **commercially complete** quote with **minimal or no** signal wiring, then **design or refine** the executable workflow **after** customer approval. The system auto-satisfies missing signals at activation to ensure work can start.

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

1. **Commercial truth vs execution plan** — The **approved quote** anchors **what was sold** (line items, customer-facing disclosures, payment expectations)—typically proven by **quote checkpoints** focused on commercial disclosure and commitment. The **executable workflow** is **operational**: teams refine it through an **Execution Review** step **after** customer signing and **before** **job activation** materializes runtime job stages/tasks; after activation, the **job** remains editable for real-world operations **without** rewriting sold scope unless a **controlled** change path (e.g., change order) says so. **Execution confirmation** at activation may later get its own **checkpoint / proof** row—separate from “what the customer saw,” same hidden-receipt posture as other checkpoints.

2. **Draft semantics on quotes** — Execution structure on a **pre-approval quote** should be treatable as **planning intent** or **draft**: useful for speed (templates) and for internal rehearsal, but **not** treated as immutable customer commitment unless explicitly exposed to the customer (which canon discourages for internal tasks by default).

3. **Clean handoff, messy-free default** — **Execution Review** (post-sign, pre-activation) should produce a **coherent** internal plan; **activation** then **materializes** runtime job work for the Workstation. Inherit draft structure when present, **without** trapping users in painful workarounds. If the quote carried **no** execution draft, the review + activation path still produces a **usable** job container ready for planning.

4. **Post-sign refinement is normal; post-activation ops edits are normal** — Refining the internal execution plan **after customer sign** during **Execution Review**, then refining assignments, signal wiring, and adding mobilization / inspection / punch tasks **on the job after activation**, is **expected**—not an exception. Early planning on the quote should **accelerate** delivery planning, not **cement** a wrong plan.

5. **Execution Review is quote-wide assembly** — Mixed template + ad hoc line-item drafts are expected input, not failure. During Execution Review, users may manually edit tasks/signals and use AI Secretary to propose quote-wide task additions and signal rewiring across lines (for example, permit-provider consolidation or missing-provider fixes). AI remains review-then-apply; no silent persistence.

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

## 6. Stage presets and the execution power layer (MVP stance)

### Canon phrase

> **Stages are presets and containers. Tasks are the execution power layer.**

Use this sentence when a feature, prompt, or design discussion needs to settle the question *“how heavy should stages be?”*. Stages are **lightweight default containers** that group work so users don't have to design phase architecture from scratch; they are **not** where v5 builds its operational power.

### Core model (MVP)

| Concept | Role in MVP execution planning |
|---------|--------------------------------|
| **Line item** | What was sold / scoped — the commercial anchor. |
| **Stage** | Lightweight default **container / preset** that groups tasks for legibility. In v5 MVP, signal gating is task-scoped; stage-level signal gates are deferred. |
| **Task** | The real **executable detail** — ownership, state, and **Signal-based readiness**. |

### Default MVP stage preset — **Standard Project**

The MVP ships with a default set of stages stored in an org-scoped **Stage** table. The five containers typically appear in this order:

1. **Pre-Construction**
2. **Engineering & Permits**
3. **Materials**
4. **Installation**
5. **Final Inspection & Closeout**

This preset is the default **on quote-line draft execution and on post-activation jobs** in MVP. Adding a task is a per-stage action. Users can rename, reorder, or add stages to fit their trade.

### Future possible preset — **Service Work** (not in MVP)

Reserved for smaller / shorter service execution. Service work **must use the same core line-item / stage / task model** driven by signals.

### Where the operational power lives

Stages **must not** become the main power layer. The real operational power in v5 stays in:

- **Line items** (commercial anchor)
- **Tasks** (executable detail)
- **Signals** (readiness and dependencies)
- **Activity history**
- **Approvals**
- **Execution records**
- **Daily logs**
- **Customer / job changes**

Features that would push expressive depth into stages (custom workflow designers, stage-level dependencies, kanban-style stage operations, placement semantics) **must not** ship in MVP. Stage-level signal gates are deferred in MVP runtime canon.

### MVP rules (do / do not)

- **Do** ship the **Standard Project** preset as the default container set so users don't design stages before they can quote or plan work.
- **Do** make adding tasks a **per-stage** action so the stage stays a lightweight container, not a dropdown the user has to reason about per task.
- **Do not** introduce **kanban** language anywhere in stage UX or canon.
- **Do not** introduce **placement** language (stages do not “place” line items or tasks).
- **Do not** force users to design workflows before they can **quote** or **plan** work.
- **Do not** split **service execution** into a separate task engine — use the same model with the smaller preset when it ships.
- **Do not** treat the five **Standard Project** stage labels as a forever model. MVP UI may show only these five today, but the **architecture must remain flexible** enough that presets can later be **renamed**, **hidden**, **merged**, **specialized**, or **selected** per real contractor usage. Code that hard-codes the five names without a preset abstraction is a canon violation.

### Relationship to existing canon

- §1 still allows **composite templates** that save line items together with stages and tasks. The MVP stance here narrows **stage architecture authoring** (we ship a default preset rather than a workflow designer), not template composition.
- §2 still requires both planning postures (**plan during quote** and **defer to post-sign**) as first-class. Default stage containers serve **both** postures — the preset is available on the quote and on the activated job.
- I3 / I4 / I8 / I13 / I14 / I15 still apply: post-sign execution refinement remains normal operations, and template instance independence is unchanged.

---

## 7. Field-informed plan adjustment (post-activation)

**Canon**

- §4 already treats **post-activation ops edits** as normal. This section locks **why**: the field teaches what the plan should have been.
- **On-the-job intelligence**—photos, checklist state, notes, daily logs, visits, issues, activity—is input to **understanding** and to **human-approved** adjustments on the job graph—not a separate “documentation only” silo.
- **AI** may eventually propose additions or rewiring from that intel; **apply** boundaries match quote and recovery paths. See [execution-engine-canon.md](./execution-engine-canon.md) §12 and [product-philosophy.md](./product-philosophy.md) §7.
- **Sold scope** still changes only through commercial control paths; internal plan edits are operational.

---

*Canon update (2026-05-05): Clarified template granularities (line-item-only vs line item + stages/tasks), quote-time vs post-sign execution planning, draft-vs-sold separation intent, and template maturity curve.*  
*Canon update (2026-05-06): Execution Review as post-sign / pre-activation gate; commercial checkpoints vs future execution/activation proof; post-activation job edits remain normal operations.*  
*Canon update (2026-05-06): After commercial **Approved**, internal quote-line execution planning may still be edited until **job activation**—per product rules; commercial checkpoints remain commercial-only.*  
*Canon update (2026-05-06): Activation copies execution into `Job` / `JobStage` / `JobTask` runtime rows (one job per quote); later quote/template edits do not mutate already-activated job tasks. Templates remain copy-forward, never live-linked into runtime.*  
*Canon update (2026-05-06): §6 — MVP stage-preset stance. Canon phrase: **“Stages are presets and containers. Tasks are the execution power layer.”** Default MVP preset **Standard Project** (Pre-Construction → Engineering & Permits → Materials → Installation → Final Inspection & Closeout). Reserved future preset **Service Work** for smaller service execution (same core model; no separate task engine). Architecture must stay preset-flexible; no kanban or placement language; no workflow designer before users can quote or plan.*  
*Canon update (2026-05-25): §7 — field-informed plan adjustment post-activation; cross-ref [product-philosophy.md](./product-philosophy.md) and [execution-engine-canon.md](./execution-engine-canon.md) §12.*
