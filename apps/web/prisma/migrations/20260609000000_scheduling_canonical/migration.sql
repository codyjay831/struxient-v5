-- Scheduling canonical: JobScheduleEvent, deadline modes, task-event links

-- CreateEnum
CREATE TYPE "TaskDueMode" AS ENUM ('NONE', 'MANUAL', 'DERIVED');
CREATE TYPE "TaskDueAnchor" AS ENUM ('JOB_ACTIVATION', 'FIRST_READY');
CREATE TYPE "TaskDueGranularity" AS ENUM ('DATE_ONLY', 'EXACT');
CREATE TYPE "TaskSchedulingRequirement" AS ENUM ('NONE', 'OPTIONAL', 'REQUIRED');
CREATE TYPE "JobScheduleEventKind" AS ENUM (
  'CUSTOMER_APPOINTMENT',
  'SITE_VISIT',
  'CREW_WORK',
  'INSPECTION',
  'DELIVERY',
  'UTILITY_APPOINTMENT',
  'OFFICE_WORK',
  'OTHER'
);
CREATE TYPE "JobScheduleEventStatus" AS ENUM ('TENTATIVE', 'CONFIRMED', 'COMPLETED', 'CANCELED');

-- AlterEnum JobActivityType
ALTER TYPE "JobActivityType" ADD VALUE 'TASK_DEADLINE_UPDATED';
ALTER TYPE "JobActivityType" ADD VALUE 'SCHEDULE_EVENT_CREATED';
ALTER TYPE "JobActivityType" ADD VALUE 'SCHEDULE_EVENT_CONFIRMED';
ALTER TYPE "JobActivityType" ADD VALUE 'SCHEDULE_EVENT_RESCHEDULED';
ALTER TYPE "JobActivityType" ADD VALUE 'SCHEDULE_EVENT_CANCELED';
ALTER TYPE "JobActivityType" ADD VALUE 'SCHEDULE_EVENT_COMPLETED';
ALTER TYPE "JobActivityType" ADD VALUE 'SCHEDULE_EVENT_TASK_LINKED';
ALTER TYPE "JobActivityType" ADD VALUE 'SCHEDULE_EVENT_TASK_UNLINKED';

-- AlterTable Organization
ALTER TABLE "Organization" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'America/Los_Angeles';

-- AlterTable JobTask
ALTER TABLE "JobTask" ADD COLUMN "dueMode" "TaskDueMode" NOT NULL DEFAULT 'NONE';
ALTER TABLE "JobTask" ADD COLUMN "dueAnchor" "TaskDueAnchor";
ALTER TABLE "JobTask" ADD COLUMN "dueOffsetDays" INTEGER;
ALTER TABLE "JobTask" ADD COLUMN "dueGranularity" "TaskDueGranularity";
ALTER TABLE "JobTask" ADD COLUMN "dueResolvedAt" TIMESTAMP(3);
ALTER TABLE "JobTask" ADD COLUMN "dueFirstReadyAt" TIMESTAMP(3);
ALTER TABLE "JobTask" ADD COLUMN "schedulingRequirement" "TaskSchedulingRequirement" NOT NULL DEFAULT 'NONE';

CREATE INDEX "JobTask_schedulingRequirement_idx" ON "JobTask"("schedulingRequirement");

-- Migrate legacy dueOffsetMinutesAfterReady to derived rule (approximate days)
UPDATE "JobTask"
SET
  "dueMode" = 'DERIVED',
  "dueAnchor" = 'FIRST_READY',
  "dueOffsetDays" = GREATEST(0, ROUND(COALESCE("dueOffsetMinutesAfterReady", 0) / 1440.0)),
  "dueGranularity" = 'EXACT'
WHERE "dueOffsetMinutesAfterReady" IS NOT NULL;

UPDATE "JobTask"
SET
  "dueMode" = 'MANUAL',
  "dueGranularity" = 'EXACT',
  "dueResolvedAt" = "dueAt"
WHERE "dueAt" IS NOT NULL AND "dueMode" = 'NONE';

