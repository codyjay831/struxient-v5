# Build concerns, risks, gaps, and follow-ups (Struxient v5)

> **Purpose:** Living register of everything important that canon and locked v1 decisions **do not fully specify** for implementation—risks, open questions, dependencies, and areas that **need expansion** before or during build.  
> **Audience:** Engineers, product, and anyone onboarding to the runnable app under `apps/web/`.  
> **Rule:** When a row is **resolved**, mark it resolved with a date and link (PR, ADR, or canon update)—do not delete history without archiving.

**Related:** Product truth remains in `docs/canon/`; engineering bar in [invariants-and-decision-rules.md](./canon/invariants-and-decision-rules.md) **I22**. This file is **execution metadata**, not duplicate canon.

---

## 1. Repository and delivery shape

| ID | Topic | Concern / gap | Risk if ignored | Suggested next step |
|----|--------|----------------|-----------------|---------------------|
| R1 | **App location** | Runnable app lives in `apps/web/`; canon lives at repo root. | Confusion for devs and CI; paths in docs must stay explicit. | Keep root `README.md` entry points; CI `cd apps/web` for install/build. |
| R2 | **Single source of “done”** | No automated test suite yet; no E2E. | Regressions on quote→job spine. | Add lint + typecheck in CI; later Playwright for critical flows. |
| R3 | **npm audit** | `create-next-app` reported moderate vulnerabilities in deps. | Supply-chain / transitive issues. | Run `npm audit` in `apps/web/`; patch minors on a schedule. |
| R4 | **RSC + client props** | Do not pass component references (e.g. icon render props) from Server Components into Client Components. | Build/prerender failures (`Functions cannot be passed to Client Components`). | Keep icon maps and interactive nav inside `"use client"` modules (see `sidebar-nav.tsx`). |

---

## 2. Data model and persistence

| ID | Topic | Concern / gap | Risk if ignored | Suggested next step |
|----|--------|----------------|-----------------|---------------------|
| D1 | **Schema not in canon** | Canon describes entities and relationships conceptually, not Prisma/SQL tables. | Inconsistent modeling vs I3–I15, duplicate sources of truth. | Add `apps/web/prisma/schema.prisma` (or chosen ORM) aligned to [conceptual-model.md](./canon/conceptual-model.md) + [glossary.md](./canon/glossary.md); ADR for major forks. |
| D2 | **Enum strings** | Locked lifecycles allow “semantic equivalence” if DB strings differ. | Drift between code, reports, and integrations. | Pick canonical enums in code + DB; document mapping once in glossary or locked doc. |
| D3 | **Immutability of approved quote** | Locked §7 + [quote-truth-and-checkpoints.md](./canon/quote-truth-and-checkpoints.md): **checkpoints** at commitment moments need a technical representation (rows + optional denormalized payload such as JSON **inside** the checkpoint—not a user-managed “proposal version” UI). | Silent mutation of sold truth (violates I2, I20). | Design **`QuoteCheckpoint`** (or domain-specific checkpoint types) and job materialization from **approved checkpoint** before write path to jobs; keep staff UX on **current quote**. |
| D4 | **Multi-tenant isolation** | I21 + locked §6: `activeOrganizationId` in session. | Cross-org data leaks (critical). | Middleware + every query scoped by org; integration tests for isolation. |

---

## 3. Authentication and authorization (I18, I19)

| ID | Topic | Concern / gap | Risk if ignored | Suggested next step |
|----|--------|----------------|-----------------|---------------------|
| A1 | **Auth stack choice** | Canon points at Auth.js v5 + Credentials + Prisma as **default reference**; not file-for-file mandated. | Wrong vendor (e.g. Clerk) violates I18. | Implement first-party sessions; magic link + email/password per portal vs staff flows. |
| A2 | **Customer portal auth** | Link-first (magic / SMS) primary; optional password later (locked §9). | Friction or insecure shortcuts. | Specify token TTL, replay, device binding in a short security note. |
| A3 | **Subcontractor job scope** | Role + `JobCollaborator` server-side (locked §1). | Client-only nav hiding (violates I19). | Centralize authz helper used by all server actions / route handlers. |
| A4 | **E-sign vendor** | Acceptable third-party with Struxient-owned redirect (locked §9); legal varies by jurisdiction. | Compliance gaps. | Track “legal review” row in §12 overview; environment-specific config. |

---

## 4. Product spine (quote → job → workstation)

| ID | Topic | Concern / gap | Risk if ignored | Suggested next step |
|----|--------|----------------|-----------------|---------------------|
| P1 | **Activation path** | I3: direct materialization after approval—exact steps (transaction boundaries, partial failure). | Duplicate entry or half-created jobs. | Spec activation saga: quote state → job + initial tasks + events. |
| P2 | **Template instance rules** | I4: instance vs library mutation. | Cross-quote corruption. | Explicit copy-on-apply; library update from instance as single user action. |
| P3 | **Change orders** | Append model + re-sign thresholds (locked §7). | Customer/legal mismatch. | CO entity model + diff UI + portal projection rules. |
| P4 | **Construction issues** | Typed enums, spawn tasks, Workstation surfacing (locked §10, I16). | “Wall of notes,” blocked work invisible. | Issue create flow + task spawn hooks + workstation query integration. |
| P5 | **Payment blocks** | Stripe + blocks on state transitions (locked §8). | Work starts unpaid or money state lies. | Configurable org rules; surface on Workstation (workstation-canon). |

