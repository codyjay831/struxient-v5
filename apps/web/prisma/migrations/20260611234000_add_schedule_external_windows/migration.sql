-- Phase 4: external/customer window semantics on canonical schedule events.
ALTER TABLE "JobScheduleEvent"
ADD COLUMN "externalWindowStartAt" TIMESTAMP(3),
ADD COLUMN "externalWindowEndAt" TIMESTAMP(3),
ADD COLUMN "externalWindowLabel" TEXT,
ADD COLUMN "externalWindowNotes" TEXT,
ADD COLUMN "externalWindowSource" TEXT,
ADD COLUMN "customerVisible" BOOLEAN NOT NULL DEFAULT false;
