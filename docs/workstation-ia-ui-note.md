# Workstation IA — current UI implementation (v5 web)

> **Status:** Implementation note for builders. **Not** product canon; see [canon/workstation-canon.md](./canon/workstation-canon.md) for authoritative product rules.

## What the app does today

The **v5 web shell** uses **`/workstation`** as the main **Workstation destination**. The surface is a **real tabbed cockpit**, not a stub:

| Tab | Purpose |
|-----|---------|
| **Overview** | Morning command center — Critical, Next actions, Today, Week strip |
| **Tasks** | Assigned, blocked, and ready work |
| **Jobs** | Active job health and next steps |
| **Calendar** | Schedule, due work, timing risk |
| **Commercial** | Sales follow-up and change orders needing action |
| **Money** | Payments due and execution holds |
| **Activity** | Recent changes and log review |

Legacy redirect routes (`/workstation/tasks`, `/workstation/jobs`, `/workstation/schedule`) map to tab query params on `/workstation`.

Selection opens **embedded work surfaces** (task, lead, quote, payment, visit, daily log, issue recovery) in a modal drawer — not a forked editor.

## Role landing behavior

`role-feeds.ts` defines default tab/lens/filter per role. On first visit (no URL params), non-overview roles redirect to their default tab (e.g. Field → Calendar). Server-side query scoping (`workstation-query.ts`, `authz/resource-access.ts`) controls which records appear — role defaults only control emphasis.

## Browse sidebar: Jobs and Schedule

The sidebar **Browse** group may link **Jobs** and **Schedule** to Workstation tab URLs. That is an intentional simplification: one click into the operational surface without duplicate record pages.

## Longer-term direction (not a commitment)

The product **may** later **separate**:

- **Attention-oriented Workstation lenses** (what needs coordination, is blocked, is at risk), from  
- **Full record-management** experiences (wide job registry, calendar administration, bulk filters) on **different routes** if product and canon call for it.

Until then, names should be read as: **Workstation Jobs / Schedule** = **operational attention views** in the cockpit sense. **Full Jobs/Schedule record browsing** may gain **dedicated routes** later **if needed**.

---

*Added so future refactors do not mistake this wiring for frozen product law.*
*Updated 2026-06-21 — Reflects real tabbed Workstation, overview sections, embedded surfaces, and role landing; removed stale stub language.*
