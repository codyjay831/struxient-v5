-- CreateEnum
CREATE TYPE "QuoteLineExecutionReviewStatus" AS ENUM ('UNREVIEWED', 'NO_EXECUTION_NEEDED');

-- CreateEnum
CREATE TYPE "QuoteLineExecutionMergeMode" AS ENUM ('MERGE_INTO_JOB_STAGES', 'KEEP_SEPARATE_BLOCK');

-- AlterTable
ALTER TABLE "QuoteLineItem" ADD COLUMN "executionReviewStatus" "QuoteLineExecutionReviewStatus" NOT NULL DEFAULT 'UNREVIEWED';

-- AlterTable
ALTER TABLE "QuoteLineItem" ADD COLUMN "executionMergeMode" "QuoteLineExecutionMergeMode" NOT NULL DEFAULT 'MERGE_INTO_JOB_STAGES';

-- AlterTable
ALTER TABLE "QuoteLineItem" ADD COLUMN "executionOrder" INTEGER NOT NULL DEFAULT 0;

-- Backfill work order from commercial line order
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "quoteId"
      ORDER BY "sortOrder" ASC, "id" ASC
    ) - 1 AS rn
  FROM "QuoteLineItem"
)
UPDATE "QuoteLineItem" q
SET "executionOrder" = ranked.rn
FROM ranked
WHERE q.id = ranked.id;

-- CreateIndex
CREATE INDEX "QuoteLineItem_quoteId_executionOrder_idx" ON "QuoteLineItem"("quoteId", "executionOrder");
