-- CreateEnum
CREATE TYPE "DailyJobLogStatus" AS ENUM ('DRAFT', 'REVIEWED', 'VOID');

-- CreateTable
CREATE TABLE "DailyJobLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "logDate" TIMESTAMP(3) NOT NULL,
    "summary" TEXT NOT NULL,
    "internalNotes" TEXT,
    "status" "DailyJobLogStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyJobLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyJobLog_organizationId_idx" ON "DailyJobLog"("organizationId");

-- CreateIndex
CREATE INDEX "DailyJobLog_jobId_idx" ON "DailyJobLog"("jobId");

-- CreateIndex
CREATE INDEX "DailyJobLog_organizationId_logDate_idx" ON "DailyJobLog"("organizationId", "logDate");

-- CreateIndex
CREATE INDEX "DailyJobLog_jobId_logDate_idx" ON "DailyJobLog"("jobId", "logDate");

-- CreateIndex
CREATE INDEX "DailyJobLog_status_idx" ON "DailyJobLog"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DailyJobLog_jobId_logDate_key" ON "DailyJobLog"("jobId", "logDate");

-- AddForeignKey
ALTER TABLE "DailyJobLog" ADD CONSTRAINT "DailyJobLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyJobLog" ADD CONSTRAINT "DailyJobLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyJobLog" ADD CONSTRAINT "DailyJobLog_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
