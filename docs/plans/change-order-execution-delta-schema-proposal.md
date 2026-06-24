# Change Order Execution Delta — Schema Proposal (Pass 1)

> **Status:** Proposal only — **do not migrate** until explicitly approved (`ALLOW_SCHEMA=1`).  
> **Canon authority:** [change-order-canon.md](../canon/change-order-canon.md)  
> **Date:** 2026-06-24

---

## Summary

Extend `ChangeOrder` with plan-version anchoring and proposed execution delta storage; split commercial workflow from execution apply sub-state; extend `ExecutionPlanRevision` for job delta apply; optional lineage on `JobTask`; audit enum additions.

**Schema risk rating: MEDIUM** — additive columns/enums, backfill required, apply-path refactor touches transactional hot path. No destructive drops. Rollback feasible.

---

## A. Proposed Prisma changes (exact)

### 1. `ChangeOrder` model — add fields

```prisma
model ChangeOrder {
  // ... existing fields ...
  baseJobPlanVersion        Int                           @default(1)
  executionDeltaJson        Json?
  executionDeltaSchemaVersion Int                         @default(1)
  applicationStatus         ChangeOrderApplicationStatus  @default(NOT_APPLIED)
  lastApplyErrorJson        Json?
  lastApplyAttemptAt        DateTime?
  supersededByChangeOrderId   String?
  supersededByChangeOrder     ChangeOrder?  @relation("ChangeOrderSupersession", fields: [supersededByChangeOrderId], references: [id], onDelete: SetNull)
  supersedesChangeOrders      ChangeOrder[] @relation("ChangeOrderSupersession")

  @@index([jobId, applicationStatus])
}
```

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `baseJobPlanVersion` | `Int` | `1` | `Job.jobPlanVersion` at CO draft creation |
| `executionDeltaJson` | `Json?` | `null` | Proposed delta ops (see canon §6) |
| `executionDeltaSchemaVersion` | `Int` | `1` | JSON schema evolution |
| `applicationStatus` | enum | `NOT_APPLIED` | Apply sub-state (canon §5) |
| `lastApplyErrorJson` | `Json?` | `null` | Last validation/apply failure payload |
| `lastApplyAttemptAt` | `DateTime?` | `null` | Audit / workstation staleness |
| `supersededByChangeOrderId` | `String?` | `null` | Optional supersession chain |

### 2. New enum — `ChangeOrderApplicationStatus`

```prisma
enum ChangeOrderApplicationStatus {
  NOT_APPLIED
  APPLIED
  APPLY_FAILED
  NEEDS_EXECUTION_REVIEW
}
```

### 3. Extend `ChangeOrderStatus`

```prisma
enum ChangeOrderStatus {
  DRAFT
  READY_TO_SEND          // NEW
  SENT
  CUSTOMER_REQUESTED_CHANGES  // NEW
  ACCEPTED
  APPLIED
  REJECTED
  VOID                   // keep VOID (not VOIDED) for enum stability
  SUPERSEDED             // NEW
}
```

**Migration note:** Existing `VOID` value unchanged. Map UI label “Voided” to `VOID`.

### 4. Extend `ChangeOrderCheckpointKind`

```prisma
enum ChangeOrderCheckpointKind {
  SEND
  ACCEPTANCE
  REQUEST_CHANGES        // NEW
}
```

### 5. Extend `ExecutionPlanRevisionKind`

```prisma
enum ExecutionPlanRevisionKind {
  INITIAL_PLAN
  SCOPE_RECONCILIATION   // legacy CO apply — retain for backfill
  JOB_EXECUTION_DELTA    // NEW — canonical CO apply kind
}
```

### 6. Extend `ExecutionPlanRevisionStatus`

```prisma
enum ExecutionPlanRevisionStatus {
  DRAFT
  ACCEPTED               // NEW — delta accepted, not yet applied
  APPLIED
  APPLY_FAILED           // NEW
  NEEDS_REVIEW           // NEW
  DISCARDED
}
```

### 7. Optional lineage — `JobTask`

```prisma
model JobTask {
  // ... existing fields ...
  sourceChangeOrderId       String?
  sourceExecutionDeltaOpId  String?
  sourceChangeOrder         ChangeOrder? @relation(fields: [sourceChangeOrderId], references: [id], onDelete: SetNull)

  @@index([sourceChangeOrderId])
}
```

Add reverse relation on `ChangeOrder`: `createdTasks JobTask[]`.

**Pass 2 recommendation:** ship lineage fields with apply refactor; low risk, high debug value.

### 8. Optional — `JobActivityType` additions

