-- AlterTable
ALTER TABLE "QuoteLineItem" ADD COLUMN     "sourceLineItemTemplateId" TEXT;

-- CreateTable
CREATE TABLE "LineItemTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "defaultQuantity" DECIMAL(18,6) NOT NULL,
    "defaultUnitAmountCents" INTEGER NOT NULL,
    "defaultInternalNotes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineItemTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LineItemTemplate_organizationId_idx" ON "LineItemTemplate"("organizationId");

-- CreateIndex
CREATE INDEX "LineItemTemplate_organizationId_archivedAt_idx" ON "LineItemTemplate"("organizationId", "archivedAt");

-- CreateIndex
CREATE INDEX "QuoteLineItem_sourceLineItemTemplateId_idx" ON "QuoteLineItem"("sourceLineItemTemplateId");

-- AddForeignKey
ALTER TABLE "LineItemTemplate" ADD CONSTRAINT "LineItemTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLineItem" ADD CONSTRAINT "QuoteLineItem_sourceLineItemTemplateId_fkey" FOREIGN KEY ("sourceLineItemTemplateId") REFERENCES "LineItemTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
