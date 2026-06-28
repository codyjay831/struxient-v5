# Execution-Aware Authorization Canon

> **Status:** Canon for Struxient v5 staff authorization (runtime job mutations, commercial read visibility, customer portal coordination, payment visibility, and boundaries vs quote Execution Builder).
> **Scope:** Internal staff (`User` + `Membership` + `StaffRole`). Customer portal token/session auth is **separate** — see [customer-project-portal-canon.md](./customer-project-portal-canon.md).
> **Engineering lock:** **I19** — server-side authorization is authoritative; UI hiding is not security.

---

## Purpose

Struxient separates **who someone is** (authentication), **what class of user they are** (role/capability), **what work they are targeted for** (assignment/collaboration), and **what domain they are acting in** (runtime execution vs commercial planning vs customer coordination).

This canon captures the **completed v5 posture** after migrating runtime job mutations from broad mutable-session gates to **execution-aware** staff action authorization, and after gating **commercial-sensitive read surfaces** (payments, customer portal coordination) for field roles.

---

## 1. Role vs position vs assignment

| Concept | What it is | Authorization use |
|--------|------------|-------------------|
| **`Membership.role`** | Permission **class** (`StaffRole` enum) | **Yes** — primary staff authorization input |
| **Position / title** | Display or planning metadata (future optional field) | **No** — must not grant access |
| **Task assignment** (`JobTask.assignedUserId`, crew membership when landed) | Targets **execution work** to a person/crew | **Yes** — scopes FIELD/SUB **runtime execution** visibility and mutation |
| **`JobCollaborator`** + `permissionsJson` | Explicit subcontractor grant on a job | **Yes** — scopes SUB **runtime execution** where granted |
| **`assigneeRole`** on tasks | Planning/dispatch metadata (who the task is *for*) | **No** — must **not** grant authorization |

**Rules:**

- Never infer mutation authority from job visibility alone.
- Never infer payment, schedule, lifecycle, customer portal, or commercial authority from task assignment.
- Crew-derived assignment (when the crew model lands) extends FIELD visibility the same way direct assignment does — still **not** coordination authority.

---

## 2. Runtime execution authorization

### Entry pattern (job-domain mutations)

Runtime operational job mutations use:

1. **`requireCurrentSession()`** — resolves current staff actor (`userId`, `organizationId`, `role`) from DB-backed session context.
2. **`authorizeStaffAction(session, { action, resourceType, resourceId, metadata? })`** — central decision in `apps/web/src/lib/authz/staff-actions.ts`.

Legacy **`requireMutableSession()`** broad gates are **retired** for job mutations. Do not reintroduce them for new actions.

### Actor classes (runtime)

| Role | Runtime mutation posture |
|------|---------------------------|
| **OWNER / ADMIN / OFFICE** | **Coordination + execution** — office coordination actions plus field-capable execution actions where applicable |
| **FIELD** | **Assigned/crew-derived execution only** — complete assigned tasks, upload proof, create field-scoped issues/daily logs, field holds on assigned jobs, etc. |
| **SUBCONTRACTOR** | **Explicit collaborator grant only** — mutate only where active `JobCollaborator` permissions allow on assigned/granted work |
| **VIEWER** | **Read only** — no runtime mutations |

### Resource loading

- **Execution actions** load resources with **`getJobVisibilityWhere` / `getTaskVisibilityWhere`** — assignment/collaborator scoped for FIELD/SUB.
- **Office coordination actions** load resources **org-scoped** without field visibility filters (the role gate is office capability, not assignment).

### Deny codes

Structured deny results use stable codes in `AUTHZ_DENY_CODES` (e.g. `ROLE_DENIED`, `NOT_ASSIGNED`, `RESOURCE_NOT_FOUND`, `UNSUPPORTED_ACTION`). Prefer plain user-facing messages; do not leak sensitive internals in deny copy.

---

## 3. Coordination vs execution

**Execution** (FIELD/SUB may participate when assigned/granted):

