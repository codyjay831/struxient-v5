import type {
  JobIssueSeverity,
  JobIssueStatus,
  JobIssueType,
  JobRecoveryFlowStatus,
  JobTaskStatus,
} from "@prisma/client";
import type { TaskIssueRef } from "@/lib/task-readiness";
import type { TaskPaymentHold } from "@/lib/job-payment-readiness";

export type JobTaskExecutionTask = {
  id: string;
  title: string;
  status: JobTaskStatus;
  instructions: string | null;
  completedAt: Date | null;
  completionNote: string | null;
  completionRequirementsJson: unknown;
  dueAt: Date | null;
  dueMode?: import("@prisma/client").TaskDueMode;
  dueAnchor?: import("@prisma/client").TaskDueAnchor | null;
  dueOffsetDays?: number | null;
  dueGranularity?: import("@prisma/client").TaskDueGranularity | null;
  schedulingRequirement?: import("@prisma/client").TaskSchedulingRequirement;
  scheduledStartAt: Date | null;
  scheduledEndAt: Date | null;
  assignedUserId: string | null;
  attachments: {
    id: string;
    fileName: string;
    fileKey: string;
    contentType: string;
  }[];
  issues: {
    id: string;
    title: string;
    description: string | null;
    status: JobIssueStatus;
    severity: JobIssueSeverity;
    type: JobIssueType;
    createdAt: Date;
    createdByUser?: {
      name: string | null;
    } | null;
    recoveryFlow?: {
      id: string;
      status: JobRecoveryFlowStatus;
      tasks: {
        id: string;
        title: string;
        status: JobTaskStatus;
      }[];
    } | null;
  }[];
  providesSignals: string[];
  requiresSignals: string[];
  hardSignal: boolean;
  recoveryFlow?: {
    jobIssueId: string;
  } | null;
};

export type JobTaskExecutionPayload = {
  jobId: string;
  jobStageId: string;
  stageTitle: string;
  stageIssues: TaskIssueRef[];
  paymentHold: TaskPaymentHold;
  jobContextLabel: string;
  /** Jobsite / project address for field context (customer profile or lead). */
  jobsiteAddressLine: string | null;
  /** When set, the crew can add a saved service address from this task panel. */
  customerId: string | null;
  /** Staff path to add a structured address on the linked request when there is no customer yet. */
  leadEditHref: string | null;
  jobHref: string;
  task: JobTaskExecutionTask;
};
