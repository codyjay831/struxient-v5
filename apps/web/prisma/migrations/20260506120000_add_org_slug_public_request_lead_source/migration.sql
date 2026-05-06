-- AlterEnum
ALTER TYPE "LeadSource" ADD VALUE 'PUBLIC_REQUEST_LINK';

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "slug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
