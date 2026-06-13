import {
  JobScopeItemStatus,
  JobStatus,
  QuoteScopeRevisionLineOperation,
  QuoteScopeRevisionStatus,
  StaffRole,
} from "@prisma/client";
import {
  assertExecutionPlanPermission,
} from "@/lib/execution-plan-permissions";
import { validateScopeRevisionPaymentImpact } from "@/lib/quote-scope-revision-payment-policy";

export type ChangeOrderLineDraft = {
  operation: QuoteScopeRevisionLineOperation;
  sourceJobScopeItemId?: string | null;
  description: string;
  quantity: string;
  unitPriceCents?: number | null;
  priceDeltaCents?: number | null;
  executionRelevant?: boolean;
};

export type ChangeOrderScopeItemSnapshot = {
  id: string;
  description: string;
  quantity: string;
  unitPriceCents: number | null;
  executionRelevant: boolean;
  status: JobScopeItemStatus;
};

export type ChangeOrderRevisionSnapshot = {
  id: string;
  status: QuoteScopeRevisionStatus;
  reasoning: string;
  priceDeltaCents: number;
  lines: ChangeOrderLineDraft[];
};

export type ChangeOrderPermissions = {
  canCreateDraft: boolean;
  canApprove: boolean;
  canApply: boolean;
  createDraftError: string | null;
  approveError: string | null;
  applyError: string | null;
};

export type ChangeOrderPageBlockReason =
  | "missing_quote"
  | "job_archived"
  | "no_permissions";

export type ChangeOrderImpactPreview = {
  addCount: number;
  modifyCount: number;
  removeCount: number;
  executionRelevantLineCount: number;
  priceDeltaCents: number;
  paymentBlocked: boolean;
  paymentBlockReason: string | null;
  scopeSummaryLines: string[];
};

export function jobChangeOrdersPath(jobId: string): string {
  return `/jobs/${jobId}/change-orders`;
}

export function jobDetailPath(jobId: string): string {
  return `/jobs/${jobId}`;
}

export function deriveChangeOrderPermissions(role: StaffRole): ChangeOrderPermissions {
  const createPermission = assertExecutionPlanPermission(role, "approve_scope_revision");
  const approvePermission = assertExecutionPlanPermission(role, "approve_scope_revision");
  const applyPermission = assertExecutionPlanPermission(role, "apply_scope_revision");

  return {
    canCreateDraft: createPermission.ok,
    canApprove: approvePermission.ok,
    canApply: applyPermission.ok,
    createDraftError: createPermission.ok ? null : createPermission.error,
    approveError: approvePermission.ok ? null : approvePermission.error,
    applyError: applyPermission.ok ? null : applyPermission.error,
  };
}

export function deriveChangeOrderPageBlockReason(input: {
  quoteId: string | null;
  jobStatus: JobStatus;
  permissions: ChangeOrderPermissions;
}): ChangeOrderPageBlockReason | null {
  if (!input.quoteId) return "missing_quote";
  if (input.jobStatus === JobStatus.ARCHIVED) return "job_archived";
  if (
    !input.permissions.canCreateDraft &&
    !input.permissions.canApprove &&
    !input.permissions.canApply
  ) {
    return "no_permissions";
  }
  return null;
}

export function changeOrderPageBlockMessage(
  reason: ChangeOrderPageBlockReason,
): string {
  switch (reason) {
    case "missing_quote":
      return "This job has no linked quote. Change Orders require a signed quote reference.";
    case "job_archived":
      return "This job is archived. Change Orders can only be created on active jobs.";
    case "no_permissions":
      return "You do not have permission to create, approve, or apply Change Orders.";
    default:
      return "Change Orders are unavailable for this job.";
  }
}

