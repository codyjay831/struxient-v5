# Deletion Ticket: Legacy Lead/Workstation Components (Slice 1 → Slice 2)

This ticket tracks the intentional retirement of legacy UI components replaced by the Workstation Triangle architecture.

## Retirement Schedule

| Surface | File(s) | Status | Retire by |
|---|---|---|---|
| Inbox split pane | `apps/web/src/app/(workspace)/leads/inbox/lead-inbox-client.tsx` | Legacy | Slice 2 |
| Leads list popup | `apps/web/src/components/leads/lead-list-client.tsx` (popup chrome) | Legacy | Slice 2 |
| `LeadWorkSurface` modes | `apps/web/src/components/work-surfaces/lead-work-surface.tsx` | Legacy | After all callers migrated |
| Workstation handoff panel | `apps/web/src/app/(workspace)/workstation/page.tsx` (`HandoffPanel` usage) | Legacy | Slice 2 |

## Acceptance Criteria for Deletion

1. `LeadCommercialSurface` is proven stable in Workstation and Lead full record.
2. Inbox and Leads list popup are migrated to `LeadCommercialSurface`.
3. All `mode`, `variant`, `embedded`, `compact` props are removed from `LeadWorkSurface`.
4. `HandoffPanel` is removed from the main Workstation cockpit.

## Telemetry Monitoring

- [ ] Track usage of legacy routes vs new surface.
- [ ] Monitor error rates on new surface before final deletion.
