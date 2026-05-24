# Product philosophy — Struxient v5 (canon)

> **Purpose:** Lock **why** Struxient exists and **how** product decisions should feel—not runtime engine rules (see [execution-engine-canon.md](./execution-engine-canon.md)) or v1 locks (see [locked-decisions-v1.md](./locked-decisions-v1.md)).  
> **Audience:** Founders, product, design, and engineers choosing between “another feature” vs “does this keep flow?”

---

## Authoritative positioning (verbatim)

> **Struxient is the flow keeper: messy capture in, human-approved structure, execution truth out—with office work as automated side effects, not a second job.**

Shorthand for internal use:

> **You work the job. We work the flow.**

---

## 1. Who we build for

**Primary:** **small trade companies and small crews**—often where the **owner sells** and the **same people execute**. Roofers, HVAC, solar, remo, specialty subs—not enterprise GC mandates.

**Posture:**

- They **do not** want to live in software or do office work.  
- They **are** good at their trade and **messy** at admin—and that is normal.  
- They need **execution clarity** more than CRM depth, calendar parity, or document platforms.

**Competitive frame:** Struxient competes with **spreadsheet + group text + Jobber-class “good enough”** for *running the job*, not with Procore for enterprise coordination. See [lineage-and-prior-art.md](./lineage-and-prior-art.md).

---

## 2. Flow keeper thesis

Most software punishes messiness: clean your data, configure your automations, maintain your board.

Struxient **accepts mess** at the edge and **refuses chaos** at the core:

| Human side (forgiving) | System side (strict) |
|------------------------|----------------------|
| Half descriptions, photos, “inspection failed call me” | Facts land as **activity, issues, attachments, tasks** |
| Lead at 9pm, quote while driving, field note in one sentence | **AI proposes structure**; human reviews and applies |
| Hates configuring rules | **Opinionated outcomes** from execution facts + **settings on/off** |
| Short moments on phone | **Workstation** answers *what’s next* without hunting |

**Anti-pattern:** A junk drawer of notes that never becomes engine food. **Every capture must earn its keep**—block, attention, AI context, audit, or materialization—or it must not exist as a field.

---

## 3. Turn mess into diamonds

**Diamond** = durable operational fact the engine can use:

1. **Capture** — low-friction intake (lead, quote line, issue, photo, checklist tick, daily log).  
2. **Structure** — templates, signals, AI proposals—**never silent writes**.  
3. **Gate** — human approve / apply / activate / complete.  
4. **Enforce** — `deriveTaskState()`, signal bus, recovery, payments, Workstation—**one spine**, no shadow workflow.

This is the same pattern at **quote time** (AI execution plan), **job time** (issues → recovery), and **future job-time replan** (field intel → propose → apply). See [execution-engine-canon.md](./execution-engine-canon.md) §12.

---

## 4. Execution before commodity parity

**Commodity layer** (table stakes elsewhere): CRM hygiene, calendar/dispatch UI, invoice send, SMS marketing, review asks, deep accounting.

**Unique layer** (Struxient wedge): **sold scope → planned tasks → activation → signals → field proof → surprises → recovery → resume → Workstation.**

**Canon phasing:**

1. **Prove the execution loop** end-to-end for at least one real trade story.  
2. **Wire commodity behaviors to execution facts**—not a separate automation product.  
3. **Do not** delay minimum commercial hygiene (lead, quote, approval, payment schedule, activation) that blocks real jobs—but **do not** chase full Jobber parity at the expense of the spine.

Locked detail: [locked-decisions-v1.md](./locked-decisions-v1.md) §16.

---

## 5. Opinionated automation—not triggers

Struxient **does not** expose a general-purpose **trigger / action builder** (no user-defined “when X then Y” plumbing product).

**Instead:**

- Operational automation is **derived from execution facts**: quote approved, job activated, task completed, visit started, payment due, issue opened.  
- Orgs control **policy** with **settings toggles** (on/off, timing, channel)—not rule graphs.

**Illustrative outcomes (product intent):**

