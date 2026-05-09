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
    status: JobIssueStatus;
    severity: JobIssueSeverity;
  }[];
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
  jobHref: string;
  task: JobTaskExecutionTask;
};
