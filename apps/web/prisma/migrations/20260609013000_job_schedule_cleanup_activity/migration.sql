-- Job archive + schedule cleanup audit activity types

ALTER TYPE "JobActivityType" ADD VALUE 'JOB_ARCHIVED';
ALTER TYPE "JobActivityType" ADD VALUE 'JOB_SCHEDULE_CLEANUP_COMPLETED';
