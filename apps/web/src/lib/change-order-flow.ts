import {
  ChangeOrderLineOperation,
  ChangeOrderStatus,
  ChangeOrderApplicationStatus,
  JobScopeItemStatus,
  JobStatus,
  StaffRole,
} from "@prisma/client";
import {
  assertExecutionPlanPermission,
} from "@/lib/execution-plan-permissions";
import { validateScopeRevisionPaymentImpact } from "@/lib/quote-scope-revision-payment-policy";
import {
  canEditChangeOrderDraft,
  canStaffAcceptChangeOrder,
  changeOrderRequiresCustomerPriceApproval,
} from "@/lib/change-order/change-order-commercial-rules";
import {
  changeOrderLifecycleReadinessLabel,
  deriveChangeOrderLifecycleReadiness,
  executionImpactHasGeneratedTaskSuggestions,
  parseApplyErrorSummary,
  type ChangeOrderExecutionImpactView,
  type ChangeOrderLifecycleReadiness,
} from "@/lib/change-order/change-order-execution-projection";
import {
  commercialDraftChanged,
  deriveChangeOrderOfficeNextStep,
  executionDraftChanged,
  getUnsavedDraftChangesReason,
  resolveDraftUpdateSaveIntent,
} from "@/lib/change-order/change-order-draft-save-semantics";

export type ChangeOrderIntent = "add" | "modify" | "remove";

export type ChangeOrderLineDraft = {
  operation: ChangeOrderLineOperation;
  sourceJobScopeItemId?: string | null;
  description: string;
  quantity: string;
  unitPriceCents?: number | null;
  priceDeltaCents?: number | null;
  executionRelevant?: boolean;
};

export type ChangeOrderSignedQuoteSourceSnapshot = {
  description: string;
  quantity: string;
  unitAmountCents: number;
  lineTotalCents: number;
  customerScopeTitle: string | null;
  customerScopeDescription: string | null;
  customerIncludedNotes: string | null;
  customerExcludedNotes: string | null;
};

export type ChangeOrderPriorRevisionSourceSnapshot = {
  operation: ChangeOrderLineOperation;
  description: string;
  quantity: string;
  unitPriceCents: number | null;
  priceDeltaCents: number | null;
};

export type ChangeOrderScopeItemSnapshot = {
  id: string;
  description: string;
  quantity: string;
  unitPriceCents: number | null;
  executionRelevant: boolean;
  status: JobScopeItemStatus;
  signedQuote: ChangeOrderSignedQuoteSourceSnapshot | null;
  priorRevision: ChangeOrderPriorRevisionSourceSnapshot | null;
};

export type ChangeOrderRevisionSnapshot = {
  id: string;
  status: ChangeOrderStatus;
  reasoning: string;
  priceDeltaCents: number;
  lines: ChangeOrderLineDraft[];
  applicationStatus?: ChangeOrderApplicationStatus;
  baseJobPlanVersion?: number;
  lastApplyErrorJson?: unknown;
  customerDocumentTitle?: string | null;
  executionImpact?: ChangeOrderExecutionImpactView;
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
  lineDiffs: ChangeOrderLineDiff[];
};

export type ChangeOrderLineDiffField = {
  label: string;
  before: string;
  after: string;
  changed: boolean;
};

export type ChangeOrderLineDiff = {
  lineIndex: number;
  operation: ChangeOrderLineOperation;
  sourceDescription: string | null;
  fields: ChangeOrderLineDiffField[];
};

export type ChangeOrderReadiness = {
  impact: ChangeOrderImpactPreview;
  createDraft: ChangeOrderButtonState;
  updateDraft: ChangeOrderButtonState;
  saveCommercial: ChangeOrderButtonState;
  saveExecutionImpact: ChangeOrderButtonState;
  send: ChangeOrderButtonState;
  staffAccept: ChangeOrderButtonState;
  apply: ChangeOrderButtonState;
  executionCoverageWarning: string | null;
  jobPlanVersion: number;
  expectedJobPlanVersion: number;
  selectedRevisionStatus: ChangeOrderStatus | null;
  lifecycleReadiness: ChangeOrderLifecycleReadiness | null;
  lifecycleReadinessLabel: string | null;
  applyErrorSummary: { classification: string | null; messages: string[] } | null;
  requiresCustomerApproval: boolean;
  isEditable: boolean;
  officeNextStep: string | null;
  mixedEditBlocked: boolean;
  mixedEditMessage: string | null;
  commercialChanged: boolean;
  executionChanged: boolean;
  unsavedDraftChangesReason: string | null;
};

