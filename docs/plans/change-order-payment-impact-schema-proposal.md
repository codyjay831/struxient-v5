# Change Order Payment Impact — Schema Proposal (Pass 0)

> **Status:** Proposal only — **do not migrate** until explicitly approved (`ALLOW_SCHEMA=1`).  
> **Canon authority:** [change-order-canon.md](../canon/change-order-canon.md) §11  
> **Date:** 2026-06-24  
> **Depends on:** [change-order-execution-delta-schema-proposal.md](./change-order-execution-delta-schema-proposal.md) (execution delta columns — may already be shipped)

---

## Summary

Add **`ChangeOrder.paymentImpactJson`** as the commercial/customer-approved carrier for CO payment strategy. Apply materializes approved strategy into `JobPaymentRequirement` mutations in the same transaction as execution delta apply.

**No new `JobPaymentRequirement` columns required for MVP** — existing fields (`sourceChangeOrderId`, `status`, `amountCents`, `requiredBeforeStageId`, `sourcePaymentScheduleItemId`) are sufficient when combined with apply audit metadata on `ExecutionPlanRevision` / `JobActivity`.

**Schema risk rating: LOW–MEDIUM** — one nullable JSON column on `ChangeOrder`; optional enum column deferred; backfill for in-flight price-impact COs.

---

## A. Proposed Prisma change (minimal MVP)

### 1. `ChangeOrder` — add column

```prisma
model ChangeOrder {
  // ... existing fields ...
  paymentImpactJson Json?
}
```

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `paymentImpactJson` | `Json?` | `null` | Commercial payment strategy + customer terms + resolved preview (see §B) |

**Why JSON-first:** Strategy payload includes nested preview (target title, before/after cents, customer text). Avoids premature column sprawl. Query-by-strategy can use JSON path or add enum column in Pass 1b if Workstation filters require it.

### 2. Optional Pass 1b — dedicated enum column (not required for MVP)

```prisma
enum ChangeOrderPaymentStrategy {
  DUE_BEFORE_ADDED_WORK
  ADD_TO_NEXT_UNPAID_PAYMENT
  ADD_TO_FINAL_PAYMENT
  CREDIT_REMAINING_BALANCE
  LEGACY_SEPARATE_PAYMENT_REVIEW
}

model ChangeOrder {
  paymentStrategy ChangeOrderPaymentStrategy?
}
```

**Recommendation:** Ship **`paymentImpactJson` only** first. Add `paymentStrategy` enum column only if indexed Workstation queries (e.g. “COs awaiting payment review”) justify migration cost. Until then, derive strategy from JSON in application code.

### 3. Fields evaluated — not required for MVP

| Proposed field | MVP? | Verdict |
|----------------|------|---------|
| `ChangeOrder.paymentImpactJson` | **Yes** | **Approve** — canonical commercial carrier |
| `ChangeOrder.paymentStrategy` enum | Optional | **Defer** — JSON-first unless query need proven |
| `JobPaymentRequirement.sourceChangeOrderPaymentStrategy` | No | **Reject for MVP** — store in apply audit (`ExecutionPlanRevision.modelProviderMeta`, `JobActivity.metadataJson`) |
| `JobPaymentRequirement.paymentDueCondition` | No | **Reject for MVP** — use `status = DUE` + optional `requiredBeforeStageId`; derive due-ness via existing `isPaymentEffectivelyDue()` extensions in code |
| `JobPaymentRequirement.blocksWork` | No | **Reject for MVP** — store `blocksAddedWork` on `paymentImpactJson`; derive holds from `requiredBeforeStageId` + existing `deriveTaskPaymentHold()` |

---

## B. `paymentImpactJson` JSON schema (v1)

File to add in Pass 1 implementation: `apps/web/src/lib/change-order/payment-impact-schema.ts` (Zod).

```typescript
export const CHANGE_ORDER_PAYMENT_IMPACT_SCHEMA_VERSION = 1;

export const ChangeOrderPaymentStrategySchema = z.enum([
  "DUE_BEFORE_ADDED_WORK",
  "ADD_TO_NEXT_UNPAID_PAYMENT",
  "ADD_TO_FINAL_PAYMENT",
  "CREDIT_REMAINING_BALANCE",
  "LEGACY_SEPARATE_PAYMENT_REVIEW", // backfill only — block send until replaced
]);

export const ChangeOrderPaymentImpactResolvedPreviewSchema = z.object({
  strategyLabel: z.string().min(1), // office-facing
  customerSummary: z.string().min(1), // plain English for customer page
  targetPaymentRequirementId: z.string().nullable().optional(),
  targetPaymentTitle: z.string().nullable().optional(),
  targetAmountBeforeCents: z.number().int().nullable().optional(),
  targetAmountAfterCents: z.number().int().nullable().optional(),
  dueTimingLabel: z.string().nullable().optional(), // e.g. "Before added work starts"
  blocksAddedWork: z.boolean().optional(),
});

export const ChangeOrderPaymentImpactSchema = z
  .object({
    schemaVersion: z.literal(1),
    strategy: ChangeOrderPaymentStrategySchema,
    targetPaymentRequirementId: z.string().nullable().optional(),
    customerTermsText: z.string().min(1),
    blocksAddedWork: z.boolean().optional(),
    resolvedPreview: ChangeOrderPaymentImpactResolvedPreviewSchema,
    // Optional audit at send time
    resolvedAtSendJobPlanVersion: z.number().int().positive().optional(),
  })
  .superRefine((value, ctx) => {
    const needsTarget = [
      "ADD_TO_NEXT_UNPAID_PAYMENT",
      "ADD_TO_FINAL_PAYMENT",
    ].includes(value.strategy);
    if (needsTarget && !value.targetPaymentRequirementId) {
      ctx.addIssue({
        code: "custom",
        path: ["targetPaymentRequirementId"],
        message: "Target payment requirement is required for this strategy.",
      });
    }
    if (
      value.strategy === "DUE_BEFORE_ADDED_WORK" &&
      value.resolvedPreview.blocksAddedWork == null
    ) {
      // default false acceptable at parse layer
    }
  });
```

