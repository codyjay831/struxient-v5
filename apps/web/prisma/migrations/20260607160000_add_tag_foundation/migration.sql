-- Scope Library tag entity (canonical tags + template associations).
-- Required before clarification question set ↔ tag links.

-- CreateEnum
CREATE TYPE "TagSource" AS ENUM ('USER_CREATED', 'AI_SUGGESTED', 'SYSTEM_DEFAULT', 'IMPORTED');

-- CreateEnum
CREATE TYPE "TagStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'MERGED');

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "source" "TagSource" NOT NULL DEFAULT 'USER_CREATED',
    "status" "TagStatus" NOT NULL DEFAULT 'ACTIVE',
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "usageCountLineItems" INTEGER NOT NULL DEFAULT 0,
    "usageCountTasks" INTEGER NOT NULL DEFAULT 0,
    "mergeHistory" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_LineItemTemplateToTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_LineItemTemplateToTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_TaskTemplateToTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TaskTemplateToTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tag_organizationId_name_key" ON "Tag"("organizationId", "name");

-- CreateIndex
CREATE INDEX "_LineItemTemplateToTag_B_index" ON "_LineItemTemplateToTag"("B");

-- CreateIndex
CREATE INDEX "_TaskTemplateToTag_B_index" ON "_TaskTemplateToTag"("B");

-- Drop legacy string-array tags column (replaced by Tag entity)
ALTER TABLE "LineItemTemplate" DROP COLUMN IF EXISTS "tags";

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LineItemTemplateToTag" ADD CONSTRAINT "_LineItemTemplateToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "LineItemTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LineItemTemplateToTag" ADD CONSTRAINT "_LineItemTemplateToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TaskTemplateToTag" ADD CONSTRAINT "_TaskTemplateToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TaskTemplateToTag" ADD CONSTRAINT "_TaskTemplateToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "TaskTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