export function jobChangeOrdersPath(jobId: string): string {
  return `/jobs/${jobId}/change-orders`;
}

export function jobDetailPath(jobId: string): string {
  return `/jobs/${jobId}`;
}

export function createLineFromIntent(intent: ChangeOrderIntent): ChangeOrderLineDraft {
  switch (intent) {
    case "add":
      return {
        operation: ChangeOrderLineOperation.ADD,
        description: "",
        quantity: "1",
        priceDeltaCents: 0,
        executionRelevant: true,
      };
    case "modify":
      return {
        operation: ChangeOrderLineOperation.MODIFY,
        sourceJobScopeItemId: null,
        description: "",
        quantity: "1",
        priceDeltaCents: 0,
        executionRelevant: true,
      };
    case "remove":
      return {
        operation: ChangeOrderLineOperation.REMOVE,
        sourceJobScopeItemId: null,
        description: "",
        quantity: "1",
        priceDeltaCents: 0,
        executionRelevant: true,
      };
  }
}

export function buildProposedLineFromSource(
  scopeItem: ChangeOrderScopeItemSnapshot,
  operation:
    | typeof ChangeOrderLineOperation.MODIFY
    | typeof ChangeOrderLineOperation.REMOVE,
): ChangeOrderLineDraft {
  return {
    operation,
    sourceJobScopeItemId: scopeItem.id,
    description: scopeItem.description,
    quantity: scopeItem.quantity,
    unitPriceCents: scopeItem.unitPriceCents,
    executionRelevant: scopeItem.executionRelevant,
    priceDeltaCents: 0,
  };
}

export function scopeItemsById(
  items: ChangeOrderScopeItemSnapshot[],
): Map<string, ChangeOrderScopeItemSnapshot> {
  return new Map(items.map((item) => [item.id, item]));
}

function formatQuantity(value: string): string {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return value;
  return String(parsed);
}

