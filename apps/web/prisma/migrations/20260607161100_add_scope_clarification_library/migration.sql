-- CreateEnum
CREATE TYPE "ClarificationInputType" AS ENUM (
  'single_choice',
  'multi_choice',
  'yes_no_unknown',
  'short_text',
  'number',
  'notes'
);

-- CreateEnum
CREATE TYPE "ClarificationQuestionSetStatus" AS ENUM (
  'draft',
  'active',
  'archived',
  'merged'
);

-- CreateTable
CREATE TABLE "ClarificationQuestionSet" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "label" TEXT NOT NULL,
  "status" "ClarificationQuestionSetStatus" NOT NULL DEFAULT 'draft',
  "description" TEXT,
  "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "archivedAt" TIMESTAMP(3),
  "mergedIntoId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClarificationQuestionSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClarificationQuestion" (
  "id" TEXT NOT NULL,
  "questionSetId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "inputType" "ClarificationInputType" NOT NULL,
  "helpText" TEXT,
  "allowOther" BOOLEAN NOT NULL DEFAULT false,
  "unit" TEXT,
  "customerFacing" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClarificationQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClarificationOption" (
  "id" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClarificationOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteLineClarification" (
  "id" TEXT NOT NULL,
  "quoteLineItemId" TEXT NOT NULL,
  "clarificationSetId" TEXT,
  "questionSetKey" TEXT NOT NULL,
  "questionSetVersion" INTEGER NOT NULL,
  "answersJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuoteLineClarification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ClarificationQuestionSetToTag" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL,
  CONSTRAINT "_ClarificationQuestionSetToTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClarificationQuestionSet_organizationId_key_version_key"
ON "ClarificationQuestionSet"("organizationId", "key", "version");

-- CreateIndex
CREATE INDEX "ClarificationQuestionSet_organizationId_idx" ON "ClarificationQuestionSet"("organizationId");
CREATE INDEX "ClarificationQuestionSet_organizationId_key_idx" ON "ClarificationQuestionSet"("organizationId", "key");
CREATE INDEX "ClarificationQuestionSet_organizationId_status_idx" ON "ClarificationQuestionSet"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ClarificationQuestion_questionSetId_key_key"
ON "ClarificationQuestion"("questionSetId", "key");
CREATE INDEX "ClarificationQuestion_questionSetId_sortOrder_idx"
ON "ClarificationQuestion"("questionSetId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ClarificationOption_questionId_key_key"
ON "ClarificationOption"("questionId", "key");
CREATE INDEX "ClarificationOption_questionId_sortOrder_idx"
ON "ClarificationOption"("questionId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteLineClarification_quoteLineItemId_questionSetKey_quest_key"
ON "QuoteLineClarification"("quoteLineItemId", "questionSetKey", "questionSetVersion");
CREATE INDEX "QuoteLineClarification_quoteLineItemId_idx" ON "QuoteLineClarification"("quoteLineItemId");
CREATE INDEX "QuoteLineClarification_questionSetKey_questionSetVersion_idx"
ON "QuoteLineClarification"("questionSetKey", "questionSetVersion");

-- CreateIndex
CREATE INDEX "_ClarificationQuestionSetToTag_B_index" ON "_ClarificationQuestionSetToTag"("B");

-- AddForeignKey
ALTER TABLE "ClarificationQuestionSet"
ADD CONSTRAINT "ClarificationQuestionSet_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClarificationQuestionSet"
ADD CONSTRAINT "ClarificationQuestionSet_mergedIntoId_fkey"
FOREIGN KEY ("mergedIntoId") REFERENCES "ClarificationQuestionSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClarificationQuestion"
ADD CONSTRAINT "ClarificationQuestion_questionSetId_fkey"
FOREIGN KEY ("questionSetId") REFERENCES "ClarificationQuestionSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClarificationOption"
ADD CONSTRAINT "ClarificationOption_questionId_fkey"
FOREIGN KEY ("questionId") REFERENCES "ClarificationQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLineClarification"
ADD CONSTRAINT "QuoteLineClarification_quoteLineItemId_fkey"
FOREIGN KEY ("quoteLineItemId") REFERENCES "QuoteLineItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLineClarification"
ADD CONSTRAINT "QuoteLineClarification_clarificationSetId_fkey"
FOREIGN KEY ("clarificationSetId") REFERENCES "ClarificationQuestionSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClarificationQuestionSetToTag"
ADD CONSTRAINT "_ClarificationQuestionSetToTag_A_fkey"
FOREIGN KEY ("A") REFERENCES "ClarificationQuestionSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClarificationQuestionSetToTag"
ADD CONSTRAINT "_ClarificationQuestionSetToTag_B_fkey"
FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