```prisma
enum JobActivityType {
  // ... existing ...
  CHANGE_ORDER_CREATED
  CHANGE_ORDER_SENT
  CHANGE_ORDER_ACCEPTED
  CHANGE_ORDER_REQUESTED_CHANGES
  CHANGE_ORDER_REJECTED
  CHANGE_ORDER_VOIDED
  CHANGE_ORDER_APPLY_ATTEMPTED
  CHANGE_ORDER_APPLIED
  CHANGE_ORDER_APPLY_FAILED
  CHANGE_ORDER_NEEDS_EXECUTION_REVIEW
  // retain SCOPE_REVISION_APPLIED as alias/legacy or migrate callers to CHANGE_ORDER_APPLIED
}
```

**Alternative (smaller diff):** keep `SCOPE_REVISION_APPLIED` and add only `CHANGE_ORDER_NEEDS_EXECUTION_REVIEW` + `CHANGE_ORDER_APPLY_FAILED`. Canon prefers full audit set — product decision in Pass 2.

---

## B. `executionDeltaJson` JSON schema (v1)

File to add in Pass 2: `apps/web/src/lib/change-order/execution-delta-schema.ts` (Zod, mirror quote-plan pattern).

```typescript
const ExecutionDeltaOperationSchema = z.object({
  opId: z.string().min(1),
  type: z.enum([
    "ADD_SCOPE_ITEM",
    "REMOVE_SCOPE_ITEM",
    "MODIFY_SCOPE_ITEM",
    "ADD_TASK",
    "CANCEL_TASK",
    "MODIFY_TASK",
    "UPDATE_PAYMENT_REQUIREMENT",
  ]),
  targetEntityType: z.enum([
    "JobScopeItem",
    "JobTask",
    "JobPaymentRequirement",
    "ChangeOrderLine",
  ]),
  targetEntityId: z.string().nullable().optional(),
  payload: z.record(z.unknown()).optional(),
  reason: z.string().min(1),
  customerLabel: z.string().optional(),
  internalNote: z.string().optional(),
  requiresCustomerApproval: z.boolean().optional(),
  linkedChangeOrderLineId: z.string().optional(),
});

const ExecutionDeltaProposalSchema = z.object({
  schemaVersion: z.literal(1),
  baseJobPlanVersion: z.number().int().positive(),
  summary: z.string().optional(),
  operations: z.array(ExecutionDeltaOperationSchema),
});
```

---

## C. Migration SQL outline (when approved)

```sql
-- 1. Create enums (Postgres)
CREATE TYPE "ChangeOrderApplicationStatus" AS ENUM (
  'NOT_APPLIED', 'APPLIED', 'APPLY_FAILED', 'NEEDS_EXECUTION_REVIEW'
);

-- 2. Alter ChangeOrderStatus — add values (Postgres)
ALTER TYPE "ChangeOrderStatus" ADD VALUE IF NOT EXISTS 'READY_TO_SEND';
ALTER TYPE "ChangeOrderStatus" ADD VALUE IF NOT EXISTS 'CUSTOMER_REQUESTED_CHANGES';
ALTER TYPE "ChangeOrderStatus" ADD VALUE IF NOT EXISTS 'SUPERSEDED';

-- 3. Alter checkpoint / revision enums similarly

-- 4. Add columns
ALTER TABLE "ChangeOrder"
  ADD COLUMN "baseJobPlanVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "executionDeltaJson" JSONB,
  ADD COLUMN "executionDeltaSchemaVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "applicationStatus" "ChangeOrderApplicationStatus" NOT NULL DEFAULT 'NOT_APPLIED',
  ADD COLUMN "lastApplyErrorJson" JSONB,
  ADD COLUMN "lastApplyAttemptAt" TIMESTAMP(3),
  ADD COLUMN "supersededByChangeOrderId" TEXT;

-- 5. Optional JobTask lineage columns
-- 6. Indexes + FK for supersession + sourceChangeOrderId
```

Prisma migration file generated via `npx prisma migrate dev` after schema edit with `ALLOW_SCHEMA=1`.

---

## D. Backfill plan