---

## 5. UX / UI (professional, minimal, “confident” product)

| ID | Topic | Concern / gap | Risk if ignored | Suggested next step |
|----|--------|----------------|-----------------|---------------------|
| U1 | **Design system depth** | Initial shell uses tokens + layout only; no full component library yet. | Inconsistent buttons/forms later. | Add primitives (`Button`, `Input`, `Field`, `Table`) incrementally; document spacing/type scale in one `docs/` or `apps/web/` README section. |
| U2 | **Density vs simplicity** | Trades need speed; canon asks progressive disclosure (workstation-canon). | Too sparse = hunting; too dense = errors. | Usability pass with real roles (Owner vs Field); default to “next action” clarity. |
| U3 | **Accessibility** | No WCAG audit yet. | Legal + usability risk. | Keyboard nav, focus rings, contrast check on tokens; lint a11y in CI when stable. |
| U4 | **Responsive / PWA** | Second wave says responsive PWA first (locked §12). | Field users on phones suffer. | Mobile breakpoints for Workstation lenses early, not last. |
| U5 | **Empty and loading states** | Canon requires attributable blockers—not generic spinners forever. | Loss of trust in cockpit. | Standardize skeleton + “why empty” patterns per lens. |

---

## 6. Integrations and external systems

| ID | Topic | Concern / gap | Risk if ignored | Suggested next step |
|----|--------|----------------|-----------------|---------------------|
| I1 | **Stripe** | PCI, webhooks, idempotency, failed payments. | Double charges, stuck states. | Webhook handler design + ledger fields for external refs (locked §3 CSV path). |
| I2 | **QBO/Xero** | Phase 2 (locked §3). | Scope creep in v1. | Reserve `externalAccountingId`-style fields only; no sync until phase 2. |
| I3 | **SMS / email** | Notifications second wave in part (locked §12). | Magic links depend on deliverability. | Provider abstraction; sandbox keys in dev. |

---

## 7. Non-functional: performance, reliability, ops

| ID | Topic | Concern / gap | Risk if ignored | Suggested next step |
|----|--------|----------------|-----------------|---------------------|
| N1 | **File uploads** | Size caps, virus scan (locked §9, §12). | Abuse, malware. | Presigned URLs + scan queue or vendor; org-configurable limits. |
| N2 | **Audit trail** | CO, admin corrections, issue edits need traceability (canon themes). | Disputes without history. | `AuditEvent` model + append-only pattern for sensitive mutations. |
| N3 | **Backups / DR** | Not in canon. | Data loss. | Hosting-level policy + runbook (outside product canon). |

---

## 8. Canon and planning process

| ID | Topic | Concern / gap | Risk if ignored | Suggested next step |
|----|--------|----------------|-----------------|---------------------|
| C1 | **Canon vs tickets** | Canon is not a sprint plan ([overview.md](./canon/overview.md)). | Either analysis paralysis or unmoored coding. | Maintain ordered backlog (epic → stories) **linked** to canon sections. |
| C2 | **Open design decisions** | Workstation default landing toggles, dispatch depth, notification strategy (workstation-canon). | Wrong default for MVP persona. | Time-box decisions; record outcomes in locked doc or canon footer. |

---

## 9. Immediate implementation order (suggested)

1. **App shell + design tokens** (current step)—production-shaped UI, no dev-only preview (I22).  
2. **Database + org/membership + auth**—tenant boundary before any business data.  
3. **Leads + customers**—intake and dedupe warn-only (locked §4).  
4. **Quotes**—draft/sent/approved lifecycle with **hidden checkpoint** on approve (and on other commitment moments per [quote-truth-and-checkpoints.md](./canon/quote-truth-and-checkpoints.md)); **not** a standing “save = version” UX.  
5. **Job activation + task graph**—I3 path.  
6. **Workstation lenses**—Today / Tasks / Jobs / Schedule (locked §11).  
7. **Issues + payment blocks**—typed events and gating.  
8. **Portal (link-first)**—projection and uploads when enabled.

Reorder if commercial priority shifts; do **not** skip org isolation or authz.

---

## 10. Fast Build vs Strict Correction (build / agent prompts)

This is **process guidance for people and agents shaping the repo**—not product canon.

- **Fast Build** prompts are appropriate for **early product shaping**: small, **visible**, **product-shaped** changes with **practical assumptions** where full audit would slow learning.  
- **Strict Correction** prompts apply **after something exists**: audit against **canon**, **security**, **permissions**, **data truth**, and **drift** from agreed behavior.  
- **Canon protects direction**; not every implementation prompt needs to **restate the entire canon** unless the task is explicitly a **canon compliance** or **full-audit** pass.  
- **Default rhythm:** build **fast** first when exploring **UX and flow**, then **correct** with stricter prompts before hardening or widening surface area.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-05 | Initial document; app scaffolded under `web/` (later moved to `apps/web/`). |
| 2026-05-05 | Repo layout: Next.js app path updated to `apps/web/`. |
| 2026-05-05 | Added R4 (RSC / client component props); workspace shell and routes. |
| 2026-05-05 | Added §10 Fast Build vs Strict Correction (outside product canon). |
| 2026-05-06 | D3 + §9 step 4 — aligned with [canon/quote-truth-and-checkpoints.md](./canon/quote-truth-and-checkpoints.md); `QuoteCheckpoint` naming guidance vs `QuoteRevision` / `ApprovedSnapshot`. |
