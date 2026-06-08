-- CreateEnum
CREATE TYPE "ScheduleBlockType" AS ENUM (
  'BUSINESS_HOURS',
  'TIME_OFF',
  'INTERNAL_EVENT'
);

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM (
  'IN_APP',
  'EMAIL',
  'SMS'
);

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM (
  'PENDING',
  'SENT',
  'FAILED',
  'CANCELED'
);

-- AlterTable
ALTER TABLE "JobTask"
ADD COLUMN "assignedUserId" TEXT,
ADD COLUMN "dueAt" TIMESTAMP(3),
ADD COLUMN "scheduledStartAt" TIMESTAMP(3),
ADD COLUMN "scheduledEndAt" TIMESTAMP(3),
ADD COLUMN "dueOffsetMinutesAfterReady" INTEGER;

-- CreateTable
CREATE TABLE "ScheduleBlock" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT,
  "title" TEXT NOT NULL,
  "type" "ScheduleBlockType" NOT NULL DEFAULT 'INTERNAL_EVENT',
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3),
  "allDay" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScheduleBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT,
  "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
  "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT,
  "dedupeKey" TEXT,
  "payloadJson" JSONB,
  "sendAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobTask_assignedUserId_idx" ON "JobTask"("assignedUserId");
CREATE INDEX "JobTask_dueAt_idx" ON "JobTask"("dueAt");
CREATE INDEX "JobTask_scheduledStartAt_idx" ON "JobTask"("scheduledStartAt");

-- CreateIndex
CREATE INDEX "ScheduleBlock_organizationId_idx" ON "ScheduleBlock"("organizationId");
CREATE INDEX "ScheduleBlock_userId_idx" ON "ScheduleBlock"("userId");
CREATE INDEX "ScheduleBlock_type_idx" ON "ScheduleBlock"("type");
CREATE INDEX "ScheduleBlock_startAt_idx" ON "ScheduleBlock"("startAt");

-- CreateIndex
CREATE INDEX "NotificationEvent_organizationId_idx" ON "NotificationEvent"("organizationId");
CREATE INDEX "NotificationEvent_userId_idx" ON "NotificationEvent"("userId");
CREATE INDEX "NotificationEvent_status_idx" ON "NotificationEvent"("status");
CREATE INDEX "NotificationEvent_sendAt_idx" ON "NotificationEvent"("sendAt");
CREATE INDEX "NotificationEvent_createdAt_idx" ON "NotificationEvent"("createdAt");
CREATE UNIQUE INDEX "NotificationEvent_organizationId_dedupeKey_key" ON "NotificationEvent"("organizationId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "JobTask"
ADD CONSTRAINT "JobTask_assignedUserId_fkey"
FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleBlock"
ADD CONSTRAINT "ScheduleBlock_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleBlock"
ADD CONSTRAINT "ScheduleBlock_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationEvent"
ADD CONSTRAINT "NotificationEvent_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationEvent"
ADD CONSTRAINT "NotificationEvent_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
