# Site Details Implementation Plan

## Current-state revalidation (confirmed)
- Address truth is currently split between `Lead.address` JSON snapshot and customer service-location rows.
- Quote/job currently resolve jobsite line via fallback logic instead of explicit location FK ownership.
- Existing AI boundary is Gemini-based and centralized in `apps/web/src/lib/ai/ai-service.ts`.
- Existing auth boundary is org-scoped through `getRequestContextOrThrow()`.

## Final source-of-truth decision
- One canonical location identity, evolved from current `CustomerServiceLocation` lineage into `ServiceLocation` semantics (no parallel competing address model).
- Explicit link fields:
  - `Lead.serviceLocationId` (optional)
  - `Quote.serviceLocationId` (explicit and stable)
  - `Job.serviceLocationId` (explicit copy from Quote at activation)
- `Lead.address` remains immutable intake snapshot/audit input only after canonical linkage exists.

## Locked stability invariants
- `Quote.serviceLocationId` does not silently change when customer primary location changes.
- `Job.serviceLocationId` is copied from quote during activation.
- Changing customer primary location does not mutate historical quotes/jobs.
- Quote/job location reassignment requires explicit authorized mutation with append-only audit.
- Material address edits mark site details stale; property-specific facts are not silently moved.

## Migration strategy (safety-first)
- Preserve all existing location table data.
- Do not accept migration SQL that drops/recreates `CustomerServiceLocation` during rename/evolution.
- Use explicit reviewed SQL strategy (safe rename/mapping) before apply.
- Required pre-apply checkpoint for each schema phase:
  1. Generate migration SQL.
  2. Review SQL diff in full.
  3. Record risk assessment.
  4. Apply only after review passes.

## Phase plan

### Phase 0 — Revalidation, docs, and gate matrix
- Finalize plan/decisions/status docs.
- Reconfirm canonical source-of-truth and migration constraints.
- Confirm no dual live location systems are introduced.

### Phase 1A — Additive canonical schema
- Introduce/evolve canonical ServiceLocation semantics.
- Add optional `serviceLocationId` relations on Lead/Quote/Job.
- Preserve existing reads/writes temporarily.
- No legacy removal in this slice.
- Migration SQL review is mandatory before apply.

### Phase 1B — Backfill and reconciliation
- Backfill canonical service locations and Lead/Quote/Job links.
- Reuse Google Place ID and normalized address fingerprints.
- Produce reconciliation counts:
  - matched
  - created
  - ambiguous
  - failed
- Hard stop if any ambiguous records are silently assigned.

### Phase 1C — Canonical read/write cutover
- New writes go through canonical ServiceLocation only.
- Lead/Quote/Job reads resolve via explicit `serviceLocationId`.
- Conversion and activation preserve same location identity.
- Verify org isolation and audit behavior.

### Phase 1D — Legacy freeze and removal
- Freeze `Lead.address` as immutable intake snapshot post-linkage.
- Remove quote-note address copy as operational truth.
- Remove old fallback writes only after parity tests pass.
- Keep only intentionally documented snapshot/audit data.

### Phase 2 — Minimal reusable knowledge model
- Implement typed minimal models only:
  - Utility
  - UtilityCoverage
  - Jurisdiction/Authority
  - CountyAssessorResource
- Do not introduce polymorphic generic resource architecture unless typed model proves unsafe.

### Phase 3 — Database-first resolver and actions
- Implement canonical resolver:
  - exact service-location load
  - reusable knowledge load
  - missing-scope detection
  - correction-priority enforcement
- Add org-scoped actions:
  - load site details
  - manual APN save
  - mark reviewed
  - utility/jurisdiction correction
  - research-missing request
- Add request deduplication + concurrency guard.

### Phase 4 — Grounded Gemini research
- Add dedicated `researchSiteDetails(...)` in existing AI boundary.
- Ground only missing reusable scopes.
- Persist grounded sources + official verification links.
- Allow evidence-constrained APN discovery:
  - explicit APN shown on exact-address source
  - preserved source title + URL
  - official county verification path required
  - null candidate when evidence is uncertain or ungrounded
- Never overwrite reviewed/corrected values.
- Persist AI usage/cost telemetry.

### Phase 5 — Shared Site Details UI
- Shared compact row + shared drawer/sheet.
- Primary: Quote Overview below Jobsite Address.
- Secondary: Lead `Who & Where`.
- Additional lightweight placements: Customer service-location panel and Job jobsite panel.
- Keep UI quiet and non-dominant.

### Phase 6 — Execution-plan integration
- Inject status-qualified site details into execution AI context.
- Remove redundant generic utility/jurisdiction gaps when details are already known.
- Preserve unresolved process-specific questions.

### Phase 7 — Hardening and acceptance
- Execute scenarios A–D end-to-end.
- Validate tenancy isolation, public-surface restrictions, and non-overwrite guarantees.
- Run full gate suite and produce final verification report.

## Required append-only audit coverage
- APN entered/corrected
- Utility assignment/correction
- Jurisdiction assignment/correction
- Address changes
- Quote/job service-location reassignment
- User review status changes
- AI-found values accepted/rejected/replaced

Each audit event must include:
- `organizationId`
- `actorUserId`
- `oldValue`
- `newValue`
- `sourceOrReason`
- timestamp

## Phase gates (baseline)
- Prisma/schema: format, validate, generate, migration SQL review, migration status.
- Quality: typecheck, lint, targeted tests, guardrails.
- Build: production build.
- Diff hygiene: `git diff --check`, no unrelated edits.
- Security: org-scope verification and cross-org denial checks.
- AI phase gates: DB-first no-call path, targeted-only research, malformed output handling, duplicate request prevention, usage logging.
- UI phase gates: desktop/mobile, loading/empty/partial/error states, keyboard/focus behavior, non-dominant modal footprint.

## Deferred scope
- GIS boundary matching
- Nationwide utility coverage ingestion
- Automatic permit conclusions
- Scheduled crawler/link monitor
- Cross-organization shared writes
