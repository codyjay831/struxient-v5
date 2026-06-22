# Quote truth, checkpoints, and execution (v5)

> **Status:** Canon for **how truth is named and preserved** in Struxient v5. Complements [locked-decisions-v1.md](./locked-decisions-v1.md) §7 (change orders, re-sign) and [conceptual-model.md](./conceptual-model.md) without replacing them.  
> **Intent:** Keep **staff UX** on a **current-state-first** mental model; keep **immutable proof** in **hidden checkpoints**, not in a user-managed “version browser.”

## Canonical phrases

- **Quote** is the working record while `DRAFT`; once `SENT` or `APPROVED`, it is an immutable issued version.
- **Checkpoint** is the **hidden proof record** created only when the product must preserve **what was true at a commitment moment** (send, approval/signature, activation, approved customer-facing change, void/supersede when needed). **Quote checkpoints** primarily prove **commercial** commitments and controlled customer-facing projections; **execution plan confirmation** at activation (or immediately before) may use **additional** checkpoint or proof rows later—still **hidden receipts**, not a user-managed version browser.
- **Job** is the **execution record** materialized after customer approval **and** internal **Execution Review** confirmation (when that gate exists), from **approved commercial baseline** plus **confirmed execution planning**—where day-to-day operational truth lives after activation.
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

## Revision cloning (pre-activation commercial changes)

- A `SENT` or `APPROVED` quote is never reverted in place.
- Pre-activation commercial changes create a new `DRAFT` quote revision linked to the issued quote.
- The issued quote remains immutable proof; the new draft is sent/approved independently.
- Quote revisions do not carry accepted execution-plan state by default; planning is re-reviewed.

## Customer-facing projection (foundation)

The **internal “proposal preview”** and **customer-facing quote projection** (e.g. `customerDocumentTitle`, per-line customer scope fields, template defaults, controlled server projection) are **disclosure and authoring aids** on the **working quote**. They are **not** a substitute for **checkpoints** at commitment time unless the product explicitly defines an exception.

## Implementation naming (discouraged vs preferred)

| Avoid as **primary** public model names | Prefer |
|----------------------------------------|--------|
| `QuoteProposalSnapshot`, “proposal version” as a user-managed artifact | **`QuoteCheckpoint`** (or domain-specific: `QuoteSendCheckpoint`, `QuoteApprovalCheckpoint`) — exact table names are implementation, but the **concept** is **checkpoint / approval record** |
| “Quote version” for every edit | **Quote** (working) + **checkpoint** rows only at **commitment moments** + **activity** after job exists |

---

*Canon update (2026-05-06): Added v5 current-state-first model; checkpoints as hidden proof; jobs as execution; activity as explanation; UX and naming guardrails.*  
*Canon update (2026-05-06): Commercial checkpoints vs future execution/activation proof; Execution Review before job materialization.*  
*Canon update (2026-06-13): Locked immutable issued quote behavior after send/approval and revise-by-clone pre-activation.*

## v5 app slice: quote lifecycle statuses (Draft → Sent → Approved → Archived)

- **`QuoteStatus`:** `DRAFT` (commercial editing), `SENT` (commercial locked immutable issued version), `APPROVED` (commercial acceptance immutable issued version), `ARCHIVED` (read-only historical).
- **`QuoteCheckpointKind.SEND`:** hidden staff proof of **commercial proposal projection** at send; does not include internal execution planning.
- **`QuoteCheckpointKind.APPROVAL`:** hidden staff proof of **commercial acceptance** (same projection shape as send in v1; customer portal **Standard Acceptance** or staff-recorded acceptance; **Verified E-Sign** via external provider is a later mode on the same signature-request architecture).
- **Standard Acceptance:** Struxient first-party typed-name electronic acceptance — signer-specific link, frozen snapshot/PDF, consent, audit events, final packet.
- **Verified E-Sign:** external provider-backed signature (DocuSign / Adobe Sign / Dropbox Sign) through the same `QuoteSignatureRequest` / event / artifact timeline; not required for ordinary quotes.
- **Execution Review** remains an **internal** pre-activation step; **Job** runtime is still separate materialization.
- **Accepted whole-quote execution plan** is the v1 internal gate before job activation (`QuoteExecutionPlan.status = ACCEPTED` with matching planning-input hash).

## v5 app slice: Job runtime activation (minimal V1)

- **`Job`** is the runtime execution record; **one job per quote** (`Job.quoteId @unique`). `JobStatus` = `ACTIVE | ARCHIVED` in V1—no scheduling, holds, or financial closeout yet.
- **Activation** copies the approved quote's draft execution into runtime rows (`JobStage`, `JobTask`, `JobSignal`) inside one transaction; later quote / template edits **do not** mutate tasks already on the job.
- **Signal Bus** is materialized at activation. Any required signals without a provider are auto-satisfied (soft dependencies) unless marked as **Hard Signals**.
- **JobStage** rows are materialized from the org-scoped **Stage** table.
- **Activation readiness rules (whole-quote plan path):** quote must be `APPROVED`; execution plan must be `ACCEPTED`; accepted planning-input hash must match current deterministic hash; expected plan version must match; execution-relevant scope must have valid coverage; dependency blockers and blocking issues must be resolved.
- **No execution-confirmation checkpoint** at activation in V1—`Job.activatedAt` is the proof. A future `ACTIVATION` checkpoint may be added if customer-facing acceptance proof of activation is needed.
- **Customer-facing checkpoints unchanged**: SEND / APPROVAL projections stay commercial-only; no internal execution leakage at activation.
