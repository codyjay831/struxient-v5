# Milestone 1 Completion Report

## Checks Run
- `npm run lint`: Passed (warnings only)
- `npm run guardrails`: Passed (warnings only, pre-existing)

## Acceptance Evidence

### Workspace UX Canon
- Created `docs/canon/workspace-ux-canon.md` documenting the execution-first UX philosophy, Sales row/drawer contracts, and vocabulary lock.
- Updated `docs/canon/README.md` and `docs/canon/overview.md` to reference the new canon.

### Quiet Contractor Shell
- Simplified `AppShellClient` by removing the permanent top utility strip on desktop.
- Consolidated `OrganizationSwitcher`, `AppearanceControl`, and Sign Out into the bottom of the sidebar navigation.
- Removed the `Soon` badge from Payments in the sidebar.
- Added `workspaceContentWidth` tokens to `shell-layout-classes.ts` to avoid hardcoded `max-w` values.

### Sales Default List Experience
- Rebuilt `/leads` to default to a full-width actionable list.
- Replaced mixed toolbar controls with a single `LeadListToolbar`.
- Updated `LeadRow` to match the required hierarchy:
  - Primary: Customer name & concise commercial state.
  - Secondary: Requested work & location.
  - Operational: Next action/blocked reason & age.
  - Actions: Row opens contextual detail, primary action is visible, no redundant "Open" button.
- Replaced `pipeline` values with operational groupings: `needs_action`, `waiting`, `scheduled`, `awarded`, `closed`, `all`.
- Fixed Sales query issues (title search, title sort, queue param preservation).

### Route-Backed Sales Drawer
- Extracted a reusable `Drawer` primitive (`components/ui/drawer.tsx`).
- Updated `LeadsListClient` to use the `Drawer` instead of `CenteredWorkspaceDialog`.
- The drawer is route-backed (`?lead=<leadId>`) and preserves queue state.
- Simplified `LeadCommercialSurface` header to match the drawer hierarchy (identity, requested work, commercial condition, next action).
- Removed the permanent multi-step phase rail from the commercial surface.

### Cleanup
- Deleted `lead-board-client.tsx`.
- Deleted `lead-list-search-form.tsx`.
- Deleted `lead-list-filters-client.tsx`.
- Deleted `centered-workspace-dialog.tsx`.
- Removed `view` param handling from `lead-list-query.ts` and `leads/page.tsx`.

## Changed/Deleted Files

**Added:**
- `docs/canon/workspace-ux-canon.md`
- `apps/web/src/components/ui/drawer.tsx`
- `apps/web/src/components/leads/lead-list-toolbar.tsx`

**Modified:**
- `docs/canon/README.md`
- `docs/canon/overview.md`
- `apps/web/src/components/shell/app-shell-client.tsx`
- `apps/web/src/components/shell/sidebar-nav.tsx`
- `apps/web/src/components/shell/shell-layout-classes.ts`
- `apps/web/src/app/(workspace)/leads/page.tsx`
- `apps/web/src/components/leads/lead-list-client.tsx`
- `apps/web/src/lib/lead-list-query.ts`
- `apps/web/src/components/work-surfaces/lead-commercial-surface.tsx`

**Deleted:**
- `apps/web/src/components/leads/lead-board-client.tsx`
- `apps/web/src/components/leads/lead-list-search-form.tsx`
- `apps/web/src/components/leads/lead-list-filters-client.tsx`
- `apps/web/src/components/ui/centered-workspace-dialog.tsx`

## Next Steps
Implementation is hard-stopped for Milestone 1 product review. Please review the changes and provide feedback before proceeding to the next milestone.