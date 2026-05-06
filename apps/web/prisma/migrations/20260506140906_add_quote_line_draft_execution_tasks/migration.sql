-- CreateTable
CREATE TABLE "QuoteLineExecutionTask" (
    "id" TEXT NOT NULL,
    "quoteLineItemId" TEXT NOT NULL,
    "sourceLineItemTemplateTaskId" TEXT,
    "sourceTaskTemplateId" TEXT,
    "sourceType" "LineItemTemplateTaskSource" NOT NULL,
    "title" TEXT NOT NULL,
    "stageKey" "ExecutionStageKey" NOT NULL,
    "category" "TaskTemplateCategory" NOT NULL,
    "instructions" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteLineExecutionTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuoteLineExecutionTask_quoteLineItemId_stageKey_sortOrder_idx" ON "QuoteLineExecutionTask"("quoteLineItemId", "stageKey", "sortOrder");

-- CreateIndex
CREATE INDEX "QuoteLineExecutionTask_quoteLineItemId_sortOrder_idx" ON "QuoteLineExecutionTask"("quoteLineItemId", "sortOrder");

-- AddForeignKey
ALTER TABLE "QuoteLineExecutionTask" ADD CONSTRAINT "QuoteLineExecutionTask_quoteLineItemId_fkey" FOREIGN KEY ("quoteLineItemId") REFERENCES "QuoteLineItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLineExecutionTask" ADD CONSTRAINT "QuoteLineExecutionTask_sourceLineItemTemplateTaskId_fkey" FOREIGN KEY ("sourceLineItemTemplateTaskId") REFERENCES "LineItemTemplateTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLineExecutionTask" ADD CONSTRAINT "QuoteLineExecutionTask_sourceTaskTemplateId_fkey" FOREIGN KEY ("sourceTaskTemplateId") REFERENCES "TaskTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
