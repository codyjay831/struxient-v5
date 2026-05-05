# Workstation IA — current UI implementation (v5 web)

> **Status:** Implementation note for builders. **Not** product canon; see [canon/workstation-canon.md](./canon/workstation-canon.md) for authoritative product rules.

## What the app does today

The **v5 web shell** uses **`/workstation`** as the main **Workstation destination**. **Today**, **Tasks**, **Jobs**, and **Schedule** are **lenses inside that surface** (shared layout, in-page lens navigation, and routes under `/workstation`, `/workstation/tasks`, `/workstation/jobs`, `/workstation/schedule`).

## Browse sidebar: Jobs and Schedule

The sidebar **Browse** group links **Jobs** and **Schedule** to the **same URLs** as the Workstation **Jobs** and **Schedule** lenses (`/workstation/jobs`, `/workstation/schedule`). That is an **intentional early simplification**: one click from anywhere in the app into the operational surface, without maintaining duplicate placeholder pages.

This is **acceptable for the current stage** of the repo (stubs, no full persistence).

## Longer-term direction (not a commitment)

The product **may** later **separate**:

- **Attention-oriented Workstation lenses** (what needs coordination, is blocked, is at risk, etc.), from  
- **Full record-management** experiences (wide job registry, calendar administration, bulk filters) on **different routes** if product and canon call for it.

Until then, names should be read as: **Workstation Jobs / Schedule** = **operational attention views** in the cockpit sense, even when UI copy still resembles “record” language. **Full Jobs/Schedule record browsing** may gain **dedicated routes** later **if needed**—do **not** treat today’s sidebar wiring as proof that canon requires Jobs and Schedule to live only inside `/workstation` forever, or that Browse links must always equal lens URLs.

---

*Added so future refactors do not mistake this wiring for frozen product law.*
