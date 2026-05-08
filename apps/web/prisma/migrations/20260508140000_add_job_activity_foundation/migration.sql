-- CreateEnum
CREATE TYPE "JobActivityType" AS ENUM ('ISSUE_CREATED', 'ISSUE_RESOLVED', 'ISSUE_FOLLOW_UP_TASK_CREATED', 'PAYMENT_REQUIREMENT_CREATED', 'PAYMENT_REQUIREMENT_PAID', 'PAYMENT_REQUIREMENT_WAIVED', 'PAYMENT_REQUIREMENT_CANCELED');

-- CreateTable
CREATE TABLE "JobActivity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "type" "JobActivityType" NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobActivity_organizationId_idx" ON "JobActivity"("organizationId");
CREATE INDEX "JobActivity_jobId_idx" ON "JobActivity"("jobId");
CREATE INDEX "JobActivity_organizationId_createdAt_idx" ON "JobActivity"("organizationId", "createdAt");
CREATE INDEX "JobActivity_jobId_createdAt_idx" ON "JobActivity"("jobId", "createdAt");
CREATE INDEX "JobActivity_entityType_entityId_idx" ON "JobActivity"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "JobActivity" ADD CONSTRAINT "JobActivity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobActivity" ADD CONSTRAINT "JobActivity_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobActivity" ADD CONSTRAINT "JobActivity_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