function formatMoney(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function lineHasMeaningfulChange(
  line: ChangeOrderLineDraft,
  sourceItem: ChangeOrderScopeItemSnapshot | null,
): boolean {
  if (line.operation === ChangeOrderLineOperation.ADD) return true;
  if (!sourceItem) return false;
  if (line.operation === ChangeOrderLineOperation.REMOVE) return true;
  if ((line.priceDeltaCents ?? 0) !== 0) return true;

  return (
    line.description.trim() !== sourceItem.description.trim() ||
    formatQuantity(line.quantity) !== formatQuantity(sourceItem.quantity) ||
    (line.unitPriceCents ?? null) !== sourceItem.unitPriceCents ||
    (line.executionRelevant !== false) !== sourceItem.executionRelevant
  );
}

export function deriveChangeOrderLineDiffs(input: {
  lines: ChangeOrderLineDraft[];
  scopeItems: ChangeOrderScopeItemSnapshot[];
}): ChangeOrderLineDiff[] {
  const byId = scopeItemsById(input.scopeItems);
  const diffs: ChangeOrderLineDiff[] = [];

  for (const [lineIndex, line] of input.lines.entries()) {
    const source = line.sourceJobScopeItemId
      ? byId.get(line.sourceJobScopeItemId) ?? null
      : null;

    if (line.operation === ChangeOrderLineOperation.ADD) {
      diffs.push({
        lineIndex,
        operation: line.operation,
        sourceDescription: null,
        fields: [
          {
            label: "Description",
            before: "—",
            after: line.description.trim() || "—",
            changed: !!line.description.trim(),
          },
          {
            label: "Quantity",
            before: "—",
            after: formatQuantity(line.quantity),
            changed: true,
          },
          {
            label: "Price delta",
            before: formatMoney(0),
            after: formatMoney(line.priceDeltaCents ?? 0),
            changed: (line.priceDeltaCents ?? 0) !== 0,
          },
        ],
      });
      continue;
    }

    if (!source) continue;

    if (line.operation === ChangeOrderLineOperation.REMOVE) {
      diffs.push({
        lineIndex,
        operation: line.operation,
        sourceDescription: source.description,
        fields: [
          {
            label: "Scope item",
            before: source.description,
            after: "Removed",
            changed: true,
          },
          {
            label: "Price delta",
            before: formatMoney(0),
            after: formatMoney(line.priceDeltaCents ?? 0),
            changed: (line.priceDeltaCents ?? 0) !== 0,
          },
        ],
      });
      continue;
    }

    const fields: ChangeOrderLineDiffField[] = [
      {
        label: "Description",
        before: source.description,
        after: line.description.trim() || source.description,
        changed: line.description.trim() !== source.description.trim(),
      },
      {
        label: "Quantity",
        before: formatQuantity(source.quantity),
        after: formatQuantity(line.quantity),
        changed: formatQuantity(line.quantity) !== formatQuantity(source.quantity),
      },
      {
        label: "Unit price",
        before: formatMoney(source.unitPriceCents),
        after: formatMoney(line.unitPriceCents ?? source.unitPriceCents),
        changed: (line.unitPriceCents ?? source.unitPriceCents) !== source.unitPriceCents,
      },
      {
        label: "Price delta",
        before: formatMoney(0),
        after: formatMoney(line.priceDeltaCents ?? 0),
        changed: (line.priceDeltaCents ?? 0) !== 0,
      },
      {
        label: "Execution relevant",
        before: source.executionRelevant ? "Yes" : "No",
        after: line.executionRelevant !== false ? "Yes" : "No",
        changed: (line.executionRelevant !== false) !== source.executionRelevant,
      },
    ];

    diffs.push({
      lineIndex,
      operation: line.operation,
      sourceDescription: source.description,
      fields: fields.filter((field) => field.changed),
    });
  }

  return diffs;
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
  scopeItemsByIdMap?: Map<string, ChangeOrderScopeItemSnapshot>,
): { ok: true } | { ok: false; error: string } {
  if (line.operation === ChangeOrderLineOperation.ADD) {
    if (!line.description.trim()) {
      return { ok: false, error: "Add lines require a description." };
    }
    const quantity = line.quantity.trim();
    if (!quantity || Number.isNaN(Number(quantity)) || Number(quantity) <= 0) {
      return { ok: false, error: "Add lines require a positive quantity." };
    }
    return { ok: true };
  }

  const sourceId = line.sourceJobScopeItemId?.trim();
  if (!sourceId) {
    return {
      ok: false,
      error:
        line.operation === ChangeOrderLineOperation.MODIFY
          ? "Select the scope item you want to modify."
          : "Select the scope item you want to remove.",
    };
  }
  if (!activeScopeItemIds.has(sourceId)) {
    return { ok: false, error: "Source scope item must be active on this job." };
  }

  const sourceItem = scopeItemsByIdMap?.get(sourceId) ?? null;

  if (line.operation === ChangeOrderLineOperation.REMOVE) {
    if (!line.description.trim() && sourceItem) {
      return { ok: false, error: "Remove lines require a description or selected source scope." };
    }
    return { ok: true };
  }

  if (!line.description.trim()) {
    return { ok: false, error: "Modify lines require a description." };
  }
  const quantity = line.quantity.trim();
  if (!quantity || Number.isNaN(Number(quantity)) || Number(quantity) <= 0) {
    return { ok: false, error: "Modify lines require a positive quantity." };
  }

  if (sourceItem && !lineHasMeaningfulChange(line, sourceItem)) {
    return {
      ok: false,
      error: "Modify lines must change scope, pricing, or execution relevance from the current value.",
    };
  }

  if (sourceItem?.executionRelevant && line.executionRelevant !== false) {
    // Informational only at line level; apply-time coverage is enforced server-side.
  }

  return { ok: true };
}

export function validateChangeOrderDraftInput(input: {
  reasoning: string;
  lines: ChangeOrderLineDraft[];
  activeScopeItemIds: Set<string>;
  activeScopeItems?: ChangeOrderScopeItemSnapshot[];
}): { ok: true; priceDeltaCents: number } | { ok: false; error: string } {
  if (!input.reasoning.trim()) {
    return { ok: false, error: "Reasoning is required." };
  }
  if (input.lines.length === 0) {
    return { ok: false, error: "At least one scope revision line is required." };
  }

  const byId = input.activeScopeItems ? scopeItemsById(input.activeScopeItems) : undefined;

  for (const line of input.lines) {
    const lineValidation = validateChangeOrderLine(
      line,
      input.activeScopeItemIds,
      byId,
    );
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
  scopeItems?: ChangeOrderScopeItemSnapshot[];
}): ChangeOrderImpactPreview {
  const addCount = input.lines.filter(
    (line) => line.operation === ChangeOrderLineOperation.ADD,
  ).length;
  const modifyCount = input.lines.filter(
    (line) => line.operation === ChangeOrderLineOperation.MODIFY,
  ).length;
  const removeCount = input.lines.filter(
    (line) => line.operation === ChangeOrderLineOperation.REMOVE,
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
      line.operation === ChangeOrderLineOperation.ADD
        ? "Add"
        : line.operation === ChangeOrderLineOperation.MODIFY
          ? "Modify"
          : "Remove";
    return `${op}: ${line.description.trim() || "Untitled scope change"}`;
  });

  const lineDiffs = deriveChangeOrderLineDiffs({
    lines: input.lines,
    scopeItems: input.scopeItems ?? [],
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
    lineDiffs,
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
  activeScopeItems?: ChangeOrderScopeItemSnapshot[];
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
    activeScopeItems: input.activeScopeItems,
  });
  if (!validation.ok) {
    return { disabled: true, reason: validation.error };
  }
  return { disabled: false, reason: null };
}

