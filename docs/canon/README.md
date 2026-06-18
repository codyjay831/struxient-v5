# Canon — Struxient v5

> **Repository:** `Struxient_v5` · **Product / continuity line:** Struxient **version 5** (v5). Canon in this directory applies **only** to this codebase and this generation of the work — not v1–v4 or parallel experiments unless you explicitly cross-link them.

**Canon** means information that is intentionally authoritative **for Struxient v5**: anything here should be treated as ground truth for product behavior, naming discipline, and architectural intent in **this** repo unless explicitly revised.

## What this canon describes

Struxient v5 is a **construction management** product for **trades and service**, optimized around **tasks, execution, and the Workstation cockpit**—from **lead intake** through **quoting**, **customer approval**, **payments**, and **operational delivery**.

## How to use this folder

- **Add** new facts when they are decided, not when they are merely brainstormed.  
- **Change** canon in place and note the change briefly in the document footer or a short changelog section if others depend on the old version.  
- **Link** from implementation discussions, ADRs, and tickets back to the relevant canon file when helpful.  
- **Do not duplicate** competing sources of truth—extend these documents or add a new canon file and index it here.  
- **Building the app** (quality bar, user-visible fidelity, no dev-preview-as-product, no throwaway “temporary” surfaces as done) is spelled out for engineering in [invariants-and-decision-rules.md](./invariants-and-decision-rules.md) **§I22**; **light/dark appearance** for the shell is **§I23**—not in domain-specific canon files unless a product rule truly requires it.

## Canon index

| File | Contents |
|------|----------|
| [overview.md](./overview.md) | Mission, market, strategic edge, pillars, document map |
| [product-philosophy.md](./product-philosophy.md) | Flow keeper thesis, execution-before-commodity phasing, opinionated automation, anti-patterns |
| [conceptual-model.md](./conceptual-model.md) | Entities, relationships, lifecycle intent, data gravity, **auth vs permissions** |
| [domains-and-boundaries.md](./domains-and-boundaries.md) | Domains, seams, internal vs portal, template vs instance |
| [business-profile-and-ai-context-canon.md](./business-profile-and-ai-context-canon.md) | **Business Profile + AI context contract**: minimal org profile, setup boundaries, source hierarchy, per-operation AI allowlists, intake starter disposition |
| [templates-and-execution-planning.md](./templates-and-execution-planning.md) | Template shapes (line-only vs line+stages+tasks), quote-time vs post-sign planning, maturity curve |
| [execution-engine-canon.md](./execution-engine-canon.md) | **Runtime execution engine**: line items → draft tasks → activation → stages/tasks/signals → issues/recovery → payments → Workstation attention |
| [lineage-and-prior-art.md](./lineage-and-prior-art.md) | Full_Cursor (genesis) + v2–v4: what to salvage; failure modes; Jobber-simple + execution-strong positioning |
| [lead-intake-canon.md](./lead-intake-canon.md) | **Lead intake / public intake / Lead Review / Lead→Quote handoff** — source-of-truth, 5 slices, future intake chain guardrail |
| [experience-canon-lead-to-workstation.md](./experience-canon-lead-to-workstation.md) | Full experience requirements: lead → workstation |
| [journey-contractor-intake-to-completion.md](./journey-contractor-intake-to-completion.md) | Narrative: contractor journey from intake through job completion |
| [workspace-ux-canon.md](./workspace-ux-canon.md) | **Execution-first UX philosophy**: shell, operational queues, Sales row/drawer contracts, vocabulary lock |
| [workstation-canon.md](./workstation-canon.md) | Workstation as **action-discovery destination**; cockpit / “what’s next” deep rules |
| [invariants-and-decision-rules.md](./invariants-and-decision-rules.md) | Non-negotiables, default decisions, **engineering delivery standards (I22)**, **light/dark appearance (I23)** |
| [locked-decisions-v1.md](./locked-decisions-v1.md) | v1 product locks: RBAC, states, money, portal, issues, Workstation, phasing |
| [issue-recovery-canon.md](./issue-recovery-canon.md) | Canonical mitigation model for `BLOCKS_WORK` issues (RecoveryFlow-only) |
| [quote-truth-and-checkpoints.md](./quote-truth-and-checkpoints.md) | **Working quote vs hidden checkpoints**, job as execution, activity layer; UX/naming guardrails (current-state-first) |
| [glossary.md](./glossary.md) | Ubiquitous language |
| [signals.md](./signals.md) | **Signal-based readiness engine**: Provides, Requires, Signal Bus, and AI Secretary |
| [scheduling-canon.md](./scheduling-canon.md) | **Authoritative scheduling canon**: deadlines vs commitments, `JobScheduleEvent`, `JobScheduleEventTask`, optional `JobWorkPackage`/Work group, lifecycle, derivation, timezone, AI boundaries |

## Scheduling authority chain

When scheduling docs conflict, use this precedence:

1. [scheduling-canon.md](./scheduling-canon.md) (domain authority)
2. [`../plans/scheduling-implementation-plan.md`](../plans/scheduling-implementation-plan.md) (implementation order and phase gates)
3. Historical snapshots/audits/legacy decision notes (context only)

## Reading order (suggested)

1. `overview.md` + [product-philosophy.md](./product-philosophy.md) + `lineage-and-prior-art.md` (context from earlier repos)  
2. `invariants-and-decision-rules.md` + `locked-decisions-v1.md` + `quote-truth-and-checkpoints.md`  
3. `conceptual-model.md` + `domains-and-boundaries.md` + [business-profile-and-ai-context-canon.md](./business-profile-and-ai-context-canon.md) + `templates-and-execution-planning.md` + `execution-engine-canon.md`  
4. `experience-canon-lead-to-workstation.md` + `workstation-canon.md` (+ optional `journey-contractor-intake-to-completion.md` for storytelling)  
5. `glossary.md` as reference  
