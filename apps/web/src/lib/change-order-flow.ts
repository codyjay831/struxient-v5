import {
  ChangeOrderLineOperation,
  ChangeOrderStatus,
  JobScopeItemStatus,
  JobStatus,
  StaffRole,
} from "@prisma/client";
import {
  assertExecutionPlanPermission,
} from "@/lib/execution-plan-permissions";
import { validateScopeRevisionPaymentImpact } from "@/lib/quote-scope-revision-payment-policy";

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
  approve: ChangeOrderButtonState;
  apply: ChangeOrderButtonState;
  executionCoverageWarning: string | null;
  jobPlanVersion: number;
  expectedJobPlanVersion: number;
  selectedRevisionStatus: ChangeOrderStatus | null;
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
  if (input.selectedRevision.status !== ChangeOrderStatus.DRAFT) {
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
  if (input.selectedRevision.status !== ChangeOrderStatus.ACCEPTED) {
    return { disabled: true, reason: "Only accepted Change Orders can be applied." };
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
    approve: getApproveButtonState({
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
      isPending: input.isPending,
    }),
    executionCoverageWarning: deriveExecutionCoverageWarning({
      lines: input.selectedRevision?.lines ?? input.draftLines,
      scopeItems: input.activeScopeItems,
    }),
    jobPlanVersion: input.jobPlanVersion,
    expectedJobPlanVersion: input.expectedJobPlanVersion,
    selectedRevisionStatus: input.selectedRevision?.status ?? null,
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
