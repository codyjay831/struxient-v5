-- CreateEnum
CREATE TYPE "ChangeOrderStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'APPLIED', 'REJECTED', 'VOID');

-- CreateEnum
CREATE TYPE "ChangeOrderLineOperation" AS ENUM ('ADD', 'MODIFY', 'REMOVE');

-- CreateEnum
CREATE TYPE "ChangeOrderCheckpointKind" AS ENUM ('SEND', 'ACCEPTANCE');

-- CreateEnum
CREATE TYPE "ChangeOrderCheckpointSource" AS ENUM ('STAFF', 'CUSTOMER_PORTAL');

-- DropForeignKey
ALTER TABLE "ExecutionPlanRevision" DROP CONSTRAINT "ExecutionPlanRevision_quoteScopeRevisionId_fkey";

-- DropForeignKey
ALTER TABLE "JobPaymentRequirement" DROP CONSTRAINT "JobPaymentRequirement_sourceQuoteScopeRevisionId_fkey";

-- DropForeignKey
ALTER TABLE "JobScopeItem" DROP CONSTRAINT "JobScopeItem_sourceQuoteScopeRevisionLineId_fkey";

-- DropForeignKey
ALTER TABLE "QuoteScopeRevision" DROP CONSTRAINT "QuoteScopeRevision_approvedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "QuoteScopeRevision" DROP CONSTRAINT "QuoteScopeRevision_jobId_fkey";

-- DropForeignKey
ALTER TABLE "QuoteScopeRevision" DROP CONSTRAINT "QuoteScopeRevision_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "QuoteScopeRevision" DROP CONSTRAINT "QuoteScopeRevision_quoteId_fkey";

-- DropForeignKey
ALTER TABLE "QuoteScopeRevisionLine" DROP CONSTRAINT "QuoteScopeRevisionLine_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "QuoteScopeRevisionLine" DROP CONSTRAINT "QuoteScopeRevisionLine_quoteScopeRevisionId_fkey";

-- DropForeignKey
ALTER TABLE "QuoteScopeRevisionLine" DROP CONSTRAINT "QuoteScopeRevisionLine_sourceJobScopeItemId_fkey";

-- DropIndex
DROP INDEX "ExecutionPlanRevision_quoteScopeRevisionId_idx";

-- DropIndex
DROP INDEX "JobPaymentRequirement_sourceQuoteScopeRevisionId_idx";

-- DropIndex
DROP INDEX "JobScopeItem_sourceQuoteScopeRevisionLineId_idx";

-- AlterTable
ALTER TABLE "ExecutionPlanRevision" DROP COLUMN "quoteScopeRevisionId",
ADD COLUMN     "changeOrderId" TEXT;

-- AlterTable
ALTER TABLE "JobPaymentRequirement" DROP COLUMN "sourceQuoteScopeRevisionId",
ADD COLUMN     "sourceChangeOrderId" TEXT;

-- AlterTable
ALTER TABLE "JobScopeItem" DROP COLUMN "sourceQuoteScopeRevisionLineId",
ADD COLUMN     "sourceChangeOrderLineId" TEXT;

-- DropTable
DROP TABLE "QuoteScopeRevision";

-- DropTable
DROP TABLE "QuoteScopeRevisionLine";

-- DropEnum
DROP TYPE "QuoteScopeRevisionLineOperation";

-- DropEnum
DROP TYPE "QuoteScopeRevisionStatus";