- Complete assigned tasks, save completion notes, toggle checklists
- Upload task proof attachments
- Create job-scoped issues and daily log drafts on assigned work
- Create/cancel **field holds** on assigned jobs
- Complete assigned schedule-event execution where policy allows

**Coordination** (OFFICE / ADMIN / OWNER by default):

- Task schedule/deadline changes, schedule event CRUD/linking
- Work package create/assign
- Job archive, schedule cleanup confirm
- Payment requirement mutations
- Issue resolve/force-resolve, recovery manage/resume/suggest
- Daily log review/void
- Visit schedule coordination (office branch)
- Customer portal management (separate helper — see §6)

**Principle:** FIELD/SUB execution access does **not** imply schedule, payment, scope/commercial, customer portal, or lifecycle authority.

---

## 4. Quote Execution Builder / quote planning

Quote execution planning uses a **separate auth path** from runtime `authorizeStaffAction`:

| Concern | Canonical location |
|--------|---------------------|
| Commercial read context | `getCommercialRequestContextOrThrow()` in `auth-context.ts` |
| Plan editor mutations | `getExecutionPlanEditorContextOrThrow()` + `assertExecutionPlanPermission()` in `execution-plan-permissions.ts` |
| AI proposals | Review-then-apply only — proposals are **draft planning suggestions**, not authorization or stored truth |

### Role posture (quote planning)

| Role | Quote execution plan |
|------|----------------------|
| **OWNER / ADMIN / OFFICE** | May edit/accept/apply execution plans per `execution-plan-permissions.ts` |
| **VIEWER** | Commercial **read** where `read.commercial` applies; **no** plan mutations |
| **FIELD / SUBCONTRACTOR** | **No** direct quote plan edit/apply. Any narrow quote-plan exceptions are explicit in `execution-plan-permissions.ts` only (e.g. `cancel_task` on FIELD); default posture is **no** Execution Builder mutations. |

### Commercial read vs mutation boundary (locked)

- `getCommercialRequestContextOrThrow()` is the **read** context for commercial surfaces.
- `getCommercialMutationContextOrThrow()` (or equivalent mutation guard) is required for staff commercial mutations.
- `VIEWER` may read commercial data but cannot mutate commercial records.
- `FIELD` and `SUBCONTRACTOR` cannot mutate commercial records.
- `OWNER` / `ADMIN` / `OFFICE` may mutate commercial records only where lifecycle rules allow.

Public customer acceptance routes (`/q/[token]`, `/co/[token]`) are a **separate token-scoped authority path** and must not be treated as staff mutation authority.

**Activation boundary:** Approved quote → **job activation/materialization** creates runtime `JobTask` rows. After activation, **runtime auth** (`authorizeStaffAction`) applies. Post-activation quote edits must not silently mutate materialized job rows (copy-on-activate discipline).

**Note:** `adjust_payments` in `execution-plan-permissions.ts` governs **quote-time** payment schedule editing. **Runtime** job payment mutations use `STAFF_ACTIONS.JOB_PAYMENT_*` in `staff-actions.ts`.

---

## 5. Payment visibility

### Mutations

Payment requirement mutations are **OFFICE / ADMIN / OWNER only** via named staff actions (`JOB_PAYMENT_REQUIREMENT_*`). FIELD assignment and SUB collaborator grants do **not** grant payment mutation access.

### Read visibility

| Role | Payment detail read |
|------|---------------------|
| **OWNER / ADMIN / OFFICE** | Full payment manager — amounts, notes, portal payment links, controls |
| **VIEWER** | Read-only commercial detail where `read.commercial` applies (intentional unless canon changes) |
| **FIELD / SUBCONTRACTOR** | **No** amounts, portal payment links, internal notes, or payment manager UI |

**Execution-safe hold awareness:** FIELD/SUB may see **generic payment-hold blockers** on assigned work (e.g. “Payment hold — contact office”) without dollar amounts or milestone titles that imply pricing.

