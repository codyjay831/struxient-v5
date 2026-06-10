# Site Details Implementation Status

## Phase tracker

### Phase 0 — Revalidation and final architecture plan
- Status: Completed
- Objective: finalize architecture and migration safety constraints before code.
- Files changed:
  - `docs/site-details/IMPLEMENTATION_PLAN.md`
  - `docs/site-details/DECISIONS.md`
  - `docs/site-details/IMPLEMENTATION_STATUS.md`
- Migration involved: No
- Verification commands:
  - `git status --short`
  - docs consistency pass across plan/decisions/status
- Results:
  - Phase documentation created and aligned with approved amendments.
  - Split phases 1A/1B/1C/1D and locked migration safety + audit requirements.
- Problems found: None so far
- Fixes applied: N/A
- Commit: Pending
- Next phase (if green): Phase 1A

### Phase 1A — Additive canonical schema
- Status: Completed
- Objective: introduce additive canonical schema and relation fields without removing legacy read/write paths.
- Files changed:
  - `apps/web/prisma/schema.prisma`
  - `apps/web/prisma/migrations/20260610173750_site_details_phase1a_additive/migration.sql`
  - `apps/web/prisma/migrations/20260514120000_revert_sales_intake_to_lead/migration.sql` (encoding/line-ending integrity fix only)
  - `apps/web/src/app/(workspace)/customers/customer-service-location-actions.ts`
- Migration involved: Yes (additive)
- Migration SQL review:
  - Added nullable `customerId` on canonical location row (`CustomerServiceLocation`)
  - Added `addressFingerprint`, `staleAt`, `staleReason`
  - Added nullable `serviceLocationId` columns on `Lead`, `Quote`, `Job`
  - Added non-destructive indexes on new lookup paths
  - Added FKs with `ON DELETE SET NULL` (no cascading destructive behavior)
  - No table drops/recreates in Phase 1A migration SQL
- Migration risk assessment:
  - Data-loss risk: Low (additive only; no destructive DDL in new migration)
  - Runtime compatibility risk: Medium (nullable `customerId` surfaced strict-null errors in one action; patched)
  - Operational risk: Medium (Prisma shadow migration initially blocked by legacy migration-file encoding corruption; fixed before apply)
- Verification commands:
  - `git status --short`
  - `npm exec prisma format`
  - `npm exec prisma validate`
  - `docker compose up -d db`
  - `npx prisma migrate dev --name site_details_phase1a_additive --create-only --skip-seed`
  - `npx prisma migrate deploy`
  - `npx prisma generate --no-engine`
  - `npx prisma migrate status`
  - `npm run typecheck`
  - `npm run lint`
  - `npm test`
  - `ALLOW_SCHEMA=1 npm run guardrails`
  - `npm run build`
  - `git diff --check`
- Results:
  - All Phase 1A required gates pass.
  - Build/typecheck pass after null-safe guard in customer service-location action.
  - Baseline migration chain integrity restored (legacy migration file had UTF-16/null-byte corruption that prevented shadow DB application).
- Problems found:
  - Prisma migration chain failed on `20260514120000_revert_sales_intake_to_lead` due to embedded null bytes.
  - `prisma generate` native engine rename lock (`EPERM`) on Windows.
- Fixes applied:
  - Re-encoded `20260514120000_revert_sales_intake_to_lead/migration.sql` to UTF-8 text (content-preserving integrity fix).
  - Used `npx prisma generate --no-engine` for deterministic client generation in this locked environment.
  - Added null guard when revalidating customer surfaces for service locations with now-nullable `customerId`.
- Commit: Pending
- Next phase (if green): Phase 1B

### Phase 1B — Backfill and reconciliation
- Status: In progress
- Objective: backfill canonical location links and report matched/created/ambiguous/failed counts without silent ambiguity assignment.
- Files changed: Pending
- Migration involved: No (data backfill + reconciliation logic)
- Verification commands: Pending
- Results: Pending
- Problems found: None yet
- Fixes applied: N/A
- Commit: Pending
- Next phase (if green): Phase 1C

## Amendment log (approved changes integrated)
- Split canonical spine into independently gated Phase 1A/1B/1C/1D.
- Locked migration safety: no drop/recreate acceptance for location-table evolution.
- Added SQL-review-before-apply requirement and stop condition on destructive risk.
- Locked explicit location stability invariants for Lead/Quote/Job behavior.
- Added append-only audit coverage requirements for site-detail facts and lifecycle mutations.
- Locked minimal typed reusable-knowledge model (no polymorphic resource abstraction by default).

## Global stop conditions
- Destructive migration or unresolved mapping risk.
- Tenancy/authorization regression.
- Source-of-truth conflict (dual live location systems).
- Unsupported grounded-search capability.
- Any red gate in active phase.
