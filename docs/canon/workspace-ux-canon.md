# Workspace UX Canon

> **Strategic role:** This document defines the execution-first UX philosophy for Struxient v5. It governs the workspace shell, operational queues, and detail surfaces.

## Core UX Philosophy

Struxient turns quote scope and messy job activity into executable work, surfaced at the right time to the right person. The UX must prioritize execution, prioritization, accountability, scheduling, payment control, customer coordination, commercial progress, and job health.

1. **Quiet application shell:** The shell must visually recede so the work becomes dominant. The persistent shell contains only compact navigation, organization/account access, and the active workspace. Account actions (theme, sign out) belong in menus or settings, not permanent top utility bars.
2. **Execution-first hierarchy:** Every screen must establish a clear hierarchy: Immediate action (requires user now) > Active work (the object/queue) > Supporting context (history/metadata) > Administration.
3. **Active work receives space:** Active work receives visual space. Empty system states disappear. Permanent empty workflow containers are not allowed.
4. **Lists are the operational default:** For operational queues (leads, jobs, tasks, etc.), default to responsive actionable lists. Boards may exist as optional views but must not require permanent horizontal scrolling on normal desktop widths.
5. **Cards are not the default layout primitive:** Use cards only where content represents a genuinely distinct summary object or isolated unit. Prefer whitespace, typography, dividers, rows, and contextual drawers.
6. **Progressive disclosure:** Do not show every feature or system object simultaneously. Surface information inline when actionable, in a drawer when contextual, and in full records for deeper work.
7. **Clear action hierarchy:** Use three action levels: Primary (next meaningful action), Secondary (useful supporting actions), Overflow (rare/administrative). Do not render every available action as a visible button.

## Vocabulary Lock

Use this contractor-facing vocabulary unless implementation discovers a concrete domain conflict:

- Navigation and page: `Sales`
- Primary intake/qualification record: `Lead`
- Internal domain lifecycle concept: `Opportunity` (Do not expose `Opportunity` simply because it exists internally)
- Appointment: `Site visit` (Do not alternate between site survey, sales visit, and site visit)
- Commercial document: `Quote`
- Successful result: `Won`
- Final unsuccessful result: `Closed`
- Creation action: `Add lead`

## Sales Interaction Contract

The Sales UX is designed around execution, not the complete commercial state machine.

### Default State (Queue-First)
- `/leads` with no selected lead is a full-width operational queue.
- The queue is the primary Sales work surface. It helps users scan leads, identify action, recognize waiting/blocked work, compare urgency, and complete common actions.
- Do not reserve most of the viewport for one selected lead when no lead is selected.
- Do not build Sales as a permanent narrow list beside a permanent record page.

### Selected State (Route-Backed Drawer)
- Desktop opens the selected lead in a contextual right-side drawer.
- Mobile opens the selected lead as a full-screen detail surface.
- Closing detail restores the full-width queue.
- The selected record remains route-backed (e.g., `/leads?lead=<leadId>`).
- Queue params (q, sort, pipeline, view) remain in the URL.
- Refresh preserves the selected lead; direct linking works; list filters/sort remain preserved.
- Mutations refresh both detail and queue presentation.
- Complex editing may route to a dedicated full page (e.g., `/leads/[leadId]/edit` or quote routes).

### Operational Grouping
- Use understandable groupings only where useful (e.g., `Needs action`, `Waiting`, `Scheduled`, `Recently updated`).
- Groupings must be derived from canonical commercial truth, not stored as new workflow status.

### Board Behavior
- The broad Kanban board is not the default Sales experience.
- If retained as a secondary view, it uses limited contractor-understandable phases, hides empty phases where practical, and avoids broad horizontal scrolling.

## Sales Row Hierarchy

Each Sales row uses this information order:

- **Primary:** customer name; concise commercial state.
- **Secondary:** requested work; city/location when available.
- **Operational:** next required action or blocked/waiting reason; owner and age/last activity when useful.
- **Actions:** the whole row opens contextual detail; show at most one visible next-action control; place rare actions in overflow.

**Rules:**
- Every visible line must add distinct information.
- Do not repeat the customer name.
- Do not show status and next action when they communicate the same thing.
- Hide missing optional information instead of rendering meaningless placeholders.
- Avoid combinations like `Quote` + `Quote draft in progress` + `Next: Continue quote`; prefer clearer combinations like `Quote draft` + `Scope and pricing still required` + `Continue quote`.
- Distinguish what state the lead is in, why it requires attention or is waiting, and what the user can do next.