**Canonical helpers:** `canReadPaymentDetails()`, `sanitizeTaskPaymentHoldForRole()`, `redactPaymentActivityForRole()` in `apps/web/src/lib/authz/payment-visibility.ts`.

**Unchanged by visibility pass:** `job-payment-readiness.ts` derivation rules — visibility only affects **what is loaded/rendered**, not when work is blocked.

---

## 6. Customer portal visibility

Customer portal **management** is OFFICE / ADMIN / OWNER (`canManageCustomerPortal()`).

Customer portal **coordination read** (access lists, open requests, audit trail, visible-resource controls) follows commercial read policy: **`canReadCustomerCoordination()`** → `read.commercial` (VIEWER may read; FIELD/SUB may not).

| Role | Job page customer portal panel |
|------|--------------------------------|
| **OWNER / ADMIN / OFFICE** | Full `JobCustomerPortalPanel` — invite/revoke, requests, audit, visible resources |
| **VIEWER** | Read-only coordination metadata (no manage controls) |
| **FIELD / SUBCONTRACTOR** | **Panel not loaded/rendered** — no access lists, emails, magic links, request bodies, or audit trail |

**Execution-safe facts preserved for FIELD/SUB:** jobsite address, customer display name on job context, site details intended for field work, scheduled visit info on assigned surfaces — not portal coordination internals.

**Canonical helpers:** `canManageCustomerPortal()`, `canReadCustomerCoordination()` in `apps/web/src/lib/customer-portal/authorize.ts`; loader gate in `loadJobPortalManagementData()`.

**Hard rule (unchanged):** No `Membership(role: CUSTOMER)`. Customers use portal identity/session models — not staff roles.

---

## 7. Deny handling

1. **Server authorization is authoritative** (I19).
2. **UI hiding is not security** — gate sensitive panels server-side; avoid loading commercial fields in Prisma selects when role cannot read them.
3. **Mutating actions** should return structured `{ error: string }` where the UI expects action results (not unhandled throws for expected denies).
4. **Deny messages** should be plain and role-appropriate (`getActionErrorMessage()` maps internal copy to user-safe text where needed).
5. **`RESOURCE_NOT_FOUND`** and org mismatch should fail closed without confirming resource existence to unauthorized actors.
6. **Request-sensitive route handlers** (session/cookies/headers/token-scoped reads) must be explicitly dynamic in Next.js App Router (`export const dynamic = "force-dynamic"`).

---

## 8. Things explicitly avoided

- **No CUSTOMER staff role** for token/customer portal access.
- **No custom permission editor** in v5 (capabilities + named staff actions + collaborator JSON only).
- **No position/title-based security.**
- **No `mutate.general` shortcut** for FIELD/SUB — use named actions and capability checks.
- **No AI-generated assignment** becoming trusted execution truth without human review and apply.
- **No assigneeRole-based authorization.**
- **No relying on Execution Builder permissions** for runtime job mutations (separate domains).

---

## Role matrix summary

Capabilities derive from `ROLE_CAPABILITIES` in `apps/web/src/lib/authz/capabilities.ts`.

| Role | Org-wide read | Commercial read | Commercial mutate | Office coordination mutate | Field execution mutate | Sub execution mutate |
|------|---------------|-----------------|-------------------|----------------------------|------------------------|----------------------|
| **OWNER** | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| **ADMIN** | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| **OFFICE** | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| **VIEWER** | ✓ | ✓ | — | — | — | — |
| **FIELD** | — (assignment-scoped) | — | — | — | ✓ (assigned/crew) | — |
| **SUBCONTRACTOR** | — (grant-scoped) | — | — | — | — | ✓ (granted) |

### Surface-specific summary

