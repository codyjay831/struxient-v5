-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "publicIntakeClientKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Lead_organizationId_publicIntakeClientKey_key" ON "Lead"("organizationId", "publicIntakeClientKey");
