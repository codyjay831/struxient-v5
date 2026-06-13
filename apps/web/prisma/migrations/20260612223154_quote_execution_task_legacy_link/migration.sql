-- AlterTable
ALTER TABLE "QuoteExecutionTask" ADD COLUMN     "sourceQuoteLineExecutionTaskId" TEXT;

-- CreateIndex
CREATE INDEX "QuoteExecutionTask_sourceQuoteLineExecutionTaskId_idx" ON "QuoteExecutionTask"("sourceQuoteLineExecutionTaskId");

-- AddForeignKey
ALTER TABLE "QuoteExecutionTask" ADD CONSTRAINT "QuoteExecutionTask_sourceQuoteLineExecutionTaskId_fkey" FOREIGN KEY ("sourceQuoteLineExecutionTaskId") REFERENCES "QuoteLineExecutionTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
