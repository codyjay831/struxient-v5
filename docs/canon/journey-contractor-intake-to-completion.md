# Contractor journey — customer intake to job completion (Struxient v5)

> **Audience:** Internal users at trade and service companies (owners, CSRs, estimators, dispatch, leads, technicians). This is a **narrative** companion to the requirement canon; for rules and boundaries see the linked documents below.

## Canon cross-links

| Topic | Document |
|--------|-----------|
| Full lifecycle requirements | [experience-canon-lead-to-workstation.md](./experience-canon-lead-to-workstation.md) |
| Workstation / “what now” | [workstation-canon.md](./workstation-canon.md) |
| Quote vs job, templates, flexibility | [templates-and-execution-planning.md](./templates-and-execution-planning.md), [conceptual-model.md](./conceptual-model.md) |
| Issues and events | [experience-canon-lead-to-workstation.md](./experience-canon-lead-to-workstation.md) §7, [invariants-and-decision-rules.md](./invariants-and-decision-rules.md) (I16–I17) |
| Customer portal (customer-side) | Same experience canon §8–§9 |

---

## 1. Intake — something comes in

A **lead** arrives the way work actually arrives: phone, text, email, website form, referral, walk-in, or a future integration. You or the office **captures it quickly**—either a **thin** lead record or, when the company needs it, a **structured path** (call back, confirm address, gather photos, schedule site visit, build estimate, send quote). The lead may **create a new customer**, **attach to an existing customer**, or **stay a lead** until you know who they are.

**Customer** records carry **tags and signals** (e.g. website lead, past customer, unsold quote) so nobody has to guess the backstory. Simple jobs are not forced through a heavy pipeline.

---

## 2. From lead to quote — sell at the right depth

You move toward a **quote**. For a small or familiar job, that might mean **line items and price** with minimal ceremony. For repeat work you pull **templates**: sometimes **line item only**, sometimes **line item with stages and tasks** and resource hints. You may **draft execution** on the quote, or you may **defer planning** until after the customer commits—both are first-class in v5.

You keep **internal** detail (crew notes, dependencies, internal tasks) separate from what the **customer** will see unless you deliberately expose it. The quote stays the place where **what we’re selling** and **what we might need to execute** meet without scattering context.

---

## 3. Quote out the door — customer commits

You control the **customer-facing view**: exact line items, simplified language, grouped scopes, payment schedule, terms, approval/signature. You send the proposal; the customer uses the **portal** (login and/or secure links—see canon) on their side.

When they **approve or sign**, the system treats that as the **commitment boundary**: **sold scope** is anchored; you should **not** have to manually rebuild the same structure to “start the job.” Execution planning can still be **refined after** sign.

---

## 4. Job live — execution becomes the main game

A **job** (post-approval executable work) carries **continuity** from the approved quote. Any **stages or tasks** you sketched while quoting can **seed** the job graph; you are **expected** to **edit** assignments, order, dependencies, and add mobilization, inspections, punch, or corrections as reality demands.

The **Workstation** is your **cockpit**: **today**, **next**, **blocked**, **overdue**, **what changed**, **payment blockers**, **resource pressure**—so you are not hunting the estimate PDF to know what to do. Deep quote editing remains available where it belongs; **doing** the work centers here.

---

## 5. Running the job — interruptions are normal

Construction **issues** happen: scope creep, failed inspection, bad weather, late material, crew discovery, payment hold. You record them through a path that produces **owned, visible follow-up**—tasks, blockers, detours, return points—not only free text lost in a corner. The Workstation keeps **why** work is stopped and **who** acts next honest.

**Payments** stay legible internally: what is owed, when, what is paid, and—when configured—what **gates** the next phase of work. The customer sees a **clean** schedule in the portal where applicable.

---

## 6. Closeout — done means done

Work winds down: final tasks, documentation, punch, retention or final invoice per your rules. The job reaches a clear **complete** state aligned with **what was sold** and how your shop defines done. The customer portal continues to show only what you choose for wrap-up and history.

---

## One-line summary

**Leads become customers and quotes; the approved quote anchors what was sold; the job and Workstation carry execution; events and payments stay legible until the job is truly complete.**

---

*Canon narrative (2026-05-05). Struxient v5 only.*
