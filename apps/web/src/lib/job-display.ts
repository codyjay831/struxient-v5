import type { JobStatus, JobTaskStatus } from "@prisma/client";
import type { StatusBadgeTone } from "@/components/ui/status-badge";

const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  ACTIVE: "Active",
  ARCHIVED: "Archived",
};

const JOB_TASK_STATUS_LABELS: Record<JobTaskStatus, string> = {
  TODO: "To do",
  DONE: "Done",
  CANCELED: "Canceled",
};

export function formatJobStatus(status: JobStatus): string {
  return JOB_STATUS_LABELS[status];
}

export function jobStatusBadgeTone(status: JobStatus): StatusBadgeTone {
  switch (status) {
    case "ARCHIVED":
      return "neutral";
    case "ACTIVE":
    default:
      return "approved";
  }
}

export function formatJobTaskStatus(status: JobTaskStatus): string {
  return JOB_TASK_STATUS_LABELS[status];
}

export function jobTaskStatusBadgeTone(status: JobTaskStatus): StatusBadgeTone {
  switch (status) {
    case "DONE":
      return "approved";
    case "CANCELED":
      return "warning";
    case "TODO":
    default:
      return "draft";
  }
}
