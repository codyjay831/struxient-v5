-- CreateEnum
CREATE TYPE "LineItemTemplateTaskSource" AS ENUM ('TASK_TEMPLATE', 'CUSTOM');

-- CreateTable
CREATE TABLE "LineItemTemplateTask" (
    "id" TEXT NOT NULL,
    "lineItemTemplateId" TEXT NOT NULL,
    "sourceType" "LineItemTemplateTaskSource" NOT NULL,
    "sourceTaskTemplateId" TEXT,
    "title" TEXT NOT NULL,
    "stageKey" "ExecutionStageKey" NOT NULL,
    "category" "TaskTemplateCategory" NOT NULL,
    "instructions" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineItemTemplateTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LineItemTemplateTask_lineItemTemplateId_stageKey_sortOrder_idx" ON "LineItemTemplateTask"("lineItemTemplateId", "stageKey", "sortOrder");

-- CreateIndex
CREATE INDEX "LineItemTemplateTask_lineItemTemplateId_sortOrder_idx" ON "LineItemTemplateTask"("lineItemTemplateId", "sortOrder");

-- AddForeignKey
ALTER TABLE "LineItemTemplateTask" ADD CONSTRAINT "LineItemTemplateTask_lineItemTemplateId_fkey" FOREIGN KEY ("lineItemTemplateId") REFERENCES "LineItemTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineItemTemplateTask" ADD CONSTRAINT "LineItemTemplateTask_sourceTaskTemplateId_fkey" FOREIGN KEY ("sourceTaskTemplateId") REFERENCES "TaskTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
