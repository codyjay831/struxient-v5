import type { JobIssueSeverity, JobIssueStatus, JobIssueType } from "@prisma/client";
import type { StatusBadgeTone } from "@/components/ui/status-badge";

const JOB_ISSUE_TYPE_LABELS: Record<JobIssueType, string> = {
  INSPECTION_FAIL: "Failed Inspection",
  MATERIAL_DELAY: "Material Delay",
  SITE_CONDITION: "Site Condition",
  CUSTOMER_CHANGE: "Customer Change",
  WEATHER: "Weather",
  SCHEDULE_SLIP: "Schedule Slip",
  PAYMENT_BLOCK: "Payment Block",
  SCOPE_CLARIFICATION: "Scope Clarification",
  INTERNAL_ERROR: "Internal Error",
  OTHER: "Other",
};

const JOB_ISSUE_STATUS_LABELS: Record<JobIssueStatus, string> = {
  OPEN: "Open",
  RESOLVED: "Resolved",
  CANCELLED: "Cancelled",
};

const JOB_ISSUE_SEVERITY_LABELS: Record<JobIssueSeverity, string> = {
  BLOCKS_WORK: "Blocks work",
  DOES_NOT_BLOCK: "Does not block",
};

export function formatJobIssueType(type: JobIssueType): string {
  return JOB_ISSUE_TYPE_LABELS[type];
}

export function formatJobIssueStatus(status: JobIssueStatus): string {
  return JOB_ISSUE_STATUS_LABELS[status];
}

export function formatJobIssueSeverity(severity: JobIssueSeverity): string {
  return JOB_ISSUE_SEVERITY_LABELS[severity];
}

export function jobIssueStatusBadgeTone(status: JobIssueStatus): StatusBadgeTone {
  switch (status) {
    case "RESOLVED":
      return "approved";
    case "CANCELLED":
      return "neutral";
    case "OPEN":
    default:
      return "draft";
  }
}

export function jobIssueSeverityBadgeTone(severity: JobIssueSeverity): StatusBadgeTone {
  switch (severity) {
    case "BLOCKS_WORK":
      return "danger";
    case "DOES_NOT_BLOCK":
    default:
      return "neutral";
  }
}
