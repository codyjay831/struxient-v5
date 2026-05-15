import type {
  JobIssueSeverity,
  JobIssueStatus,
  JobPaymentRequirementStatus,
  JobTaskStatus,
} from "@prisma/client";

export type JobTaskExecutionTask = {
  id: string;
  title: string;
  status: JobTaskStatus;
  instructions: string | null;
  completedAt: Date | null;
  completionNote: string | null;
  completionRequirementsJson: unknown;
  attachments: {
    id: string;
    fileName: string;
    fileKey: string;
    contentType: string;
  }[];
  issues: {
    id: string;
    status: JobIssueStatus;
    severity: JobIssueSeverity;
  }[];
  providesSignals: string[];
  requiresSignals: string[];
  hardSignal: boolean;
  recoveryFlow?: {
    jobIssueId: string;
  } | null;
  paymentBlockers: {
    status: JobPaymentRequirementStatus;
    title: string;
  }[];
};

export type JobTaskExecutionPayload = {
  jobId: string;
  jobStageId: string;
  stageTitle: string;
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