-- CreateTable
CREATE TABLE "ChangeOrderShareToken" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "changeOrderId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "acceptedByName" TEXT,
    "acceptedFromIp" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "ChangeOrderShareToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeOrderView" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "changeOrderId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "ChangeOrderView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeOrderCheckpoint" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "changeOrderId" TEXT NOT NULL,
    "kind" "ChangeOrderCheckpointKind" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "snapshotJson" JSONB NOT NULL,
    "staffOnlyJson" JSONB,
    "changeOrderUpdatedAtAtCapture" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "ChangeOrderCheckpointSource" NOT NULL DEFAULT 'STAFF',

    CONSTRAINT "ChangeOrderCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeOrder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "customerDocumentTitle" TEXT,
    "status" "ChangeOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "reasoning" TEXT NOT NULL,
    "priceDeltaCents" INTEGER NOT NULL DEFAULT 0,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "lastSentEmailAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeOrderLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "changeOrderId" TEXT NOT NULL,
    "operation" "ChangeOrderLineOperation" NOT NULL,
    "sourceJobScopeItemId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitPriceCents" INTEGER,
    "priceDeltaCents" INTEGER,
    "executionRelevant" BOOLEAN NOT NULL DEFAULT true,
    "scopeDataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChangeOrderShareToken_changeOrderId_key" ON "ChangeOrderShareToken"("changeOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "ChangeOrderShareToken_token_key" ON "ChangeOrderShareToken"("token");

-- CreateIndex
CREATE INDEX "ChangeOrderShareToken_organizationId_idx" ON "ChangeOrderShareToken"("organizationId");

-- CreateIndex
CREATE INDEX "ChangeOrderShareToken_token_idx" ON "ChangeOrderShareToken"("token");

-- CreateIndex
CREATE INDEX "ChangeOrderView_organizationId_idx" ON "ChangeOrderView"("organizationId");

-- CreateIndex
CREATE INDEX "ChangeOrderView_changeOrderId_idx" ON "ChangeOrderView"("changeOrderId");

-- CreateIndex
CREATE INDEX "ChangeOrderView_token_idx" ON "ChangeOrderView"("token");

-- CreateIndex
CREATE INDEX "ChangeOrderCheckpoint_organizationId_idx" ON "ChangeOrderCheckpoint"("organizationId");

-- CreateIndex
CREATE INDEX "ChangeOrderCheckpoint_changeOrderId_kind_idx" ON "ChangeOrderCheckpoint"("changeOrderId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "ChangeOrderCheckpoint_changeOrderId_kind_sequence_key" ON "ChangeOrderCheckpoint"("changeOrderId", "kind", "sequence");

-- CreateIndex
CREATE INDEX "ChangeOrder_organizationId_idx" ON "ChangeOrder"("organizationId");

-- CreateIndex
CREATE INDEX "ChangeOrder_quoteId_idx" ON "ChangeOrder"("quoteId");

-- CreateIndex
CREATE INDEX "ChangeOrder_jobId_idx" ON "ChangeOrder"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "ChangeOrder_jobId_number_key" ON "ChangeOrder"("jobId", "number");

-- CreateIndex
CREATE INDEX "ChangeOrderLine_organizationId_idx" ON "ChangeOrderLine"("organizationId");

-- CreateIndex
CREATE INDEX "ChangeOrderLine_changeOrderId_idx" ON "ChangeOrderLine"("changeOrderId");

-- CreateIndex
CREATE INDEX "ChangeOrderLine_sourceJobScopeItemId_idx" ON "ChangeOrderLine"("sourceJobScopeItemId");

-- CreateIndex
CREATE INDEX "ExecutionPlanRevision_changeOrderId_idx" ON "ExecutionPlanRevision"("changeOrderId");

-- CreateIndex
CREATE INDEX "JobPaymentRequirement_sourceChangeOrderId_idx" ON "JobPaymentRequirement"("sourceChangeOrderId");

-- CreateIndex
CREATE INDEX "JobScopeItem_sourceChangeOrderLineId_idx" ON "JobScopeItem"("sourceChangeOrderLineId");

-- AddForeignKey
ALTER TABLE "ChangeOrderShareToken" ADD CONSTRAINT "ChangeOrderShareToken_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrderShareToken" ADD CONSTRAINT "ChangeOrderShareToken_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ChangeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrderView" ADD CONSTRAINT "ChangeOrderView_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrderView" ADD CONSTRAINT "ChangeOrderView_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ChangeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrderCheckpoint" ADD CONSTRAINT "ChangeOrderCheckpoint_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrderCheckpoint" ADD CONSTRAINT "ChangeOrderCheckpoint_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ChangeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionPlanRevision" ADD CONSTRAINT "ExecutionPlanRevision_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ChangeOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrderLine" ADD CONSTRAINT "ChangeOrderLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrderLine" ADD CONSTRAINT "ChangeOrderLine_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ChangeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrderLine" ADD CONSTRAINT "ChangeOrderLine_sourceJobScopeItemId_fkey" FOREIGN KEY ("sourceJobScopeItemId") REFERENCES "JobScopeItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobScopeItem" ADD CONSTRAINT "JobScopeItem_sourceChangeOrderLineId_fkey" FOREIGN KEY ("sourceChangeOrderLineId") REFERENCES "ChangeOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPaymentRequirement" ADD CONSTRAINT "JobPaymentRequirement_sourceChangeOrderId_fkey" FOREIGN KEY ("sourceChangeOrderId") REFERENCES "ChangeOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
