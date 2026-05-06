# Quote truth, checkpoints, and execution (v5)

> **Status:** Canon for **how truth is named and preserved** in Struxient v5. Complements [locked-decisions-v1.md](./locked-decisions-v1.md) §7 (change orders, re-sign) and [conceptual-model.md](./conceptual-model.md) without replacing them.  
> **Intent:** Keep **staff UX** on a **current-state-first** mental model; keep **immutable proof** in **hidden checkpoints**, not in a user-managed “version browser.”

## Canonical phrases

- **Quote** is the **working record** (what the team authors and revises under normal rules).
- **Checkpoint** is the **hidden proof record** created only when the product must preserve **what was true at a commitment moment** (send, approval/signature, activation, approved customer-facing change, void/supersede when needed).
- **Job** is the **execution record** materialized from the **approved checkpoint** (and related rules)—where day-to-day operational truth lives after activation.
- **Activity** (events, job activity, holds, corrections, approved change records) is the **explanation layer** after activation: **sold baseline** is not silently rewritten; **what changed and why** stays legible.

## What the main UI should feel like

Aligned with [experience-canon-lead-to-workstation.md](./experience-canon-lead-to-workstation.md):

- Current quote → edit quote → send quote → send update → approve change → activate job → view history.

## What the main UI must not center on

Do **not** design the primary experience around:

- editing frozen **snapshots** as the normal path;
- **Version 1 / Version 2 / Version 3** management as everyday work;
- side-by-side **frozen snapshot vs editable version** as the default mental model;
- treating **every autosave** as a new “quote version” users must reason about;
- a standing **“record proposal snapshot”** action unless it is clearly inside a **commitment** or **compliance** flow (not a generic save).

**Snapshots are not the workflow.** Checkpoints are **receipts / proof** behind the workflow. In architecture and code, **`snapshotJson` (or similar)** may appear **inside checkpoint rows** as an implementation detail when a denormalized capture is useful—**not** as the product vocabulary users navigate.

## Relationship to change orders (locked §7)

Change orders, re-sign thresholds, and **no silent mutation of sold customer-visible or monetary truth** remain as in [locked-decisions-v1.md](./locked-decisions-v1.md) §7 and [invariants-and-decision-rules.md](./invariants-and-decision-rules.md) **I20**. This document refines **where that immutability lives** (checkpoint + execution + activity) and **what not to expose** in the shell.

## Customer-facing projection (foundation)

The **internal “proposal preview”** and **customer-facing quote projection** (e.g. `customerDocumentTitle`, per-line customer scope fields, template defaults, controlled server projection) are **disclosure and authoring aids** on the **working quote**. They are **not** a substitute for **checkpoints** at commitment time unless the product explicitly defines an exception.

## Implementation naming (discouraged vs preferred)

| Avoid as **primary** public model names | Prefer |
|----------------------------------------|--------|
| `QuoteProposalSnapshot`, “proposal version” as a user-managed artifact | **`QuoteCheckpoint`** (or domain-specific: `QuoteSendCheckpoint`, `QuoteApprovalCheckpoint`) — exact table names are implementation, but the **concept** is **checkpoint / approval record** |
| “Quote version” for every edit | **Quote** (working) + **checkpoint** rows only at **commitment moments** + **activity** after job exists |

---

*Canon update (2026-05-06): Added v5 current-state-first model; checkpoints as hidden proof; jobs as execution; activity as explanation; UX and naming guardrails.*
