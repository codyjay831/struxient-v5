-- CreateEnum
CREATE TYPE "ChangeOrderApplicationStatus" AS ENUM ('NOT_APPLIED', 'APPLIED', 'APPLY_FAILED', 'NEEDS_EXECUTION_REVIEW');

-- AlterEnum
ALTER TYPE "ChangeOrderStatus" ADD VALUE IF NOT EXISTS 'READY_TO_SEND';
ALTER TYPE "ChangeOrderStatus" ADD VALUE IF NOT EXISTS 'CUSTOMER_REQUESTED_CHANGES';
ALTER TYPE "ChangeOrderStatus" ADD VALUE IF NOT EXISTS 'SUPERSEDED';

-- AlterEnum
ALTER TYPE "ChangeOrderCheckpointKind" ADD VALUE IF NOT EXISTS 'REQUEST_CHANGES';

-- AlterEnum
ALTER TYPE "ExecutionPlanRevisionKind" ADD VALUE IF NOT EXISTS 'JOB_EXECUTION_DELTA';

-- AlterEnum
ALTER TYPE "ExecutionPlanRevisionStatus" ADD VALUE IF NOT EXISTS 'ACCEPTED';
ALTER TYPE "ExecutionPlanRevisionStatus" ADD VALUE IF NOT EXISTS 'APPLY_FAILED';
ALTER TYPE "ExecutionPlanRevisionStatus" ADD VALUE IF NOT EXISTS 'NEEDS_REVIEW';

-- AlterEnum
ALTER TYPE "JobActivityType" ADD VALUE IF NOT EXISTS 'CHANGE_ORDER_CREATED';
ALTER TYPE "JobActivityType" ADD VALUE IF NOT EXISTS 'CHANGE_ORDER_SENT';
ALTER TYPE "JobActivityType" ADD VALUE IF NOT EXISTS 'CHANGE_ORDER_ACCEPTED';
ALTER TYPE "JobActivityType" ADD VALUE IF NOT EXISTS 'CHANGE_ORDER_REQUESTED_CHANGES';
ALTER TYPE "JobActivityType" ADD VALUE IF NOT EXISTS 'CHANGE_ORDER_REJECTED';
ALTER TYPE "JobActivityType" ADD VALUE IF NOT EXISTS 'CHANGE_ORDER_VOIDED';
ALTER TYPE "JobActivityType" ADD VALUE IF NOT EXISTS 'CHANGE_ORDER_APPLY_ATTEMPTED';
ALTER TYPE "JobActivityType" ADD VALUE IF NOT EXISTS 'CHANGE_ORDER_APPLIED';
ALTER TYPE "JobActivityType" ADD VALUE IF NOT EXISTS 'CHANGE_ORDER_APPLY_FAILED';
ALTER TYPE "JobActivityType" ADD VALUE IF NOT EXISTS 'CHANGE_ORDER_NEEDS_EXECUTION_REVIEW';

-- AlterTable
ALTER TABLE "ChangeOrder"
  ADD COLUMN "baseJobPlanVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "executionDeltaJson" JSONB,
  ADD COLUMN "executionDeltaSchemaVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "applicationStatus" "ChangeOrderApplicationStatus" NOT NULL DEFAULT 'NOT_APPLIED',
  ADD COLUMN "lastApplyErrorJson" JSONB,
  ADD COLUMN "lastApplyAttemptAt" TIMESTAMP(3),
  ADD COLUMN "supersededByChangeOrderId" TEXT;

-- AlterTable
ALTER TABLE "JobTask"
  ADD COLUMN "sourceChangeOrderId" TEXT,
  ADD COLUMN "sourceExecutionDeltaOpId" TEXT;

-- Backfill active job plan version anchors where possible.
UPDATE "ChangeOrder" co
SET "baseJobPlanVersion" = COALESCE(j."jobPlanVersion", 1)
FROM "Job" j
WHERE co."jobId" = j."id";

-- Backfill legacy scope-only execution deltas from existing ChangeOrderLine rows.
WITH line_ops AS (
  SELECT
    col."changeOrderId",
    jsonb_agg(
      jsonb_build_object(
        'opId', 'scope:' || col."id",
        'type', CASE col."operation"
          WHEN 'ADD' THEN 'ADD_SCOPE_ITEM'
          WHEN 'MODIFY' THEN 'MODIFY_SCOPE_ITEM'
          ELSE 'REMOVE_SCOPE_ITEM'
        END,
        'targetEntityType', 'JobScopeItem',
        'targetEntityId', col."sourceJobScopeItemId",
        'payload', jsonb_build_object(
          'changeOrderLineId', col."id",
          'description', col."description",
          'quantity', col."quantity"::text,
          'unitPriceCents', col."unitPriceCents",
          'executionRelevant', col."executionRelevant"
        ),
        'reason', co."reasoning",
        'customerLabel', col."description",
        'requiresCustomerApproval', COALESCE(col."priceDeltaCents", 0) <> 0,
        'linkedChangeOrderLineId', col."id"
      )
      ORDER BY col."createdAt", col."id"
    ) AS operations
  FROM "ChangeOrderLine" col
  JOIN "ChangeOrder" co ON co."id" = col."changeOrderId"
  GROUP BY col."changeOrderId"
)
UPDATE "ChangeOrder" co
SET "executionDeltaJson" = jsonb_build_object(
  'schemaVersion', 1,
  'baseJobPlanVersion', co."baseJobPlanVersion",
  'summary', 'Legacy scope-only execution delta backfilled from Change Order lines.',
  'operations', COALESCE(line_ops.operations, '[]'::jsonb),
  'meta', jsonb_build_object(
    'source', 'migration-backfill',
    'legacyScopeReconciliation', true
  )
)
FROM line_ops
WHERE co."id" = line_ops."changeOrderId"
  AND co."executionDeltaJson" IS NULL;

-- Backfill application sub-state from commercial status.
UPDATE "ChangeOrder"
SET "applicationStatus" = 'APPLIED'
WHERE "status" = 'APPLIED';

-- CreateIndex
CREATE INDEX "ChangeOrder_jobId_applicationStatus_idx" ON "ChangeOrder"("jobId", "applicationStatus");

-- CreateIndex
CREATE INDEX "ChangeOrder_supersededByChangeOrderId_idx" ON "ChangeOrder"("supersededByChangeOrderId");

-- CreateIndex
CREATE INDEX "JobTask_sourceChangeOrderId_idx" ON "JobTask"("sourceChangeOrderId");

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_supersededByChangeOrderId_fkey" FOREIGN KEY ("supersededByChangeOrderId") REFERENCES "ChangeOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobTask" ADD CONSTRAINT "JobTask_sourceChangeOrderId_fkey" FOREIGN KEY ("sourceChangeOrderId") REFERENCES "ChangeOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