| Fact | Optional automated side effect (setting) |
|------|------------------------------------------|
| Quote approved / checkpoint | Deposit invoice or payment request |
| Milestone tasks / stage complete | Progress invoice |
| Visit / crew navigation started | Customer “on the way” SMS |
| Scheduled visit | Staff + customer reminders |
| Task completed with proof | Activity + daily log rollup |

**Requirements:**

- Every automated side effect is **attributable** on the job (activity / audit)—users see *why* something fired, not a rules debugger.  
- **Human gates** remain for anything that changes **execution structure** (new tasks, signal wiring, recovery activation).

---

## 6. AI role

AI is a **secretary and planner**, not the foreman:

- **May propose** — execution plans, recovery paths, future plan adjustments from field intel.  
- **Must not silently persist** — generate → human review → apply.  
- **Must not** replace sign-off on construction reality—liability and craft stay human.

Rich context (line items, templates, tags, job graph, attachments, activity, logs) makes proposals **trade-useful**, not generic chat.

---

## 7. Field intelligence and plan adaptation

The **execution plan is a starting hypothesis**. After activation, **job realities**—photos, checklists, notes, daily logs, visits, issues, activity—are **first-class intelligence inputs**.

The product must eventually:

- **Inform** human-approved adjustments to the job graph (add tasks, rewire signals, recovery).  
- **Not** silently rewrite sold scope—commercial changes use change-order / checkpoint paths.

Full runtime rules: [execution-engine-canon.md](./execution-engine-canon.md) §12, [templates-and-execution-planning.md](./templates-and-execution-planning.md) §7.

**Implementation honesty:** canon intent may run ahead of code; gaps live in [../build-concerns-risks-and-gaps.md](../build-concerns-risks-and-gaps.md) §13—not by pretending features shipped.

---

## 8. Experience principles (field-first)

- **Seconds on site, not hours in office** — complete task, upload proof, leave; admin runs downstream.  
- **Progressive disclosure** — owners see depth; field sees **next task** and proof requirements.  
- **No fake simplicity** — if the system needs clean data, **AI + templates** do the cleaning, not the user at midnight.  
- **No fake intelligence** — orphan notes, duplicate task systems, and trigger spaghetti are product failures.

---

## 9. Anti-patterns (product)

1. **Two task graphs** — Procore tasks + Struxient tasks with no execution truth.  
2. **Gallery software** — photos that never gate, explain, or feed proposals.  
3. **Automation cosplay** — Zapier-style builder for a buyer who will never configure it.  
4. **Office app on a phone** — forty fields before a crew can mark progress.  
5. **Rigid plan worship** — treating quote-time draft as immutable field law.  
6. **Autopilot recovery** — AI activating correction work without human approval.

---

## 10. Related canon

| Document | Relationship |
|----------|----------------|
| [overview.md](./overview.md) | Mission summary and document map |
| [execution-engine-canon.md](./execution-engine-canon.md) | Runtime execution contract |
| [templates-and-execution-planning.md](./templates-and-execution-planning.md) | Quote vs job planning flexibility |
| [workstation-canon.md](./workstation-canon.md) | “What’s next” cockpit |
| [experience-canon-lead-to-workstation.md](./experience-canon-lead-to-workstation.md) | End-to-end UX requirements |
| [locked-decisions-v1.md](./locked-decisions-v1.md) | v1 locks including phasing §16 |
| [lineage-and-prior-art.md](./lineage-and-prior-art.md) | Jobber-simple + execution-strong positioning |

---

## Open questions (not locked)

- Minimum **commodity bar** before first paying customer beyond current quote/payment spine.  
- **Video** as proof / intel—when and how.  
- **Service Work** stage preset vs Standard Project for short jobs.  
- **“On the way”** SMS—native maps integration vs deep-link heuristics.

Resolve by dated update to this file or `locked-decisions-v1.md`.

---

*Canon created 2026-05-25 — flow keeper thesis, execution-before-commodity phasing, opinionated automation, field intelligence loop (product intent).*