export function getSendChangeOrderButtonState(input: {
  permissions: ChangeOrderPermissions;
  pageBlocked: boolean;
  selectedRevision: ChangeOrderRevisionSnapshot | null;
  executionValidationOk: boolean;
  hasGeneratedTaskSuggestions: boolean;
  hasUnsavedDraftChanges: boolean;
  unsavedDraftChangesReason: string | null;
  isPending: boolean;
}): ChangeOrderButtonState {
  if (input.pageBlocked) {
    return { disabled: true, reason: "Change Orders are blocked for this job." };
  }
  if (input.isPending) {
    return { disabled: true, reason: "Sending change order…" };
  }
  if (!input.selectedRevision) {
    return { disabled: true, reason: "Select a draft Change Order to send." };
  }
  if (input.selectedRevision.status !== ChangeOrderStatus.DRAFT) {
    return { disabled: true, reason: "Only draft Change Orders can be sent." };
  }
  if (!input.permissions.canApprove) {
    return {
      disabled: true,
      reason: input.permissions.approveError ?? "You cannot send Change Orders.",
    };
  }
  if (input.hasUnsavedDraftChanges) {
    return {
      disabled: true,
      reason: input.unsavedDraftChangesReason ?? "Save draft changes before sending.",
    };
  }
  if (!input.executionValidationOk) {
    return {
      disabled: true,
      reason: "Execution impact must pass validation before sending.",
    };
  }
  if (input.hasGeneratedTaskSuggestions) {
    return {
      disabled: true,
      reason: "Review generated task suggestions before sending.",
    };
  }
  return { disabled: false, reason: null };
}