export function validateChangeOrderLine(
  line: ChangeOrderLineDraft,
  activeScopeItemIds: Set<string>,
): { ok: true } | { ok: false; error: string } {
  if (!line.description.trim()) {
    return { ok: false, error: "Each line requires a description." };
  }
  const quantity = line.quantity.trim();
  if (!quantity || Number.isNaN(Number(quantity)) || Number(quantity) <= 0) {
    return { ok: false, error: "Each line requires a positive quantity." };
  }
  if (line.operation === QuoteScopeRevisionLineOperation.ADD) {
    return { ok: true };
  }
  const sourceId = line.sourceJobScopeItemId?.trim();
  if (!sourceId) {
    return { ok: false, error: "MODIFY and REMOVE lines require a source scope item." };
  }
  if (!activeScopeItemIds.has(sourceId)) {
    return { ok: false, error: "Source scope item must be active on this job." };
  }
  return { ok: true };
}

export function validateChangeOrderDraftInput(input: {
  reasoning: string;
  lines: ChangeOrderLineDraft[];
  activeScopeItemIds: Set<string>;
}): { ok: true; priceDeltaCents: number } | { ok: false; error: string } {
  if (!input.reasoning.trim()) {
    return { ok: false, error: "Reasoning is required." };
  }
  if (input.lines.length === 0) {
    return { ok: false, error: "At least one scope revision line is required." };
  }
  for (const line of input.lines) {
    const lineValidation = validateChangeOrderLine(line, input.activeScopeItemIds);
    if (!lineValidation.ok) return lineValidation;
  }
  const priceDeltaCents = input.lines.reduce(
    (sum, line) => sum + (line.priceDeltaCents ?? 0),
    0,
  );
  return { ok: true, priceDeltaCents };
}

export function deriveChangeOrderImpactPreview(input: {
  lines: ChangeOrderLineDraft[];
  priceDeltaCents: number;
}): ChangeOrderImpactPreview {
  const addCount = input.lines.filter(
    (line) => line.operation === QuoteScopeRevisionLineOperation.ADD,
  ).length;
  const modifyCount = input.lines.filter(
    (line) => line.operation === QuoteScopeRevisionLineOperation.MODIFY,
  ).length;
  const removeCount = input.lines.filter(
    (line) => line.operation === QuoteScopeRevisionLineOperation.REMOVE,
  ).length;
  const executionRelevantLineCount = input.lines.filter(
    (line) => line.executionRelevant !== false,
  ).length;

  const paymentCheck = validateScopeRevisionPaymentImpact({
    priceDeltaCents: input.priceDeltaCents,
    hasApprovedPaymentImpactOperationInTx: false,
  });

  const scopeSummaryLines = input.lines.map((line) => {
    const op =
      line.operation === QuoteScopeRevisionLineOperation.ADD
        ? "Add"
        : line.operation === QuoteScopeRevisionLineOperation.MODIFY
          ? "Modify"
          : "Remove";
    return `${op}: ${line.description.trim()}`;
  });

  return {
    addCount,
    modifyCount,
    removeCount,
    executionRelevantLineCount,
    priceDeltaCents: input.priceDeltaCents,
    paymentBlocked: !paymentCheck.ok,
    paymentBlockReason: paymentCheck.error ?? null,
    scopeSummaryLines,
  };
}

export type ChangeOrderButtonState = {
  disabled: boolean;
  reason: string | null;
};

export function getCreateDraftButtonState(input: {
  permissions: ChangeOrderPermissions;
  pageBlocked: boolean;
  draftLines: ChangeOrderLineDraft[];
  reasoning: string;
  activeScopeItemIds: Set<string>;
  isPending: boolean;
}): ChangeOrderButtonState {
  if (input.pageBlocked) {
    return { disabled: true, reason: "Change Orders are blocked for this job." };
  }
  if (input.isPending) {
    return { disabled: true, reason: "Saving change order draft…" };
  }
  if (!input.permissions.canCreateDraft) {
    return {
      disabled: true,
      reason: input.permissions.createDraftError ?? "You cannot create Change Order drafts.",
    };
  }
  const validation = validateChangeOrderDraftInput({
    reasoning: input.reasoning,
    lines: input.draftLines,
    activeScopeItemIds: input.activeScopeItemIds,
  });
  if (!validation.ok) {
    return { disabled: true, reason: validation.error };
  }
  return { disabled: false, reason: null };
}