-- CreateTable JobScheduleEvent
CREATE TABLE "JobScheduleEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "kind" "JobScheduleEventKind" NOT NULL,
  "status" "JobScheduleEventStatus" NOT NULL DEFAULT 'TENTATIVE',
  "title" TEXT,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "leadUserId" TEXT,
  "notes" TEXT,
  "legacyVisitId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JobScheduleEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JobScheduleEventTask" (
  "id" TEXT NOT NULL,
  "jobScheduleEventId" TEXT NOT NULL,
  "jobTaskId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JobScheduleEventTask_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JobScheduleEvent_legacyVisitId_key" ON "JobScheduleEvent"("legacyVisitId");
CREATE INDEX "JobScheduleEvent_organizationId_idx" ON "JobScheduleEvent"("organizationId");
CREATE INDEX "JobScheduleEvent_jobId_idx" ON "JobScheduleEvent"("jobId");
CREATE INDEX "JobScheduleEvent_leadUserId_idx" ON "JobScheduleEvent"("leadUserId");
CREATE INDEX "JobScheduleEvent_status_idx" ON "JobScheduleEvent"("status");
CREATE INDEX "JobScheduleEvent_startAt_idx" ON "JobScheduleEvent"("startAt");
CREATE INDEX "JobScheduleEvent_endAt_idx" ON "JobScheduleEvent"("endAt");
CREATE UNIQUE INDEX "JobScheduleEventTask_jobScheduleEventId_jobTaskId_key" ON "JobScheduleEventTask"("jobScheduleEventId", "jobTaskId");
CREATE INDEX "JobScheduleEventTask_jobTaskId_idx" ON "JobScheduleEventTask"("jobTaskId");

ALTER TABLE "JobScheduleEvent" ADD CONSTRAINT "JobScheduleEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobScheduleEvent" ADD CONSTRAINT "JobScheduleEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobScheduleEvent" ADD CONSTRAINT "JobScheduleEvent_leadUserId_fkey" FOREIGN KEY ("leadUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JobScheduleEventTask" ADD CONSTRAINT "JobScheduleEventTask_jobScheduleEventId_fkey" FOREIGN KEY ("jobScheduleEventId") REFERENCES "JobScheduleEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobScheduleEventTask" ADD CONSTRAINT "JobScheduleEventTask_jobTaskId_fkey" FOREIGN KEY ("jobTaskId") REFERENCES "JobTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill JobVisit -> JobScheduleEvent
INSERT INTO "JobScheduleEvent" (
  "id",
  "organizationId",
  "jobId",
  "kind",
  "status",
  "title",
  "startAt",
  "endAt",
  "leadUserId",
  "notes",
  "legacyVisitId",
  "createdAt",
  "updatedAt"
)
SELECT
  'jse_' || v."id",
  v."organizationId",
  v."jobId",
  'SITE_VISIT'::"JobScheduleEventKind",
  CASE v."status"
    WHEN 'SCHEDULED' THEN 'CONFIRMED'::"JobScheduleEventStatus"
    WHEN 'COMPLETED' THEN 'COMPLETED'::"JobScheduleEventStatus"
    WHEN 'CANCELED' THEN 'CANCELED'::"JobScheduleEventStatus"
  END,
  NULL,
  v."scheduledStartAt",
  COALESCE(v."scheduledEndAt", v."scheduledStartAt" + INTERVAL '2 hours'),
  v."assignedUserId",
  v."notes",
  v."id",
  v."createdAt",
  v."updatedAt"
FROM "JobVisit" v;

-- Backfill JobTask scheduled blocks -> JobScheduleEvent (crew work)
INSERT INTO "JobScheduleEvent" (
  "id",
  "organizationId",
  "jobId",
  "kind",
  "status",
  "title",
  "startAt",
  "endAt",
  "leadUserId",
  "notes",
  "legacyVisitId",
  "createdAt",
  "updatedAt"
)
SELECT
  'jse_task_' || t."id",
  j."organizationId",
  t."jobId",
  'CREW_WORK'::"JobScheduleEventKind",
  'CONFIRMED'::"JobScheduleEventStatus",
  t."title",
  t."scheduledStartAt",
  COALESCE(t."scheduledEndAt", t."scheduledStartAt" + INTERVAL '2 hours'),
  t."assignedUserId",
  NULL,
  NULL,
  t."updatedAt",
  t."updatedAt"
FROM "JobTask" t
JOIN "Job" j ON j."id" = t."jobId"
WHERE t."scheduledStartAt" IS NOT NULL;

INSERT INTO "JobScheduleEventTask" ("id", "jobScheduleEventId", "jobTaskId", "createdAt")
SELECT
  'jset_' || t."id",
  'jse_task_' || t."id",
  t."id",
  NOW()
FROM "JobTask" t
WHERE t."scheduledStartAt" IS NOT NULL;
