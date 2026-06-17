# Smart Sales Schema Investigation

Date: 2026-06-17

## LeadVisitRequest

- Current states before this implementation: `PENDING`, `CONFIRMED`, `CANCELED`.
- Confirmed visits were filtered out of lead surface loaders in `lead-commercial-surface/loader.ts` (pending-only fetch), so scheduled visits disappeared from the opportunity work surface.
- Missing fields for smart flow:
  - completion outcome (`COMPLETED`, `NO_SHOW`)
  - completion timestamp and actor
  - visit purpose context
  - completion notes
- Minimal schema change:
  - extend `LeadVisitRequestStatus` with `COMPLETED`, `NO_SHOW`
  - add `purpose`, `completedAt`, `completedByUserId`, `completionNotes`

## QuoteChangeRequest

- Existing source of truth already present in schema: message, token hash, created timestamp, and resolution fields.
- Before this implementation:
  - customer could submit request from quote share page
  - staff had no in-product triage/resolve flow
  - no explicit field to signal visit requirement
  - no explicit linkage to resulting revision draft
- Minimal schema change:
  - add `requiresVisit` boolean
  - add `resultingQuoteId` link to revision quote

## Quote revision lineage and checkpoints

- Issued quote and revision draft relationship already modeled by `Quote.revisionOfQuoteId`.
- Clone flow in quote form actions preserves immutable issued quote and creates new `DRAFT` revision.
- Latest issued quote is derived from non-archived quote rows where status is `SENT`/`APPROVED` and most recent updated timestamp.
- Latest working revision is derived from `DRAFT` rows (prefer rows linked by `revisionOfQuoteId` when customer-change loop is active).
- Commercial commitment checkpoints represented by `QuoteCheckpoint` rows (`SEND`, `APPROVAL`).

## Loader and filter findings

- Lead commercial surface had pending-only visit filtering.
- Lead list serialization had no customer change request signals.
- Workstation lead opportunity items used `getLeadCommercialProgress` and pending-visit emphasis only.
- Quote work surface did not expose staff-facing change request triage actions.

## Approval checkpoint note

This report established the minimum schema additions needed for smart sales-flow interpretation while keeping quote legal/commercial statuses unchanged and avoiding persisted opportunity condition enums.