export function getStaffAcceptButtonState(input: {
  permissions: ChangeOrderPermissions;
  pageBlocked: boolean;
  selectedRevision: ChangeOrderRevisionSnapshot | null;
  isPending: boolean;
}): ChangeOrderButtonState {
  if (input.pageBlocked) {
    return { disabled: true, reason: "Change Orders are blocked for this job." };
  }
  if (input.isPending) {
    return { disabled: true, reason: "Recording acceptance…" };
  }
  if (!input.selectedRevision) {
    return { disabled: true, reason: "Select a Change Order to accept." };
  }
  if (!input.permissions.canApprove) {
    return {
      disabled: true,
      reason: input.permissions.approveError ?? "You cannot accept Change Orders.",
    };
  }
  const acceptAllowed = canStaffAcceptChangeOrder({
    status: input.selectedRevision.status,
    priceDeltaCents: input.selectedRevision.priceDeltaCents,
  });
  if (!acceptAllowed.ok) {
    return { disabled: true, reason: acceptAllowed.error };
  }
  return { disabled: false, reason: null };
}

/** @deprecated Use getSendChangeOrderButtonState */
export function getApproveButtonState(input: {
  permissions: ChangeOrderPermissions;
  pageBlocked: boolean;
  selectedRevision: ChangeOrderRevisionSnapshot | null;
  isPending: boolean;
}): ChangeOrderButtonState {
  return getSendChangeOrderButtonState({
    ...input,
    executionValidationOk: true,
    hasGeneratedTaskSuggestions: false,
    hasUnsavedDraftChanges: false,
    unsavedDraftChangesReason: null,
  });
}

export function getUpdateDraftButtonState(input: {
  permissions: ChangeOrderPermissions;
  pageBlocked: boolean;
  selectedRevision: ChangeOrderRevisionSnapshot | null;
  draftCommercialValid: boolean;
  mixedEditBlocked: boolean;
  mixedEditMessage: string | null;
  hasPendingChanges: boolean;
  isPending: boolean;
}): ChangeOrderButtonState {
  return getSaveCommercialDraftButtonState({
    ...input,
    commercialChanged: input.hasPendingChanges,
  });
}

export function getSaveCommercialDraftButtonState(input: {
  permissions: ChangeOrderPermissions;
  pageBlocked: boolean;
  selectedRevision: ChangeOrderRevisionSnapshot | null;
  draftCommercialValid: boolean;
  mixedEditBlocked: boolean;
  mixedEditMessage: string | null;
  commercialChanged: boolean;
  isPending: boolean;
}): ChangeOrderButtonState {
  if (input.pageBlocked) {
    return { disabled: true, reason: "Change Orders are blocked for this job." };
  }
  if (input.isPending) {
    return { disabled: true, reason: "Updating draft…" };
  }
  if (!input.selectedRevision) {
    return { disabled: true, reason: "Select a Change Order to update." };
  }
  const editable = canEditChangeOrderDraft(input.selectedRevision.status);
  if (!editable.ok) {
    return { disabled: true, reason: editable.error };
  }
  if (!input.permissions.canCreateDraft) {
    return {
      disabled: true,
      reason: input.permissions.createDraftError ?? "You cannot update Change Order drafts.",
    };
  }
  if (input.mixedEditBlocked) {
    return {
      disabled: true,
      reason: input.mixedEditMessage ?? "Save commercial and execution changes separately.",
    };
  }
  if (!input.commercialChanged) {
    return { disabled: true, reason: "No commercial changes to save." };
  }
  if (!input.draftCommercialValid) {
    return { disabled: true, reason: "Complete commercial changes before saving." };
  }
  return { disabled: false, reason: null };
}