| Step | Action | Risk |
|------|--------|------|
| 1 | Set `baseJobPlanVersion = 1` for all existing COs (default handles new column) | Low |
| 2 | For each existing CO, derive minimal `executionDeltaJson` from `ChangeOrderLine[]`: map ADD→`ADD_SCOPE_ITEM`, MODIFY→`MODIFY_SCOPE_ITEM`, REMOVE→`REMOVE_SCOPE_ITEM` only | Medium — no task ops; marks `legacyScopeReconciliation: true` in JSON meta |
| 3 | `applicationStatus`: `APPLIED` COs → `APPLIED`; `ACCEPTED` → `NOT_APPLIED`; others → `NOT_APPLIED` | Low |
| 4 | Existing `ExecutionPlanRevision` with `kind = SCOPE_RECONCILIATION` — leave unchanged; new applies use `JOB_EXECUTION_DELTA` | Low |
| 5 | Detect trapped COs: status `ACCEPTED`, execution-relevant ADD lines, no task coverage → set `NEEDS_EXECUTION_REVIEW` + `lastApplyErrorJson` explaining legacy gap | Medium — ops visibility |
| 6 | Re-link `JobTask` lineage optional script: tasks canceled by legacy apply → no backfill unless audit needed | Low |

**Backfill script location (Pass 2):** `apps/web/prisma/backfill/change-order-execution-delta-v1.ts` — run once with dry-run flag.

---

## E. Rollback plan

- New columns nullable or have defaults — can ignore in code rollback.
- Enum values cannot be removed easily in Postgres — forward-only; rollback = stop writing new enum values.
- Worst case: redeploy previous app version; new statuses unused.

---

## F. Guardrails

```bash
ALLOW_SCHEMA=1 npm run guardrails
```

Document in PR: rationale, backfill, no derived-state columns (application status is workflow fact, not computed readiness).

---

## G. Files to touch in Pass 2 (backend — not this pass)

| File | Change |
|------|--------|
| `apps/web/prisma/schema.prisma` | Apply this proposal |
| `apps/web/src/lib/change-order/execution-delta-schema.ts` | NEW — Zod + types |
| `apps/web/src/lib/change-order/execution-delta-validation.ts` | NEW — simulate + conflict |
| `apps/web/src/lib/change-order/execution-delta-apply.ts` | NEW — apply ops in tx |
| `apps/web/src/app/(workspace)/change-orders/change-order-actions.ts` | Store base version + delta on create; refactor apply |
| `apps/web/src/lib/change-order-flow.ts` | Readiness uses stored `baseJobPlanVersion` |
| `apps/web/src/lib/change-order-loader.ts` | Load delta + application status |
| `apps/web/src/lib/execution-delta-service.ts` | Absorbed into delta apply or kept as low-level helpers |
| `apps/web/src/lib/workstation-query.ts` | NEEDS_EXECUTION_REVIEW attention |
| `apps/web/src/app/co/[token]/change-order-share-actions.ts` | Request changes checkpoint |

---

## H. Pass 3 UI files (reference only)

| File | Change |
|------|--------|
| `change-order-workspace.tsx` | Execution impact panel (delta editor, not quote clone) |
| `change-order-readiness-panel.tsx` | Show application status + stale plan |
| `change-order-impact-preview.tsx` | Task-level preview from delta |
| NEW `change-order-execution-delta-panel.tsx` | Office delta builder |

---

## I. Tests required before / during Pass 2

| Test file | Coverage |
|-----------|----------|
| `execution-delta-schema.test.ts` | Zod parse, opId uniqueness |
| `execution-delta-validation.test.ts` | Coverage, hard-signal orphans, stale entity |
| `execution-delta-apply.test.ts` | Transaction apply, rollback on failure |
| `change-order-flow.test.ts` | Update readiness for stored base version |
| `change-order-actions.integration.test.ts` | Draft immutability; apply sets revision + version |
| `quote-scope-revision-actions.integration.test.ts` | Migrate/rename legacy scope revision tests |
| Conflict fixtures | CO drafted at v3, job at v4, safe vs unsafe rebase |
| Trapped ACCEPTED | Lands in NEEDS_EXECUTION_REVIEW not infinite apply loop |

---

## J. Schema risk rating

| Dimension | Rating | Notes |
|-----------|--------|-------|
| Data loss risk | **Low** | Additive |
| Production apply path | **High impact** | Refactor required |
| Enum migration | **Medium** | Postgres additive enums OK |
| Backfill correctness | **Medium** | Legacy COs scope-only deltas |
| Rollback | **Medium** | Enum forward-only |
| **Overall** | **MEDIUM** | Approve schema, then implement apply refactor in isolated PR |

---

## K. Verdict

**Ready for schema approval** with these conditions:

1. Approve enum expansions and `ChangeOrder` columns as specified.
2. Accept `VOID` (not `VOIDED`) as canonical enum value.
3. Pass 2 ships backfill script + apply refactor in same release window.
4. Do **not** ship schema without Pass 2 apply refactor (otherwise new columns are inert and misleading).

No smaller design pass required — architecture is locked in canon. Optional trim: defer `JobTask` lineage and full `JobActivityType` expansion to Pass 2b if needed to reduce migration scope.