export function getApproveButtonState(input: {
  permissions: ChangeOrderPermissions;
  pageBlocked: boolean;
  selectedRevision: ChangeOrderRevisionSnapshot | null;
  isPending: boolean;
}): ChangeOrderButtonState {
  if (input.pageBlocked) {
    return { disabled: true, reason: "Change Orders are blocked for this job." };
  }
  if (input.isPending) {
    return { disabled: true, reason: "Approving change order…" };
  }
  if (!input.selectedRevision) {
    return { disabled: true, reason: "Select a draft Change Order to approve." };
  }
  if (input.selectedRevision.status !== QuoteScopeRevisionStatus.DRAFT) {
    return { disabled: true, reason: "Only draft Change Orders can be approved." };
  }
  if (!input.permissions.canApprove) {
    return {
      disabled: true,
      reason: input.permissions.approveError ?? "You cannot approve Change Orders.",
    };
  }
  return { disabled: false, reason: null };
}

export function getApplyButtonState(input: {
  permissions: ChangeOrderPermissions;
  pageBlocked: boolean;
  selectedRevision: ChangeOrderRevisionSnapshot | null;
  jobPlanVersion: number;
  expectedJobPlanVersion: number;
  isPending: boolean;
}): ChangeOrderButtonState {
  if (input.pageBlocked) {
    return { disabled: true, reason: "Change Orders are blocked for this job." };
  }
  if (input.isPending) {
    return { disabled: true, reason: "Applying change order…" };
  }
  if (!input.selectedRevision) {
    return { disabled: true, reason: "Select an approved Change Order to apply." };
  }
  if (input.selectedRevision.status !== QuoteScopeRevisionStatus.APPROVED) {
    return { disabled: true, reason: "Only approved Change Orders can be applied." };
  }
  if (!input.permissions.canApply) {
    return {
      disabled: true,
      reason: input.permissions.applyError ?? "You cannot apply Change Orders.",
    };
  }
  const versionCheck = checkJobPlanVersionForApply({
    expectedJobPlanVersion: input.expectedJobPlanVersion,
    currentJobPlanVersion: input.jobPlanVersion,
  });
  if (!versionCheck.ok) {
    return { disabled: true, reason: versionCheck.error };
  }
  const impact = deriveChangeOrderImpactPreview({
    lines: input.selectedRevision.lines,
    priceDeltaCents: input.selectedRevision.priceDeltaCents,
  });
  if (impact.paymentBlocked && impact.paymentBlockReason) {
    return { disabled: true, reason: impact.paymentBlockReason };
  }
  return { disabled: false, reason: null };
}

export function checkJobPlanVersionForApply(input: {
  expectedJobPlanVersion: number;
  currentJobPlanVersion: number;
}): { ok: true } | { ok: false; error: string } {
  if (input.expectedJobPlanVersion !== input.currentJobPlanVersion) {
    return {
      ok: false,
      error: "Job plan changed. Refresh and retry with the latest Change Order state.",
    };
  }
  return { ok: true };
}

export function shouldShowJobChangeOrderLink(input: {
  quoteId: string | null;
  jobStatus: JobStatus;
}): boolean {
  return input.quoteId != null && input.jobStatus === JobStatus.ACTIVE;
}

export function resolveFocusedRevisionId(input: {
  revisions: Array<{ id: string }>;
  requestedRevisionId: string | null;
}): string | null {
  if (input.requestedRevisionId) {
    const exists = input.revisions.some((revision) => revision.id === input.requestedRevisionId);
    if (exists) return input.requestedRevisionId;
  }
  return input.revisions[0]?.id ?? null;
}