### Checkpoint embedding

`ChangeOrderCheckpoint.snapshotJson` (SEND + ACCEPTANCE) **must** include:

```typescript
type ChangeOrderCheckpointSnapshotWire = {
  document: ChangeOrderCustomerPreviewDocument; // existing
  paymentImpact?: ChangeOrderPaymentImpact; // same shape as paymentImpactJson
};
```

Customer `document` projection **must** surface `paymentImpact.resolvedPreview.customerSummary` (or `customerTermsText`) — not raw JSON.

---

## C. API / server contract (no new REST — server actions)

| Action / gate | Payment rule |
|---------------|--------------|
| Save draft | When `priceDeltaCents !== 0`, validate + persist `paymentImpactJson` if provided; derive default suggestion |
| Send | **Reject** if `priceDeltaCents !== 0` and `paymentImpactJson` invalid or missing |
| Customer accept | ACCEPTANCE checkpoint copies `paymentImpactJson` |
| Apply | Run `materializeChangeOrderPaymentImpactInTx()` before or after scope ops in same tx; **ignore** legacy `UPDATE_PAYMENT_REQUIREMENT` ops for new COs |

New module (Pass 1): `apps/web/src/lib/change-order/payment-impact-materialize.ts`

---

## D. Migration SQL outline (when approved)

```sql
ALTER TABLE "ChangeOrder"
  ADD COLUMN "paymentImpactJson" JSONB;
```

No enum migration required for MVP JSON-only path.

---

## E. Backfill plan

| CO state | `priceDeltaCents` | Backfill action |
|----------|-------------------|-----------------|
| `DRAFT`, `SENT`, `ACCEPTED`, not applied | `!== 0` | Set `paymentImpactJson.strategy = LEGACY_SEPARATE_PAYMENT_REVIEW`, `customerTermsText` explaining office must select strategy before send/apply; **block send** in new code until replaced |
| `APPLIED` | `!== 0` | **No mutation** — historical standalone `JobPaymentRequirement` rows remain; optional note in JSON meta `legacyApplied: true` |
| Any | `0` | Leave `paymentImpactJson` null |
| `VOID`, `REJECTED`, `SUPERSEDED` | any | No backfill required |

**Risk:** In-flight price-impact COs mid-workflow need office re-review — intentional.

---

## F. Rollback plan

- Column nullable — code rollback ignores `paymentImpactJson`.
- Forward-only; no data loss if column unused.

---

## G. Relationship to execution delta

| Concern | Owner |
|---------|-------|
| Customer payment terms | `paymentImpactJson` + checkpoint |
| Scope/task mutations | `executionDeltaJson` |
| Runtime payment rows | Apply materializer reading `paymentImpactJson` |

**Remove from default builder:** auto `UPDATE_PAYMENT_REQUIREMENT` in `execution-delta-build.ts` once materializer ships.

**Validation change:** replace `hasApprovedPaymentImpactOperationInTx` check with `hasValidPaymentImpactJson` for non-zero deltas.

---

## H. Tests required (Pass 1)

| Area | Tests |
|------|-------|
| Schema | Zod parse; strategy/target invariants; LEGACY blocks send |
| Send gate | Price-impact CO rejected without `paymentImpactJson` |
| Customer projection | Payment terms in document; no internal fields |
| Checkpoint | SEND/ACCEPTANCE snapshot includes `paymentImpact` |
| Materialize — due before work | Creates `DUE` row with `sourceChangeOrderId` |
| Materialize — add next/final | Increases unsettled target only; fails on PAID target |
| Materialize — credit | Final-first reduction; fails on over-credit |
| Guards | No double-count; no negative payable rows |
| Workstation | `DUE` CO-sourced requirement appears in payment attention |
| Customer page static guard | No `executionDeltaJson` / op ids in public surface |

---

## I. Implementation phases (reference)

| Phase | Scope |
|-------|--------|
| **0** | Canon + this proposal (**current**) |
| **1** | Schema approval → `paymentImpactJson` column → Zod → send/accept gates → customer projection |
| **2** | Apply materializer; remove legacy delta payment op generation |
| **3** | Work Impact read-only summary; commercial UI payment card |
| **4** | Deferred strategies, Stripe sync, partial payments |

---

## J. Schema risk rating

| Dimension | Rating | Notes |
|-----------|--------|-------|
| Data loss risk | **Low** | Nullable JSON column |
| Apply path impact | **High** (logic, not schema) | Materializer in hot tx |
| Backfill | **Medium** | In-flight COs need office action |
| Query / reporting | **Low** without enum column | JSON path sufficient initially |
| **Overall schema change** | **LOW** | Single column |
| **Overall product change** | **MEDIUM** | Apply + customer surfaces |

---

## K. Schema approval request

**Requesting approval for:**

1. `ChangeOrder.paymentImpactJson` (`Json?`, nullable)

**Not requesting in this pass:**

- `ChangeOrder.paymentStrategy` enum column
- New `JobPaymentRequirement` columns

**Conditions:**

1. Pass 1 ships materializer in same release window as column (column alone is insufficient).
2. Backfill script marks non-applied price-impact COs as `LEGACY_SEPARATE_PAYMENT_REVIEW`.
3. Do not ship customer send for price-impact CO until payment terms UI exists (or block send in code).

**Verdict:** **Ready for schema approval** (minimal column) pending explicit user `ALLOW_SCHEMA=1`.