export function getSaveExecutionImpactButtonState(input: {
  permissions: ChangeOrderPermissions;
  pageBlocked: boolean;
  selectedRevision: ChangeOrderRevisionSnapshot | null;
  mixedEditBlocked: boolean;
  mixedEditMessage: string | null;
  executionChanged: boolean;
  executionComposerEditable: boolean;
  isPending: boolean;
}): ChangeOrderButtonState {
  if (input.pageBlocked) {
    return { disabled: true, reason: "Change Orders are blocked for this job." };
  }
  if (input.isPending) {
    return { disabled: true, reason: "Saving execution impact…" };
  }
  if (!input.selectedRevision) {
    return { disabled: true, reason: "Select a Change Order to save work impact." };
  }
  const editable = canEditChangeOrderDraft(input.selectedRevision.status);
  if (!editable.ok) {
    return { disabled: true, reason: editable.error };
  }
  if (!input.executionComposerEditable) {
    return { disabled: true, reason: "Work impact is read-only for this Change Order." };
  }
  if (!input.permissions.canCreateDraft) {
    return {
      disabled: true,
      reason: input.permissions.createDraftError ?? "You cannot update Change Order drafts.",
    };
  }
  if (input.mixedEditBlocked) {
    return {
      disabled: true,
      reason: input.mixedEditMessage ?? "Save commercial and execution changes separately.",
    };
  }
  if (!input.executionChanged) {
    return { disabled: true, reason: "No work impact changes to save." };
  }
  return { disabled: false, reason: null };
}

