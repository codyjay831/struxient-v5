-- CreateEnum
CREATE TYPE "PaymentScheduleAnchorType" AS ENUM ('UPON_APPROVAL', 'BEFORE_STAGE', 'AFTER_STAGE', 'FINAL_BALANCE');

-- CreateTable
CREATE TABLE "PaymentScheduleItem" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amountCents" INTEGER,
    "percentage" DECIMAL(5,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "anchorType" "PaymentScheduleAnchorType" NOT NULL DEFAULT 'UPON_APPROVAL',
    "anchorStageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentScheduleItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentScheduleItem_quoteId_idx" ON "PaymentScheduleItem"("quoteId");

-- CreateIndex
CREATE INDEX "PaymentScheduleItem_quoteId_sortOrder_idx" ON "PaymentScheduleItem"("quoteId", "sortOrder");

-- AddForeignKey
ALTER TABLE "PaymentScheduleItem" ADD CONSTRAINT "PaymentScheduleItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentScheduleItem" ADD CONSTRAINT "PaymentScheduleItem_anchorStageId_fkey" FOREIGN KEY ("anchorStageId") REFERENCES "Stage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