## Sales Detail Drawer Hierarchy

The Sales detail drawer prioritizes fast context and action:

1. Customer or lead identity.
2. Requested work and location.
3. Current commercial condition.
4. One required next action (visually dominant).
5. Contact actions.
6. Concise current-work summary.
7. Recent meaningful activity.
8. Link to the complete record when deeper work is required.

**Rules:**
- Do not default to a large workflow requirement checklist, several equal-sized summary cards, a permanent workflow map, repeated status chips, extensive instructional copy, or source-of-truth explanations.
- The drawer is not a complete lead page embedded inside Sales. Use the full lead record for complete contact/property information, all site visits, full commercial history, quotes/revisions, detailed notes, close/loss information, linked job information, and complex editing.

## Commercial Progress Presentation

- Do not use a permanent multi-step phase rail as the default commercial progress representation.
- Summarize progress through current commercial condition, reason or blocked/waiting context, previous meaningful event, and next required action.
- Commercial history may be shown through a concise expandable activity section.
- Do not create UI-only concepts for revisited phases, visual workflow rollback, display phase history, or manually synchronized progress steps.
- Do not show contractor-facing copy explaining that workflow status is derived or canonical.

## Reusable Primitives

### Drawer
- **Role:** Contextual detail surface for selected records.
- **Contract:**
  - Must be route-backed (e.g., `?lead=<id>`).
  - Must preserve queue state beneath it.
  - Must render as a right-side drawer on desktop and full-screen on mobile.
  - Must trap focus and prevent body scroll when open.
  - Must close on Escape or when clicking the backdrop.

## Workstation Interaction Contract (Milestone 2)

Workstation is the contractor execution cockpit. It is not a dashboard-card surface.

- Default hierarchy is `Needs action` -> `Today` -> `Waiting / blocked` -> `This week` -> supporting context.
- `Needs action` is the primary queue and must be row-first with explicit reason + next action.
- `Today` and `This week` are compact secondary sections and must not dominate when empty.
- Empty schedule states stay compact (`Nothing scheduled or due today`) rather than large panels.
- Severity and action are separate: red only for true risk/blocked/overdue, not all attention items.
- Presentation grouping is derived from canonical helpers and query truth; do not add UI-only workflow fields.
- Workstation item rows must keep one clear visible next action and route-backed contextual detail behavior.

## No breadcrumbs — navigation must be obvious without a trail

**Locked:** Struxient does **not** use breadcrumb navigation in the staff workspace app.

**Principle:** If users need breadcrumbs to understand where they are, the information architecture is too deep or we failed to give them clear primary nav + one page title + an optional back link. Breadcrumbs are enterprise admin noise — tiny uppercase trails that duplicate the sidebar, module tabs, and page header.

**Contract:**
1. **Do not add** `WorkspaceBreadcrumb`, `<Breadcrumb>`, or equivalent wayfinding trails on new surfaces.
2. **Remove** breadcrumbs when touching a route — do not preserve them for consistency.
3. **Every page** must be understandable from: sidebar (or module nav) + **one** page title + optional **one** back link (`PageBackLink`).
4. **Never repeat** the same label in breadcrumb + title + tab — triple labeling is a defect.

**Required replacements:**

| Instead of… | Use… |
|-------------|------|
| `Settings › Customer intake › …` | Intake subnav + `PageHeader` title |
| Deep editor (`/settings/intake/forms/[id]`) | `PageBackLink` to parent list |
| Create flows (`/leads/new`) | `PageHeader` + back to list in actions |
| Record detail | Sidebar section + record title (customer name, job name) |

**Exception (staff workspace v1):** None. Customer/public token pages without a sidebar may use a single back/home link — still not a breadcrumb trail.

**Anti-pattern:** Adding breadcrumbs because settings pages usually have them. That is exactly the complexity we reject.

**Enforcement:** `npm run guardrails` (`detect-breadcrumbs.mjs`) fails on any `WorkspaceBreadcrumb` import.

---
*Canon update (2026-06-18): Initial workspace UX canon established for Milestone 1.  
Canon update (2026-06-18): Added Workstation Milestone 2 execution-cockpit interaction contract.  
Canon update (2026-06-23): **No breadcrumbs** — locked; use sidebar, module nav, page title, and back links only.*
