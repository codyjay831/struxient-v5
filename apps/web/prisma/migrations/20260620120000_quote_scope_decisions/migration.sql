-- CreateEnum
CREATE TYPE "QuoteScopeDecisionSourceType" AS ENUM ('QUICK_SCOPE', 'CLARIFICATION', 'SITE_VISIT', 'MANUAL', 'AI');

-- CreateEnum
CREATE TYPE "QuoteScopeDecisionStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED', 'DEFERRED');

-- CreateEnum
CREATE TYPE "QuoteScopeDecisionResolutionTiming" AS ENUM ('BEFORE_QUOTE', 'ASK_CUSTOMER', 'SITE_VISIT', 'EXECUTION', 'ASSUMPTION', 'NOT_NEEDED');

-- CreateEnum
CREATE TYPE "QuoteScopeDecisionQuoteImpact" AS ENUM ('NONE', 'POSSIBLE', 'REQUIRED');

-- CreateTable
CREATE TABLE "QuoteScopeDecision" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "quoteLineItemId" TEXT,
    "sourceType" "QuoteScopeDecisionSourceType" NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "status" "QuoteScopeDecisionStatus" NOT NULL DEFAULT 'OPEN',
    "resolutionTiming" "QuoteScopeDecisionResolutionTiming",
    "quoteImpact" "QuoteScopeDecisionQuoteImpact" NOT NULL DEFAULT 'NONE',
    "sourceRefType" TEXT,
    "sourceRefId" TEXT,
    "resolvedByClarificationId" TEXT,
    "createdByUserId" TEXT,
    "resolvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "QuoteScopeDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuoteScopeDecision_organizationId_quoteId_idx" ON "QuoteScopeDecision"("organizationId", "quoteId");

-- CreateIndex
CREATE INDEX "QuoteScopeDecision_quoteId_status_idx" ON "QuoteScopeDecision"("quoteId", "status");

-- CreateIndex
CREATE INDEX "QuoteScopeDecision_quoteLineItemId_idx" ON "QuoteScopeDecision"("quoteLineItemId");

-- CreateIndex
CREATE INDEX "QuoteScopeDecision_organizationId_quoteId_quoteLineItemId_sourceType_idx" ON "QuoteScopeDecision"("organizationId", "quoteId", "quoteLineItemId", "sourceType");

-- AddForeignKey
ALTER TABLE "QuoteScopeDecision" ADD CONSTRAINT "QuoteScopeDecision_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteScopeDecision" ADD CONSTRAINT "QuoteScopeDecision_quoteLineItemId_fkey" FOREIGN KEY ("quoteLineItemId") REFERENCES "QuoteLineItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