export function getApplyButtonState(input: {
  permissions: ChangeOrderPermissions;
  pageBlocked: boolean;
  selectedRevision: ChangeOrderRevisionSnapshot | null;
  jobPlanVersion: number;
  expectedJobPlanVersion: number;
  executionValidationOk: boolean;
  applicationStatus?: ChangeOrderApplicationStatus;
  isPending: boolean;
}): ChangeOrderButtonState {
  if (input.pageBlocked) {
    return { disabled: true, reason: "Change Orders are blocked for this job." };
  }
  if (input.isPending) {
    return { disabled: true, reason: "Applying change order…" };
  }
  if (!input.selectedRevision) {
    return { disabled: true, reason: "Select an accepted Change Order to apply." };
  }
  if (input.selectedRevision.status !== ChangeOrderStatus.ACCEPTED) {
    return { disabled: true, reason: "Only accepted Change Orders can be applied." };
  }
  if (input.applicationStatus === ChangeOrderApplicationStatus.APPLY_FAILED) {
    return {
      disabled: true,
      reason: "Apply failed. Review execution impact before retrying.",
    };
  }
  if (input.applicationStatus === ChangeOrderApplicationStatus.NEEDS_EXECUTION_REVIEW) {
    return {
      disabled: true,
      reason: "Execution review required before apply.",
    };
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
  if (!input.executionValidationOk) {
    return {
      disabled: true,
      reason: "Execution impact must pass validation before apply.",
    };
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

export function deriveExecutionCoverageWarning(input: {
  lines: ChangeOrderLineDraft[];
  scopeItems: ChangeOrderScopeItemSnapshot[];
}): string | null {
  const hasExecutionRelevantChange = input.lines.some(
    (line) => line.executionRelevant !== false,
  );
  if (!hasExecutionRelevantChange) return null;
  return "Execution-relevant scope changes may require task coverage before apply.";
}

export function deriveChangeOrderReadiness(input: {
  permissions: ChangeOrderPermissions;
  pageBlocked: boolean;
  draftLines: ChangeOrderLineDraft[];
  reasoning: string;
  activeScopeItems: ChangeOrderScopeItemSnapshot[];
  selectedRevision: ChangeOrderRevisionSnapshot | null;
  jobPlanVersion: number;
  expectedJobPlanVersion: number;
  isPending: boolean;
  baselineReasoning?: string;
  baselineLines?: ChangeOrderLineDraft[];
  baselineExecutionProposal?: import("@/lib/change-order/execution-delta-schema").ChangeOrderExecutionDeltaProposal | null;
  currentExecutionProposal?: import("@/lib/change-order/execution-delta-schema").ChangeOrderExecutionDeltaProposal | null;
  executionComposerEditable?: boolean;
}): ChangeOrderReadiness {
  const activeScopeItemIds = new Set(input.activeScopeItems.map((item) => item.id));
  const draftValidation = validateChangeOrderDraftInput({
    reasoning: input.reasoning,
    lines: input.draftLines,
    activeScopeItemIds,
    activeScopeItems: input.activeScopeItems,
  });

  const draftImpact = draftValidation.ok
    ? deriveChangeOrderImpactPreview({
        lines: input.draftLines,
        priceDeltaCents: draftValidation.priceDeltaCents,
        scopeItems: input.activeScopeItems,
      })
    : deriveChangeOrderImpactPreview({
        lines: input.draftLines,
        priceDeltaCents: input.draftLines.reduce(
          (sum, line) => sum + (line.priceDeltaCents ?? 0),
          0,
        ),
        scopeItems: input.activeScopeItems,
      });

  const selectedImpact = input.selectedRevision
    ? deriveChangeOrderImpactPreview({
        lines: input.selectedRevision.lines,
        priceDeltaCents: input.selectedRevision.priceDeltaCents,
        scopeItems: input.activeScopeItems,
      })
    : draftImpact;

  const executionImpact = input.selectedRevision?.executionImpact ?? null;
  const executionValidationOk = executionImpact?.validationOk ?? false;
  const hasGeneratedTaskSuggestions = executionImpact
    ? executionImpactHasGeneratedTaskSuggestions(executionImpact)
    : false;
  const selectedCommercialValid = input.selectedRevision
    ? validateChangeOrderDraftInput({
        reasoning: input.selectedRevision.reasoning,
        lines: input.selectedRevision.lines,
        activeScopeItemIds,
        activeScopeItems: input.activeScopeItems,
      }).ok
    : false;

  const lifecycleReadiness = input.selectedRevision
    ? deriveChangeOrderLifecycleReadiness({
        status: input.selectedRevision.status,
        applicationStatus:
          input.selectedRevision.applicationStatus ?? ChangeOrderApplicationStatus.NOT_APPLIED,
        draftCommercialValid: selectedCommercialValid,
        executionValidationOk,
        hasGeneratedTaskSuggestions,
        stalePlan: executionImpact?.stalePlan ?? false,
      })
    : draftValidation.ok
      ? deriveChangeOrderLifecycleReadiness({
          status: ChangeOrderStatus.DRAFT,
          applicationStatus: ChangeOrderApplicationStatus.NOT_APPLIED,
          draftCommercialValid: true,
          executionValidationOk: false,
          hasGeneratedTaskSuggestions: false,
          stalePlan: false,
        })
      : deriveChangeOrderLifecycleReadiness({
          status: ChangeOrderStatus.DRAFT,
          applicationStatus: ChangeOrderApplicationStatus.NOT_APPLIED,
          draftCommercialValid: false,
          executionValidationOk: false,
          hasGeneratedTaskSuggestions: false,
          stalePlan: false,
        });

  const applyErrorSummary = input.selectedRevision?.lastApplyErrorJson
    ? parseApplyErrorSummary(input.selectedRevision.lastApplyErrorJson)
    : null;

  const isEditable = input.selectedRevision
    ? canEditChangeOrderDraft(input.selectedRevision.status).ok
    : false;

  const commercialChanged =
    input.selectedRevision &&
    input.baselineReasoning != null &&
    input.baselineLines != null
      ? commercialDraftChanged({
          baselineReasoning: input.baselineReasoning,
          baselineLines: input.baselineLines,
          reasoning: input.reasoning,
          lines: input.draftLines,
        })
      : false;

  const executionChanged =
    input.baselineExecutionProposal !== undefined
      ? executionDraftChanged({
          baselineProposal: input.baselineExecutionProposal ?? null,
          proposal: input.currentExecutionProposal ?? null,
        })
      : false;

  const saveIntent = resolveDraftUpdateSaveIntent({
    commercialChanged,
    executionChanged,
  });
  const mixedEditBlocked = saveIntent.kind === "blocked_mixed";
  const mixedEditMessage = saveIntent.kind === "blocked_mixed" ? saveIntent.message : null;
  const unsavedDraftChangesReason = getUnsavedDraftChangesReason({
    commercialChanged,
    executionChanged,
  });

  return {
    impact: input.selectedRevision ? selectedImpact : draftImpact,
    createDraft: getCreateDraftButtonState({
      permissions: input.permissions,
      pageBlocked: input.pageBlocked,
      draftLines: input.draftLines,
      reasoning: input.reasoning,
      activeScopeItemIds,
      activeScopeItems: input.activeScopeItems,
      isPending: input.isPending,
    }),
    updateDraft: getSaveCommercialDraftButtonState({
      permissions: input.permissions,
      pageBlocked: input.pageBlocked,
      selectedRevision: input.selectedRevision,
      draftCommercialValid: draftValidation.ok,
      mixedEditBlocked,
      mixedEditMessage,
      commercialChanged,
      isPending: input.isPending,
    }),
    saveCommercial: getSaveCommercialDraftButtonState({
      permissions: input.permissions,
      pageBlocked: input.pageBlocked,
      selectedRevision: input.selectedRevision,
      draftCommercialValid: draftValidation.ok,
      mixedEditBlocked,
      mixedEditMessage,
      commercialChanged,
      isPending: input.isPending,
    }),
    saveExecutionImpact: getSaveExecutionImpactButtonState({
      permissions: input.permissions,
      pageBlocked: input.pageBlocked,
      selectedRevision: input.selectedRevision,
      mixedEditBlocked,
      mixedEditMessage,
      executionChanged,
      executionComposerEditable: input.executionComposerEditable ?? false,
      isPending: input.isPending,
    }),
    send: getSendChangeOrderButtonState({
      permissions: input.permissions,
      pageBlocked: input.pageBlocked,
      selectedRevision: input.selectedRevision,
      executionValidationOk,
      hasGeneratedTaskSuggestions,
      hasUnsavedDraftChanges: commercialChanged || executionChanged,
      unsavedDraftChangesReason,
      isPending: input.isPending,
    }),
    staffAccept: getStaffAcceptButtonState({
      permissions: input.permissions,
      pageBlocked: input.pageBlocked,
      selectedRevision: input.selectedRevision,
      isPending: input.isPending,
    }),
    apply: getApplyButtonState({
      permissions: input.permissions,
      pageBlocked: input.pageBlocked,
      selectedRevision: input.selectedRevision,
      jobPlanVersion: input.jobPlanVersion,
      expectedJobPlanVersion: input.expectedJobPlanVersion,
      executionValidationOk,
      applicationStatus: input.selectedRevision?.applicationStatus,
      isPending: input.isPending,
    }),
    executionCoverageWarning: deriveExecutionCoverageWarning({
      lines: input.selectedRevision?.lines ?? input.draftLines,
      scopeItems: input.activeScopeItems,
    }),
    jobPlanVersion: input.jobPlanVersion,
    expectedJobPlanVersion: input.expectedJobPlanVersion,
    selectedRevisionStatus: input.selectedRevision?.status ?? null,
    lifecycleReadiness,
    lifecycleReadinessLabel: changeOrderLifecycleReadinessLabel(lifecycleReadiness),
    applyErrorSummary,
    requiresCustomerApproval: input.selectedRevision
      ? changeOrderRequiresCustomerPriceApproval(input.selectedRevision.priceDeltaCents)
      : draftValidation.ok
        ? changeOrderRequiresCustomerPriceApproval(draftValidation.priceDeltaCents)
        : false,
    isEditable,
    officeNextStep: deriveChangeOrderOfficeNextStep({
      lifecycleReadiness,
      requiresCustomerApproval: input.selectedRevision
        ? changeOrderRequiresCustomerPriceApproval(input.selectedRevision.priceDeltaCents)
        : false,
    }),
    mixedEditBlocked,
    mixedEditMessage,
    commercialChanged,
    executionChanged,
    unsavedDraftChangesReason,
  };
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

export function parseDollarInputToCents(value: string): number {
  const normalized = value.replace(/[^0-9.-]/g, "");
  if (!normalized) return 0;
  const parsed = Number.parseFloat(normalized);
  if (Number.isNaN(parsed)) return 0;
  return Math.round(parsed * 100);
}

export function formatCentsAsDollarInput(cents: number | null | undefined): string {
  if (cents == null) return "0.00";
  return (cents / 100).toFixed(2);
}