| Surface | OWNER/ADMIN/OFFICE | VIEWER | FIELD | SUB |
|---------|-------------------|--------|-------|-----|
| Runtime job mutations (assigned work) | ✓ broad + assigned | — | ✓ assigned | ✓ granted |
| Schedule/deadline/work-package/lifecycle | ✓ | — | — | — |
| Payment manager + amounts | ✓ | read | — | — |
| Payment hold banner (generic) | ✓ | ✓ | ✓ | ✓ |
| Customer portal panel | ✓ manage | read | — | — |
| Quote Execution Builder edit | ✓ | — | — | — |
| Workstation commercial queue items | ✓ | ✓ | — | — |

---

## Source-of-truth modules

| Concern | Canonical location |
|--------|---------------------|
| Session / request context | `apps/web/src/lib/auth-context.ts` |
| Role capabilities | `apps/web/src/lib/authz/capabilities.ts` |
| Resource visibility predicates | `apps/web/src/lib/authz/resource-access.ts` |
| Runtime staff action names + authorization | `apps/web/src/lib/authz/staff-actions.ts` |
| Payment read visibility | `apps/web/src/lib/authz/payment-visibility.ts` |
| Customer portal staff gates | `apps/web/src/lib/customer-portal/authorize.ts` |
| Quote execution plan permissions | `apps/web/src/lib/execution-plan-permissions.ts` |
| Job payment mutations | `apps/web/src/app/(workspace)/jobs/job-payment-actions.ts` |
| Job portal loader/actions | `apps/web/src/app/(workspace)/jobs/job-portal-actions.ts` |
| Quote plan mutations | `apps/web/src/app/(workspace)/quotes/quote-plan-actions.ts` |
| UI action error mapping | `apps/web/src/components/jobs/action-error-message.ts` |
| Workstation record visibility | `apps/web/src/lib/workstation-query.ts` + `canReadCommercial()` |

Implementation map also indexed in [source-of-truth-map.md](../source-of-truth-map.md) §Authentication & authorization.

---

## Testing posture

- **Unit tests:** `staff-actions.test.ts`, `payment-visibility.test.ts`, `execution-plan-permissions.test.ts`, `customer-portal.test.ts`
- **Static auth regression tests:** `*.auth.test.ts` / `*.read.test.ts` beside action modules (e.g. `job-payment-actions.auth.test.ts`, `job-portal-actions.read.test.ts`)
- **Rule:** New named staff actions require allow/deny cases for FIELD, SUB (with/without grant), VIEWER, and OFFICE+.

---

## Known remaining follow-ups (low priority)

These are **optional** hardening/cleanup items — not blockers for the current canon posture:

1. **Service-layer defense-in-depth cleanup** — remove redundant checks once all callers route through canonical auth helpers and tests are stable.
2. **Optional future position/title field** — display/planning only; must not join authorization.
3. **Optional future custom role templates** — would extend capability maps; not started in v5.
4. **Optional org security audit stream expansion** — separate from `JobActivity`; see source-of-truth-map security audit row.
5. **Optional customer portal preview route cleanup** — `/jobs/[jobId]/portal-preview/[accessId]` is manage-gated; consider clearer FIELD deny UX.
6. **Final grep/audit pass** — periodic search for stray `requireMutableSession`, raw `role ===` checks in actions, and sensitive read panels without server-side gates.

---

## Related canon

- [locked-decisions-v1.md](./locked-decisions-v1.md) §1 — v1 RBAC locks (role enum, crew/sub posture)
- [conceptual-model.md](./conceptual-model.md) — Authentication vs permissions overview
- [customer-project-portal-canon.md](./customer-project-portal-canon.md) — Customer-side portal model
- [invariants-and-decision-rules.md](./invariants-and-decision-rules.md) — **I19** server-side authorization
- [workstation-guardrails.md](../workstation-guardrails.md) — Workstation visibility vs role feed emphasis
- [templates-and-execution-planning.md](./templates-and-execution-planning.md) — Execution Review / activation boundary

---

*Canon added 2026-06-24 — Documents completed execution-aware authorization migration, payment read visibility, and customer portal coordination read gates.*
*Canon update 2026-06-27 — Locked commercial read vs mutation boundary and added request-sensitive route dynamic requirement.*
