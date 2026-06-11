-- Phase 1 canonical event cutover: completion outcome support.
CREATE TYPE "JobScheduleEventCompletionOutcome" AS ENUM (
  'WORK_COMPLETED',
  'PARTIAL_WORK',
  'NO_WORK_COMPLETED'
);

ALTER TABLE "JobScheduleEvent"
ADD COLUMN "completionOutcome" "JobScheduleEventCompletionOutcome",
ADD COLUMN "completedAt" TIMESTAMP(3);

CREATE INDEX "JobScheduleEvent_completionOutcome_idx"
ON "JobScheduleEvent"("completionOutcome");
