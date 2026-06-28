import type { StaffRole } from "@prisma/client";
import type {
  WorkstationFilterCategory,
  WorkstationLens,
  WorkstationWorkItemGroup,
  WorkstationWorkItemKind,
  WorkstationWorkItemPriority,
} from "@/lib/workstation-query";
import type { WorkstationLane } from "@/lib/workstation/rank";
import type { WorkItemEmbeddedWorkflow } from "@/lib/record-workflow-surface";
import type {
  ExecutionHealthPrimaryState,
} from "@/lib/job-execution-health";
import type {
  WorkstationRecoveryActionKind,
} from "@/lib/workstation-recovery-routing";

export type OperationalAttentionKind =
  | "quote_activation"
  | "quote_revision"
  | "change_order_send"
  | "change_order_apply"
  | "job_execution"
  | "task_execution"
  | "payment_review"
  | "schedule_risk"
  | "customer_request"
  | "proof_required";

export type OperationalAttentionSeverity =
  | "info"
  | "attention"
  | "blocking"
  | "critical";

export type OperationalAttentionSourceType =
  | "Lead"
  | "Quote"
  | "Job"
  | "ChangeOrder"
  | "Task"
  | "Payment"
  | "CustomerRequest"
  | "Schedule";

export type OperationalAttentionAction = {
  label: string;
  href?: string;
  actionKind?: string;
  disabledReason?: string;
};

export type OperationalAttentionVisibility = {
  canRead: boolean;
  canAct: boolean;
  redacted?: boolean;
  reason?: string;
};

export type OperationalAttentionRank = {
  lane: WorkstationLane;
  priority: WorkstationWorkItemPriority;
  group: WorkstationWorkItemGroup;
  lens: WorkstationLens;
  withinLaneRank: number;
};

export type OperationalAttentionWorkstationCompat = {
  workstationId?: string;
  workstationKind: WorkstationWorkItemKind;
  filterCategory: WorkstationFilterCategory;
  status?: string;
  reason?: string;
  nextStep?: string;
  subtitle?: string;
  contextLine?: string;
  scopeLabel?: string | null;
  addressLine?: string | null;
  ageLabel?: string | null;
  valueLabel?: string | null;
  typeLabel?: string;
  parentRecordId?: string;
  parentLabel?: string;
  href?: string;
  leadAnchorId?: string | null;
  assignedUserId?: string | null;
  dueAt?: Date | null;
  scheduledStartAt?: Date | null;
  isBlocked?: boolean;
  isWaitingOnSignals?: boolean;
  missingSignals?: string[];
  signalId?: string;
  workflow?: WorkItemEmbeddedWorkflow;
  executionHealthState?: ExecutionHealthPrimaryState;
  executionHealthHeadline?: string;
  paymentHoldLabel?: string;
  actionKind?: WorkstationRecoveryActionKind;
  actionLabel?: string;
  actionIssueId?: string;
  actionTaskId?: string;
};

export type OperationalAttentionItem = {
  id: string;
  kind: OperationalAttentionKind;
  severity: OperationalAttentionSeverity;
  ownerRoles: StaffRole[];
  sourceType: OperationalAttentionSourceType;
  sourceId: string;
  title: string;
  reason: string;
  safeNextAction: OperationalAttentionAction;
  secondaryAction?: OperationalAttentionAction;
  visibility: OperationalAttentionVisibility;
  quoteId?: string;
  jobId?: string;
  taskId?: string;
  changeOrderId?: string;
  customerId?: string;
  createdAt?: Date;
  updatedAt: Date;
  dueAt?: Date | null;
  rank?: OperationalAttentionRank;
  workstationCompat?: OperationalAttentionWorkstationCompat;
};

export type OperationalAttentionRecordScope =
  | { sourceType: "Quote"; sourceId: string }
  | { sourceType: "Job"; sourceId: string }
  | { sourceType: "ChangeOrder"; sourceId: string }
  | { sourceType: "Task"; sourceId: string }
  | { sourceType: "Payment"; sourceId: string }
  | { sourceType: "CustomerRequest"; sourceId: string };

export type OperationalAttentionResolverContext = {
  organizationId: string;
  role: StaffRole;
  userId: string;
  now: Date;
  urgentThresholdHours?: number;
  mode?: "workstation" | "record";
  recordScope?: OperationalAttentionRecordScope;
};

export type OperationalAttentionResolverInput = {
  items?: readonly OperationalAttentionItem[];
  includeUnreadable?: boolean;
};

export type OperationalAttentionResolverDiagnostic = {
  code: string;
  message: string;
};

export type OperationalAttentionResolverOutput = {
  items: OperationalAttentionItem[];
  diagnostics: OperationalAttentionResolverDiagnostic[];
};
