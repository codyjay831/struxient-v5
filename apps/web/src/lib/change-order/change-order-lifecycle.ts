import {
  ChangeOrderApplicationStatus,
  ChangeOrderCheckpointKind,
  ChangeOrderCheckpointSource,
  ChangeOrderLineOperation,
  ChangeOrderStatus,
  ExecutionPlanRevisionKind,
  ExecutionPlanRevisionStatus,
  JobActivityType,
  Prisma,
  StaffRole,
} from "@prisma/client";
import { db } from "@/lib/db";
import { recordJobActivity } from "@/lib/job-activity-helper";
import { assertExecutionPlanPermission } from "@/lib/execution-plan-permissions";
import { buildDefaultExecutionDeltaFromChangeOrderLines } from "@/lib/change-order/execution-delta-build";
import { parseNoWorkImpactConfirmed } from "@/lib/change-order/execution-delta-no-work-impact";
import {
  canEditChangeOrderDraft,
  canStaffAcceptChangeOrder,
  changeOrderRequiresCustomerPriceApproval,
} from "@/lib/change-order/change-order-commercial-rules";
import {
  changeOrderExecutionDeltaToJson,
  parseChangeOrderExecutionDelta,
  type ChangeOrderExecutionDeltaProposal,
} from "@/lib/change-order/execution-delta-schema";
import {
  changeOrderPaymentImpactToJson,
  parseChangeOrderPaymentImpact,
} from "@/lib/change-order/payment-impact-schema";
import { validateChangeOrderPaymentImpactGate } from "@/lib/change-order/payment-impact-gates";
import {
  deriveChangeOrderSendBlockers,
  getSendChangeOrderButtonStateFromBlockers,
} from "@/lib/change-order/change-order-send-readiness";
import {
  deriveChangeOrderCustomerAcceptReadiness,
  getPrimaryCustomerAcceptBlocker,
} from "@/lib/change-order/change-order-customer-accept-readiness";
import {
  projectChangeOrderExecutionImpact,
} from "@/lib/change-order/change-order-execution-projection";
import { deriveChangeOrderPermissions } from "@/lib/change-order-flow";
import {
  loadJobPaymentRequirementsForMaterializer,
  materializeChangeOrderPaymentImpactInTx,
  validatePaymentImpactForMaterialization,
} from "@/lib/change-order/payment-impact-materializer";
import {
  classifyValidationFailureForApplicationStatus,
  validateChangeOrderExecutionDelta,
} from "@/lib/change-order/execution-delta-validation";
import { applyChangeOrderExecutionDeltaInTx } from "@/lib/change-order/execution-delta-apply";
import { executionDeltaHasUnreviewedGeneratedTasks } from "@/lib/change-order/change-order-execution-task-composer";
import {
  buildDefaultExecutionDeltaFromPersistLines,
  resolveExecutionDeltaForChangeOrderPersist,
  toExecutionLineSnapshot,
} from "@/lib/change-order/change-order-execution-delta-persist";
import {
  CHANGE_ORDER_CHECKPOINT_SNAPSHOT_SCHEMA_VERSION,
  changeOrderRowToCustomerPreviewDocument,
  changeOrderSelectForCustomerCheckpoint,
  serializeChangeOrderPreviewDocumentForCheckpoint,
} from "@/lib/change-order-checkpoint-snapshot";

export type ChangeOrderActor = {
  userId: string;
  organizationId: string;
  role: StaffRole;
};

export type ChangeOrderLineInput = {
  operation: ChangeOrderLineOperation;
  sourceJobScopeItemId?: string | null;
  description: string;
  quantity: string;
  unitPriceCents?: number | null;
  priceDeltaCents?: number | null;
  executionRelevant?: boolean;
  scopeDataJson?: unknown;
};

export type CreateChangeOrderDraftInput = {
  quoteId: string;
  jobId: string;
  reasoning: string;
  title?: string;
  customerDocumentTitle?: string | null;
  priceDeltaCents?: number;
  lines: ChangeOrderLineInput[];
  paymentImpactJson?: Record<string, unknown> | null;
};

export type UpdateChangeOrderDraftInput = {
  changeOrderId: string;
  reasoning?: string;
  title?: string;
  customerDocumentTitle?: string | null;
  priceDeltaCents?: number;
  lines?: ChangeOrderLineInput[];
  executionDeltaJson?: Record<string, unknown> | null;
  paymentImpactJson?: Record<string, unknown> | null;
};

type ChangeOrderMutationResult = { ok: true; changeOrderId: string } | { ok: false; error: string };

type ChangeOrderApplyResult =
  | {
      ok: true;
      changeOrderId: string;
      executionPlanRevisionId: string;
      resultingJobPlanVersion: number;
      quoteId: string;
      jobId: string;
    }
  | { ok: false; error: string };

function applyErrorJson(params: {
  classification: string;
  errors: string[];
  jobPlanVersion?: number;
  baseJobPlanVersion?: number;
}) {
  return {
    classification: params.classification,
    errors: params.errors,
    jobPlanVersion: params.jobPlanVersion,
    baseJobPlanVersion: params.baseJobPlanVersion,
    recordedAt: new Date().toISOString(),
  } satisfies Prisma.InputJsonObject;
}

function formatChangeOrderNumber(number: number): string {
  return `CO-${String(number).padStart(3, "0")}`;
}

async function loadJobGraphForValidation(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  params: { jobId: string; organizationId: string },
) {
  return tx.job.findFirst({
    where: { id: params.jobId, organizationId: params.organizationId },
    select: {
      id: true,
      jobPlanVersion: true,
      scopeItems: {
        select: { id: true, executionRelevant: true, status: true },
      },
      tasks: {
        select: {
          id: true,
          status: true,
          hardSignal: true,
          requiresSignals: true,
          providesSignals: true,
          scopes: { select: { jobScopeItemId: true } },
        },
      },
    },
  });
}

export async function validateStoredExecutionDeltaForChangeOrder(
  changeOrderId: string,
  organizationId: string,
) {
  const changeOrder = await db.changeOrder.findFirst({
    where: { id: changeOrderId, organizationId },
    select: {
      id: true,
      baseJobPlanVersion: true,
      executionDeltaJson: true,
      priceDeltaCents: true,
      paymentImpactJson: true,
      job: {
        select: {
          jobPlanVersion: true,
          scopeItems: {
            select: { id: true, executionRelevant: true, status: true },
          },
          tasks: {
            select: {
              id: true,
              status: true,
              hardSignal: true,
              requiresSignals: true,
              providesSignals: true,
              scopes: { select: { jobScopeItemId: true } },
            },
          },
        },
      },
    },
  });
  if (!changeOrder) {
    return { ok: false as const, error: "Change Order not found." };
  }
  const validation = validateChangeOrderExecutionDelta({
    rawDelta: changeOrder.executionDeltaJson,
    baseJobPlanVersion: changeOrder.baseJobPlanVersion,
    currentJobPlanVersion: changeOrder.job.jobPlanVersion,
    priceDeltaCents: changeOrder.priceDeltaCents,
    paymentImpactJson: changeOrder.paymentImpactJson,
    allowMissingPaymentImpactForDraft: true,
    scopeItems: changeOrder.job.scopeItems,
    tasks: changeOrder.job.tasks.map((task) => ({
      id: task.id,
      status: task.status,
      hardSignal: task.hardSignal,
      requiresSignals: task.requiresSignals,
      providesSignals: task.providesSignals,
      jobScopeItemIds: task.scopes.map((scope) => scope.jobScopeItemId),
    })),
  });
  if (!validation.ok) {
    return {
      ok: false as const,
      error: validation.errors.join(" "),
    };
  }
  return { ok: true as const };
}

export async function validateStoredPaymentImpactForChangeOrder(
  changeOrderId: string,
  organizationId: string,
) {
  const changeOrder = await db.changeOrder.findFirst({
    where: { id: changeOrderId, organizationId },
    select: {
      priceDeltaCents: true,
      paymentImpactJson: true,
    },
  });
  if (!changeOrder) {
    return { ok: false as const, error: "Change Order not found." };
  }
  const gate = validateChangeOrderPaymentImpactGate({
    priceDeltaCents: changeOrder.priceDeltaCents,
    paymentImpactJson: changeOrder.paymentImpactJson,
  });
  if (!gate.ok) {
    return { ok: false as const, error: gate.error };
  }
  return { ok: true as const };
}

export async function validateChangeOrderSendReadinessForStored(
  changeOrderId: string,
  organizationId: string,
  role: StaffRole,
) {
  const changeOrder = await db.changeOrder.findFirst({
    where: { id: changeOrderId, organizationId },
    select: {
      id: true,
      status: true,
      reasoning: true,
      priceDeltaCents: true,
      paymentImpactJson: true,
      executionDeltaJson: true,
      baseJobPlanVersion: true,
      lines: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          operation: true,
          sourceJobScopeItemId: true,
          description: true,
          quantity: true,
          unitPriceCents: true,
          priceDeltaCents: true,
          executionRelevant: true,
        },
      },
      job: {
        select: {
          jobPlanVersion: true,
          scopeItems: {
            select: {
              id: true,
              description: true,
              executionRelevant: true,
              status: true,
            },
          },
          tasks: {
            select: {
              id: true,
              title: true,
              status: true,
              hardSignal: true,
              requiresSignals: true,
              providesSignals: true,
              scopes: { select: { jobScopeItemId: true } },
            },
          },
        },
      },
    },
  });
  if (!changeOrder) {
    return { ok: false as const, error: "Change Order not found." };
  }

  const paymentGate = validateChangeOrderPaymentImpactGate({
    priceDeltaCents: changeOrder.priceDeltaCents,
    paymentImpactJson: changeOrder.paymentImpactJson,
  });

  const executionImpact = projectChangeOrderExecutionImpact({
    executionDeltaJson: changeOrder.executionDeltaJson,
    baseJobPlanVersion: changeOrder.baseJobPlanVersion,
    currentJobPlanVersion: changeOrder.job.jobPlanVersion,
    priceDeltaCents: changeOrder.priceDeltaCents,
    paymentImpactJson: changeOrder.paymentImpactJson,
    scopeItems: changeOrder.job.scopeItems,
    tasks: changeOrder.job.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      scopeItemIds: task.scopes.map((scope) => scope.jobScopeItemId),
    })),
  });

  const permissions = deriveChangeOrderPermissions(role);
  const blockers = deriveChangeOrderSendBlockers({
    permissions,
    pageBlocked: false,
    isPending: false,
    selectedRevision: {
      id: changeOrder.id,
      status: changeOrder.status,
      reasoning: changeOrder.reasoning,
      priceDeltaCents: changeOrder.priceDeltaCents,
      lines: changeOrder.lines.map((line) => ({
        operation: line.operation,
        sourceJobScopeItemId: line.sourceJobScopeItemId,
        description: line.description,
        quantity: line.quantity.toString(),
        unitPriceCents: line.unitPriceCents,
        priceDeltaCents: line.priceDeltaCents,
        executionRelevant: line.executionRelevant,
      })),
      paymentImpactJson: changeOrder.paymentImpactJson,
      executionImpact,
    },
    executionImpact,
    hasUnsavedDraftChanges: false,
    unsavedDraftChangesReason: null,
    paymentImpactReady: paymentGate.ok,
    paymentImpactBlockReason: paymentGate.ok ? null : paymentGate.error,
  });

  const sendState = getSendChangeOrderButtonStateFromBlockers({ blockers });
  if (sendState.disabled) {
    return { ok: false as const, error: sendState.reason ?? "Change Order is not ready to send." };
  }

  const customerAcceptReady = deriveChangeOrderCustomerAcceptReadiness({
    status: changeOrder.status,
    priceDeltaCents: changeOrder.priceDeltaCents,
    paymentImpactJson: changeOrder.paymentImpactJson,
    executionDeltaJson: changeOrder.executionDeltaJson,
    baseJobPlanVersion: changeOrder.baseJobPlanVersion,
    currentJobPlanVersion: changeOrder.job.jobPlanVersion,
    scopeItems: changeOrder.job.scopeItems,
    tasks: changeOrder.job.tasks.map((task) => ({
      id: task.id,
      status: task.status,
      hardSignal: task.hardSignal,
      requiresSignals: task.requiresSignals,
      providesSignals: task.providesSignals,
      jobScopeItemIds: task.scopes.map((scope) => scope.jobScopeItemId),
    })),
    requireSentStatus: false,
  });
  if (!customerAcceptReady.canAccept) {
    const primary = getPrimaryCustomerAcceptBlocker(customerAcceptReady);
    return {
      ok: false as const,
      error: primary?.staffMessage ?? "Change Order is not ready to send.",
    };
  }

  return { ok: true as const };
}

function resolvePaymentImpactJsonForPersist(params: {
  priceDeltaCents: number;
  paymentImpactJson: unknown;
}):
  | { ok: true; value: Prisma.InputJsonValue | typeof Prisma.JsonNull }
  | { ok: false; error: string } {
  const gate = validateChangeOrderPaymentImpactGate(params);
  if (!gate.ok) {
    return { ok: false, error: gate.error };
  }
  if (gate.impact == null) {
    return { ok: true, value: Prisma.JsonNull };
  }
  return {
    ok: true,
    value: changeOrderPaymentImpactToJson(gate.impact) as Prisma.InputJsonValue,
  };
}

async function replaceChangeOrderLinesInTx(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  params: {
    organizationId: string;
    changeOrderId: string;
    lines: ChangeOrderLineInput[];
  },
) {
  await tx.changeOrderLine.deleteMany({
    where: { changeOrderId: params.changeOrderId, organizationId: params.organizationId },
  });

  const createdLines = [];
  for (const line of params.lines) {
    const createdLine = await tx.changeOrderLine.create({
      data: {
        organizationId: params.organizationId,
        changeOrderId: params.changeOrderId,
        operation: line.operation,
        sourceJobScopeItemId: line.sourceJobScopeItemId ?? null,
        description: line.description,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents ?? null,
        priceDeltaCents: line.priceDeltaCents ?? null,
        executionRelevant: line.executionRelevant ?? true,
        scopeDataJson:
          line.scopeDataJson == null
            ? Prisma.JsonNull
            : (line.scopeDataJson as Prisma.InputJsonValue),
      },
      select: {
        id: true,
        operation: true,
        sourceJobScopeItemId: true,
        description: true,
        quantity: true,
        unitPriceCents: true,
        priceDeltaCents: true,
        executionRelevant: true,
      },
    });
    createdLines.push(createdLine);
  }
  return createdLines;
}

async function persistExecutionDeltaForChangeOrderInTx(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  params: {
    organizationId: string;
    quoteId: string;
    jobId: string;
    changeOrderId: string;
    changeOrderNumber: number;
    baseJobPlanVersion: number;
    priceDeltaCents: number;
    reasoning: string;
    lines: Awaited<ReturnType<typeof replaceChangeOrderLinesInTx>>;
    executionDeltaOverride?: ChangeOrderExecutionDeltaProposal | null;
    storedExecutionDeltaJson?: unknown;
    previousLines?: ReturnType<typeof toExecutionLineSnapshot>[];
    paymentImpactJson?: unknown;
  },
) {
  let executionDelta: ChangeOrderExecutionDeltaProposal;
  const paymentImpactGate = validateChangeOrderPaymentImpactGate({
    priceDeltaCents: params.priceDeltaCents,
    paymentImpactJson: params.paymentImpactJson ?? null,
  });
  const skipLegacyPaymentOperation =
    params.paymentImpactJson == null ||
    (paymentImpactGate.ok && paymentImpactGate.impact != null);

  const buildDefault = () =>
    buildDefaultExecutionDeltaFromPersistLines({
      baseJobPlanVersion: params.baseJobPlanVersion,
      changeOrderId: params.changeOrderId,
      changeOrderNumber: params.changeOrderNumber,
      priceDeltaCents: params.priceDeltaCents,
      reasoning: params.reasoning,
      lines: params.lines,
      skipLegacyPaymentOperation,
    });

  if (params.executionDeltaOverride !== undefined) {
    if (params.executionDeltaOverride === null) {
      executionDelta = buildDefault();
    } else {
      if (params.executionDeltaOverride.baseJobPlanVersion !== params.baseJobPlanVersion) {
        throw new Error(
          "Execution delta baseJobPlanVersion must match the Change Order base plan version.",
        );
      }
      executionDelta = params.executionDeltaOverride;
    }
  } else {
    const resolved = resolveExecutionDeltaForChangeOrderPersist({
      executionDeltaOverride: undefined,
      storedExecutionDeltaJson: params.storedExecutionDeltaJson ?? null,
      previousLines: params.previousLines ?? [],
      nextLines: params.lines.map(toExecutionLineSnapshot),
      buildDefault,
    });
    if (!resolved.ok) {
      throw new Error(resolved.error);
    }
    if (resolved.proposal.baseJobPlanVersion !== params.baseJobPlanVersion) {
      throw new Error(
        "Execution delta baseJobPlanVersion must match the Change Order base plan version.",
      );
    }
    executionDelta = resolved.proposal;
  }

  const jobGraph = await loadJobGraphForValidation(tx, {
    jobId: params.jobId,
    organizationId: params.organizationId,
  });
  if (!jobGraph) {
    throw new Error("Job not found while validating execution delta.");
  }

  const validation = validateChangeOrderExecutionDelta({
    rawDelta: executionDelta,
    baseJobPlanVersion: params.baseJobPlanVersion,
    currentJobPlanVersion: jobGraph.jobPlanVersion,
    priceDeltaCents: params.priceDeltaCents,
    paymentImpactJson: params.paymentImpactJson ?? null,
    allowMissingPaymentImpactForDraft: true,
    scopeItems: jobGraph.scopeItems,
    tasks: jobGraph.tasks.map((task) => ({
      id: task.id,
      status: task.status,
      hardSignal: task.hardSignal,
      requiresSignals: task.requiresSignals,
      providesSignals: task.providesSignals,
      jobScopeItemIds: task.scopes.map((scope) => scope.jobScopeItemId),
    })),
  });
  if (!validation.ok) {
    throw new Error(validation.errors.join(" "));
  }

  await tx.changeOrder.update({
    where: { id: params.changeOrderId },
    data: {
      executionDeltaJson: changeOrderExecutionDeltaToJson(executionDelta),
      executionDeltaSchemaVersion: executionDelta.schemaVersion,
      applicationStatus: ChangeOrderApplicationStatus.NOT_APPLIED,
      lastApplyErrorJson: Prisma.JsonNull,
    },
  });

  await tx.executionPlanRevision.updateMany({
    where: {
      organizationId: params.organizationId,
      changeOrderId: params.changeOrderId,
      kind: ExecutionPlanRevisionKind.JOB_EXECUTION_DELTA,
      status: { in: [ExecutionPlanRevisionStatus.DRAFT, ExecutionPlanRevisionStatus.ACCEPTED] },
    },
    data: {
      status: ExecutionPlanRevisionStatus.DRAFT,
      proposalJson: changeOrderExecutionDeltaToJson(executionDelta) as Prisma.InputJsonValue,
      proposalSchemaVersion: executionDelta.schemaVersion,
      basePlanVersion: params.baseJobPlanVersion,
    },
  });

  const existingRevision = await tx.executionPlanRevision.findFirst({
    where: {
      organizationId: params.organizationId,
      changeOrderId: params.changeOrderId,
      kind: ExecutionPlanRevisionKind.JOB_EXECUTION_DELTA,
    },
    select: { id: true },
  });
  if (!existingRevision) {
    await tx.executionPlanRevision.create({
      data: {
        organizationId: params.organizationId,
        quoteId: params.quoteId,
        jobId: params.jobId,
        changeOrderId: params.changeOrderId,
        kind: ExecutionPlanRevisionKind.JOB_EXECUTION_DELTA,
        status: ExecutionPlanRevisionStatus.DRAFT,
        basePlanVersion: params.baseJobPlanVersion,
        proposalJson: changeOrderExecutionDeltaToJson(executionDelta),
        proposalSchemaVersion: executionDelta.schemaVersion,
        plannerVersion: "change-order-execution-delta-v1",
        modelProviderMeta: { source: "change-order-lifecycle" },
        planningInputHash: null,
        reasoningSummary: params.reasoning,
      },
    });
  }

  return executionDelta;
}

export async function createChangeOrderDraftWithActor(
  actor: ChangeOrderActor,
  input: CreateChangeOrderDraftInput,
): Promise<ChangeOrderMutationResult> {
  const permission = assertExecutionPlanPermission(actor.role, "approve_scope_revision");
  if (!permission.ok) return { ok: false, error: permission.error };

  if (!input.reasoning.trim()) {
    return { ok: false, error: "Reasoning is required." };
  }
  if (input.lines.length === 0) {
    return { ok: false, error: "At least one Change Order line is required." };
  }

  const created = await db.$transaction(async (tx) => {
    const quote = await tx.quote.findFirst({
      where: {
        id: input.quoteId,
        organizationId: actor.organizationId,
        job: { is: { id: input.jobId } },
      },
      select: { id: true, job: { select: { id: true, jobPlanVersion: true } } },
    });
    if (!quote?.job?.id) {
      return { ok: false as const, error: "Quote/job pair not found for Change Order." };
    }

    const maxNumber = await tx.changeOrder.aggregate({
      where: {
        organizationId: actor.organizationId,
        jobId: quote.job.id,
      },
      _max: { number: true },
    });
    const nextNumber = (maxNumber._max.number ?? 0) + 1;
    const numberLabel = formatChangeOrderNumber(nextNumber);
    const defaultTitle = `Change Order ${numberLabel}`;

    const nextPriceDeltaCents = input.priceDeltaCents ?? 0;
    let paymentImpactData: Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined;
    if (input.paymentImpactJson !== undefined) {
      const resolved = resolvePaymentImpactJsonForPersist({
        priceDeltaCents: nextPriceDeltaCents,
        paymentImpactJson: input.paymentImpactJson,
      });
      if (!resolved.ok) {
        return { ok: false as const, error: resolved.error };
      }
      paymentImpactData = resolved.value;
    } else if (nextPriceDeltaCents === 0) {
      paymentImpactData = Prisma.JsonNull;
    }

    const changeOrder = await tx.changeOrder.create({
      data: {
        organizationId: actor.organizationId,
        quoteId: quote.id,
        jobId: quote.job.id,
        number: nextNumber,
        title: input.title?.trim() || defaultTitle,
        customerDocumentTitle: input.customerDocumentTitle ?? null,
        status: ChangeOrderStatus.DRAFT,
        reasoning: input.reasoning.trim(),
        priceDeltaCents: nextPriceDeltaCents,
        baseJobPlanVersion: quote.job.jobPlanVersion,
        applicationStatus: ChangeOrderApplicationStatus.NOT_APPLIED,
        ...(paymentImpactData !== undefined ? { paymentImpactJson: paymentImpactData } : {}),
      },
      select: { id: true, number: true },
    });

    const createdLines = await replaceChangeOrderLinesInTx(tx, {
      organizationId: actor.organizationId,
      changeOrderId: changeOrder.id,
      lines: input.lines,
    });

    const executionDelta = await persistExecutionDeltaForChangeOrderInTx(tx, {
      organizationId: actor.organizationId,
      quoteId: quote.id,
      jobId: quote.job.id,
      changeOrderId: changeOrder.id,
      changeOrderNumber: changeOrder.number,
      baseJobPlanVersion: quote.job.jobPlanVersion,
      priceDeltaCents: input.priceDeltaCents ?? 0,
      reasoning: input.reasoning.trim(),
      lines: createdLines,
      paymentImpactJson:
        paymentImpactData === Prisma.JsonNull ? null : (paymentImpactData ?? null),
    });

    await recordJobActivity(
      {
        organizationId: actor.organizationId,
        jobId: quote.job.id,
        type: JobActivityType.CHANGE_ORDER_CREATED,
        title: "Change Order draft created",
        details: input.reasoning.trim(),
        entityType: "ChangeOrder",
        entityId: changeOrder.id,
        actorUserId: actor.userId,
        metadataJson: {
          changeOrderId: changeOrder.id,
          baseJobPlanVersion: quote.job.jobPlanVersion,
          operationCount: executionDelta.operations.length,
        },
      },
      tx,
    );
    return { ok: true as const, changeOrderId: changeOrder.id };
  });

  return created;
}

export async function updateChangeOrderDraftWithActor(
  actor: ChangeOrderActor,
  input: UpdateChangeOrderDraftInput,
): Promise<ChangeOrderMutationResult> {
  const permission = assertExecutionPlanPermission(actor.role, "approve_scope_revision");
  if (!permission.ok) return { ok: false, error: permission.error };

  const changeOrderId = input.changeOrderId.trim();
  if (!changeOrderId) return { ok: false, error: "Missing Change Order id." };

  try {
    const updated = await db.$transaction(async (tx) => {
    const row = await tx.changeOrder.findFirst({
      where: { id: changeOrderId, organizationId: actor.organizationId },
      select: {
        id: true,
        quoteId: true,
        jobId: true,
        number: true,
        status: true,
        reasoning: true,
        title: true,
        customerDocumentTitle: true,
        priceDeltaCents: true,
        baseJobPlanVersion: true,
        paymentImpactJson: true,
        executionDeltaJson: true,
      },
    });
    if (!row) return { ok: false as const, error: "Change Order not found." };

    const editable = canEditChangeOrderDraft(row.status);
    if (!editable.ok) return { ok: false as const, error: editable.error };

    const previousLines = await tx.changeOrderLine.findMany({
      where: { changeOrderId: row.id, organizationId: actor.organizationId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        operation: true,
        sourceJobScopeItemId: true,
        description: true,
        quantity: true,
        executionRelevant: true,
      },
    });

    const nextReasoning = input.reasoning?.trim() || row.reasoning;
    if (!nextReasoning) {
      return { ok: false as const, error: "Reasoning is required." };
    }

    const nextLines = input.lines;
    if (nextLines && nextLines.length === 0) {
      return { ok: false as const, error: "At least one Change Order line is required." };
    }

    const nextPriceDeltaCents = input.priceDeltaCents ?? row.priceDeltaCents;
    let nextPaymentImpactJson: unknown = row.paymentImpactJson;
    if (input.paymentImpactJson !== undefined) {
      const resolved = resolvePaymentImpactJsonForPersist({
        priceDeltaCents: nextPriceDeltaCents,
        paymentImpactJson: input.paymentImpactJson,
      });
      if (!resolved.ok) {
        throw new Error(resolved.error);
      }
      nextPaymentImpactJson = resolved.value === Prisma.JsonNull ? null : resolved.value;
    } else if (nextPriceDeltaCents === 0) {
      nextPaymentImpactJson = null;
    }

    await tx.changeOrder.update({
      where: { id: row.id },
      data: {
        reasoning: nextReasoning,
        title: input.title?.trim() || row.title,
        customerDocumentTitle:
          input.customerDocumentTitle !== undefined
            ? input.customerDocumentTitle
            : row.customerDocumentTitle,
        priceDeltaCents: nextPriceDeltaCents,
        status:
          row.status === ChangeOrderStatus.CUSTOMER_REQUESTED_CHANGES
            ? ChangeOrderStatus.DRAFT
            : row.status,
        ...(input.paymentImpactJson !== undefined || nextPriceDeltaCents === 0
          ? {
              paymentImpactJson:
                nextPaymentImpactJson == null
                  ? Prisma.JsonNull
                  : (nextPaymentImpactJson as Prisma.InputJsonValue),
            }
          : {}),
      },
    });

    const createdLines =
      nextLines &&
      (await replaceChangeOrderLinesInTx(tx, {
        organizationId: actor.organizationId,
        changeOrderId: row.id,
        lines: nextLines,
      }));

    const linesForDelta =
      createdLines ??
      (await tx.changeOrderLine.findMany({
        where: { changeOrderId: row.id, organizationId: actor.organizationId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          operation: true,
          sourceJobScopeItemId: true,
          description: true,
          quantity: true,
          unitPriceCents: true,
          priceDeltaCents: true,
          executionRelevant: true,
        },
      }));

    const executionDeltaOverride =
      input.executionDeltaJson === undefined
        ? undefined
        : input.executionDeltaJson === null
          ? null
          : (() => {
              const parsed = parseChangeOrderExecutionDelta(input.executionDeltaJson);
              if (!parsed.ok) {
                throw new Error(parsed.errors.join(" "));
              }
              return parsed.proposal;
            })();

    const executionDelta = await persistExecutionDeltaForChangeOrderInTx(tx, {
      organizationId: actor.organizationId,
      quoteId: row.quoteId,
      jobId: row.jobId,
      changeOrderId: row.id,
      changeOrderNumber: row.number,
      baseJobPlanVersion: row.baseJobPlanVersion,
      priceDeltaCents: nextPriceDeltaCents,
      reasoning: nextReasoning,
      lines: linesForDelta,
      executionDeltaOverride,
      storedExecutionDeltaJson: row.executionDeltaJson,
      previousLines: previousLines.map(toExecutionLineSnapshot),
      paymentImpactJson: nextPaymentImpactJson,
    });

    await recordJobActivity(
      {
        organizationId: actor.organizationId,
        jobId: row.jobId,
        type: JobActivityType.CHANGE_ORDER_CREATED,
        title: "Change Order draft updated",
        details: nextReasoning,
        entityType: "ChangeOrder",
        entityId: row.id,
        actorUserId: actor.userId,
        metadataJson: {
          changeOrderId: row.id,
          updated: true,
          baseJobPlanVersion: row.baseJobPlanVersion,
          operationCount: executionDelta.operations.length,
          ...(parseNoWorkImpactConfirmed(executionDelta.meta)
            ? { noWorkImpactConfirmed: true }
            : {}),
        },
      },
      tx,
    );

    return { ok: true as const, changeOrderId: row.id };
  });

    return updated;
  } catch (error) {
    if (error instanceof Error) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: "Failed to update Change Order draft." };
  }
}

export async function markChangeOrderAcceptedWithActor(
  actor: ChangeOrderActor,
  changeOrderId: string,
): Promise<ChangeOrderMutationResult & { quoteId?: string; jobId?: string }> {
  const permission = assertExecutionPlanPermission(actor.role, "approve_scope_revision");
  if (!permission.ok) return { ok: false, error: permission.error };

  const id = changeOrderId.trim();
  if (!id) return { ok: false, error: "Missing Change Order id." };

  const deltaReady = await validateStoredExecutionDeltaForChangeOrder(id, actor.organizationId);
  if (!deltaReady.ok) return { ok: false, error: deltaReady.error };

  const paymentReady = await validateStoredPaymentImpactForChangeOrder(id, actor.organizationId);
  if (!paymentReady.ok) return { ok: false, error: paymentReady.error };

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.changeOrder.findFirst({
      where: { id, organizationId: actor.organizationId },
      select: {
        id: true,
        quoteId: true,
        jobId: true,
        status: true,
        priceDeltaCents: true,
        updatedAt: true,
        organization: { select: { name: true } },
      },
    });
    if (!row) return { ok: false as const, error: "Change Order not found." };

    const acceptAllowed = canStaffAcceptChangeOrder({
      status: row.status,
      priceDeltaCents: row.priceDeltaCents,
    });
    if (!acceptAllowed.ok) return { ok: false as const, error: acceptAllowed.error };

    const checkpointRow = await tx.changeOrder.findFirst({
      where: { id, organizationId: actor.organizationId },
      select: changeOrderSelectForCustomerCheckpoint,
    });
    if (!checkpointRow) return { ok: false as const, error: "Change Order not found." };
    const document = changeOrderRowToCustomerPreviewDocument(
      checkpointRow,
      row.organization.name,
    );
    const parsedPaymentImpact = parseChangeOrderPaymentImpact(checkpointRow.paymentImpactJson);
    const aggregate = await tx.changeOrderCheckpoint.aggregate({
      where: {
        organizationId: actor.organizationId,
        changeOrderId: id,
        kind: ChangeOrderCheckpointKind.ACCEPTANCE,
      },
      _max: { sequence: true },
    });

    await tx.changeOrderCheckpoint.create({
      data: {
        organizationId: actor.organizationId,
        changeOrderId: id,
        kind: ChangeOrderCheckpointKind.ACCEPTANCE,
        source: ChangeOrderCheckpointSource.STAFF,
        sequence: (aggregate._max.sequence ?? 0) + 1,
        schemaVersion: CHANGE_ORDER_CHECKPOINT_SNAPSHOT_SCHEMA_VERSION,
        snapshotJson: serializeChangeOrderPreviewDocumentForCheckpoint(
          document,
          parsedPaymentImpact.ok ? parsedPaymentImpact.impact : null,
        ) as unknown as Prisma.InputJsonValue,
        staffOnlyJson: { acceptedByUserId: actor.userId } as Prisma.InputJsonValue,
        changeOrderUpdatedAtAtCapture: row.updatedAt,
      },
    });

    await tx.changeOrder.update({
      where: { id },
      data: {
        status: ChangeOrderStatus.ACCEPTED,
        applicationStatus: ChangeOrderApplicationStatus.NOT_APPLIED,
        approvedByUserId: actor.userId,
        approvedAt: new Date(),
        acceptedAt: new Date(),
      },
    });
    await tx.executionPlanRevision.updateMany({
      where: {
        organizationId: actor.organizationId,
        changeOrderId: id,
        kind: ExecutionPlanRevisionKind.JOB_EXECUTION_DELTA,
        status: ExecutionPlanRevisionStatus.DRAFT,
      },
      data: {
        status: ExecutionPlanRevisionStatus.ACCEPTED,
        approvedByUserId: actor.userId,
      },
    });
    await recordJobActivity(
      {
        organizationId: actor.organizationId,
        jobId: row.jobId,
        type: JobActivityType.CHANGE_ORDER_ACCEPTED,
        title: "Change Order accepted",
        entityType: "ChangeOrder",
        entityId: id,
        actorUserId: actor.userId,
        metadataJson: { changeOrderId: id, source: "staff" },
      },
      tx,
    );
    return { ok: true as const, changeOrderId: id, quoteId: row.quoteId, jobId: row.jobId };
  });

  return updated;
}

function stripLegacyPaymentOperations(
  proposal: ChangeOrderExecutionDeltaProposal,
): ChangeOrderExecutionDeltaProposal {
  return {
    ...proposal,
    operations: proposal.operations.filter(
      (operation) => operation.type !== "UPDATE_PAYMENT_REQUIREMENT",
    ),
  };
}

async function recordApplyFailureInTx(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  params: {
    actor: ChangeOrderActor;
    changeOrder: {
      id: string;
      organizationId: string;
      quoteId: string;
      jobId: string;
      baseJobPlanVersion: number;
      executionDeltaJson: unknown;
      executionDeltaSchemaVersion: number;
      reasoning: string;
    };
    applicationStatus: ChangeOrderApplicationStatus;
    revisionStatus: ExecutionPlanRevisionStatus;
    activityType:
      | typeof JobActivityType.CHANGE_ORDER_NEEDS_EXECUTION_REVIEW
      | typeof JobActivityType.CHANGE_ORDER_APPLY_FAILED;
    title: string;
    details: string;
    errorJson: Prisma.InputJsonObject;
  },
) {
  const parsed = parseChangeOrderExecutionDelta(params.changeOrder.executionDeltaJson);
  const proposalJson =
    parsed.ok
      ? changeOrderExecutionDeltaToJson(parsed.proposal)
      : { raw: params.changeOrder.executionDeltaJson };
  const executionPlanRevision = await tx.executionPlanRevision.create({
    data: {
      organizationId: params.changeOrder.organizationId,
      quoteId: params.changeOrder.quoteId,
      jobId: params.changeOrder.jobId,
      changeOrderId: params.changeOrder.id,
      kind: ExecutionPlanRevisionKind.JOB_EXECUTION_DELTA,
      status: params.revisionStatus,
      basePlanVersion: params.changeOrder.baseJobPlanVersion,
      proposalJson: proposalJson as Prisma.InputJsonValue,
      proposalSchemaVersion: params.changeOrder.executionDeltaSchemaVersion,
      plannerVersion: "change-order-execution-delta-v1",
      modelProviderMeta: { source: "applyChangeOrderWithActor", errorJson: params.errorJson },
      planningInputHash: null,
      reasoningSummary: params.changeOrder.reasoning,
      approvedByUserId: params.actor.userId,
    },
    select: { id: true },
  });
  await tx.changeOrder.update({
    where: { id: params.changeOrder.id },
    data: {
      applicationStatus: params.applicationStatus,
      lastApplyErrorJson: params.errorJson,
      lastApplyAttemptAt: new Date(),
    },
  });
  await recordJobActivity(
    {
      organizationId: params.changeOrder.organizationId,
      jobId: params.changeOrder.jobId,
      type: params.activityType,
      title: params.title,
      details: params.details,
      entityType: "ChangeOrder",
      entityId: params.changeOrder.id,
      actorUserId: params.actor.userId,
      metadataJson: {
        changeOrderId: params.changeOrder.id,
        executionPlanRevisionId: executionPlanRevision.id,
        errors: params.errorJson.errors,
      },
    },
    tx,
  );
  return executionPlanRevision.id;
}

export async function applyChangeOrderWithActor(
  actor: ChangeOrderActor,
  changeOrderId: string,
  options?: {
    expectedJobPlanVersion?: number | null;
  },
): Promise<ChangeOrderApplyResult> {
  const permission = assertExecutionPlanPermission(actor.role, "apply_scope_revision");
  if (!permission.ok) return { ok: false, error: permission.error };

  const id = changeOrderId.trim();
  if (!id) return { ok: false, error: "Missing Change Order id." };

  try {
    const applied = await db.$transaction(async (tx) => {
      const changeOrder = await tx.changeOrder.findFirst({
        where: { id, organizationId: actor.organizationId },
        select: {
          id: true,
          organizationId: true,
          quoteId: true,
          jobId: true,
          status: true,
          baseJobPlanVersion: true,
          executionDeltaJson: true,
          executionDeltaSchemaVersion: true,
          priceDeltaCents: true,
          number: true,
          paymentImpactJson: true,
          reasoning: true,
        },
      });
      if (!changeOrder) {
        return { ok: false as const, error: "Change Order was not found." };
      }

      if (changeOrder.status !== ChangeOrderStatus.ACCEPTED) {
        if (
          changeOrderRequiresCustomerPriceApproval(changeOrder.priceDeltaCents) &&
          changeOrder.status !== ChangeOrderStatus.ACCEPTED
        ) {
          return {
            ok: false as const,
            error: "Price-impact Change Orders must be accepted before apply.",
          };
        }
        return { ok: false as const, error: "Only accepted Change Orders can be applied." };
      }

      if (changeOrderRequiresCustomerPriceApproval(changeOrder.priceDeltaCents)) {
        const acceptanceCheckpoint = await tx.changeOrderCheckpoint.findFirst({
          where: {
            organizationId: actor.organizationId,
            changeOrderId: changeOrder.id,
            kind: ChangeOrderCheckpointKind.ACCEPTANCE,
          },
          select: { id: true },
        });
        if (!acceptanceCheckpoint) {
          return {
            ok: false as const,
            error: "Price-impact Change Orders require an acceptance checkpoint before apply.",
          };
        }
      }

      const job = await loadJobGraphForValidation(tx, {
        jobId: changeOrder.jobId,
        organizationId: actor.organizationId,
      });
      if (!job) {
        return { ok: false as const, error: "Change Order job was not found." };
      }

      const observedJobPlanVersion = job.jobPlanVersion;
      if (
        options?.expectedJobPlanVersion != null &&
        options.expectedJobPlanVersion !== observedJobPlanVersion
      ) {
        const errorJson = applyErrorJson({
          classification: "STALE_PLAN",
          errors: ["Job plan changed. Execution review is required before apply."],
          jobPlanVersion: observedJobPlanVersion,
          baseJobPlanVersion: changeOrder.baseJobPlanVersion,
        });
        await recordApplyFailureInTx(tx, {
          actor,
          changeOrder,
          applicationStatus: ChangeOrderApplicationStatus.NEEDS_EXECUTION_REVIEW,
          revisionStatus: ExecutionPlanRevisionStatus.NEEDS_REVIEW,
          activityType: JobActivityType.CHANGE_ORDER_NEEDS_EXECUTION_REVIEW,
          title: "Change Order needs execution review",
          details: "Job plan changed before this accepted Change Order could be applied.",
          errorJson,
        });
        return {
          ok: false as const,
          error: "Job plan changed. Change Order needs execution review before apply.",
        };
      }

      const parsedExecutionDelta = parseChangeOrderExecutionDelta(changeOrder.executionDeltaJson);
      if (
        parsedExecutionDelta.ok &&
        executionDeltaHasUnreviewedGeneratedTasks(parsedExecutionDelta.proposal)
      ) {
        return {
          ok: false as const,
          error:
            "Confirm all generated task suggestions in work impact before applying this Change Order.",
        };
      }

      const validation = validateChangeOrderExecutionDelta({
        rawDelta: changeOrder.executionDeltaJson,
        baseJobPlanVersion: changeOrder.baseJobPlanVersion,
        currentJobPlanVersion: observedJobPlanVersion,
        priceDeltaCents: changeOrder.priceDeltaCents,
        paymentImpactJson: changeOrder.paymentImpactJson,
        scopeItems: job.scopeItems,
        tasks: job.tasks.map((task) => ({
          id: task.id,
          status: task.status,
          hardSignal: task.hardSignal,
          requiresSignals: task.requiresSignals,
          providesSignals: task.providesSignals,
          jobScopeItemIds: task.scopes.map((scope) => scope.jobScopeItemId),
        })),
      });
      if (!validation.ok) {
        const applicationStatus =
          classifyValidationFailureForApplicationStatus(validation.classification);
        const prismaApplicationStatus =
          applicationStatus === "NEEDS_EXECUTION_REVIEW"
            ? ChangeOrderApplicationStatus.NEEDS_EXECUTION_REVIEW
            : ChangeOrderApplicationStatus.APPLY_FAILED;
        const revisionStatus =
          applicationStatus === "NEEDS_EXECUTION_REVIEW"
            ? ExecutionPlanRevisionStatus.NEEDS_REVIEW
            : ExecutionPlanRevisionStatus.APPLY_FAILED;
        const errorJson = applyErrorJson({
          classification: validation.classification,
          errors: validation.errors,
          jobPlanVersion: observedJobPlanVersion,
          baseJobPlanVersion: changeOrder.baseJobPlanVersion,
        });
        await recordApplyFailureInTx(tx, {
          actor,
          changeOrder,
          applicationStatus: prismaApplicationStatus,
          revisionStatus,
          activityType:
            prismaApplicationStatus === ChangeOrderApplicationStatus.NEEDS_EXECUTION_REVIEW
              ? JobActivityType.CHANGE_ORDER_NEEDS_EXECUTION_REVIEW
              : JobActivityType.CHANGE_ORDER_APPLY_FAILED,
          title:
            prismaApplicationStatus === ChangeOrderApplicationStatus.NEEDS_EXECUTION_REVIEW
              ? "Change Order needs execution review"
              : "Change Order apply failed",
          details: validation.errors.join(" "),
          errorJson,
        });
        return { ok: false as const, error: validation.errors.join(" ") };
      }

      const paymentRequirements = await loadJobPaymentRequirementsForMaterializer(tx, {
        organizationId: changeOrder.organizationId,
        jobId: changeOrder.jobId,
        quoteId: changeOrder.quoteId,
      });
      const paymentMaterializationValidation = validatePaymentImpactForMaterialization({
        priceDeltaCents: changeOrder.priceDeltaCents,
        paymentImpactJson: changeOrder.paymentImpactJson,
        requirements: paymentRequirements,
      });
      if (!paymentMaterializationValidation.ok) {
        const errorJson = applyErrorJson({
          classification: "INVARIANT_FAILED",
          errors: paymentMaterializationValidation.errors,
          jobPlanVersion: observedJobPlanVersion,
          baseJobPlanVersion: changeOrder.baseJobPlanVersion,
        });
        await recordApplyFailureInTx(tx, {
          actor,
          changeOrder,
          applicationStatus: ChangeOrderApplicationStatus.APPLY_FAILED,
          revisionStatus: ExecutionPlanRevisionStatus.APPLY_FAILED,
          activityType: JobActivityType.CHANGE_ORDER_APPLY_FAILED,
          title: "Change Order apply failed",
          details: paymentMaterializationValidation.errors.join(" "),
          errorJson,
        });
        return {
          ok: false as const,
          error: paymentMaterializationValidation.errors.join(" "),
        };
      }

      const executionProposal =
        paymentMaterializationValidation.impact != null
          ? stripLegacyPaymentOperations(validation.proposal)
          : validation.proposal;

      const versionClaim = await tx.job.updateMany({
        where: {
          id: changeOrder.jobId,
          organizationId: actor.organizationId,
          jobPlanVersion: observedJobPlanVersion,
        },
        data: {
          jobPlanVersion: observedJobPlanVersion + 1,
        },
      });
      if (versionClaim.count !== 1) {
        const errorJson = applyErrorJson({
          classification: "STALE_PLAN",
          errors: ["Job plan changed during apply. Execution review is required."],
          jobPlanVersion: observedJobPlanVersion,
          baseJobPlanVersion: changeOrder.baseJobPlanVersion,
        });
        await recordApplyFailureInTx(tx, {
          actor,
          changeOrder,
          applicationStatus: ChangeOrderApplicationStatus.NEEDS_EXECUTION_REVIEW,
          revisionStatus: ExecutionPlanRevisionStatus.NEEDS_REVIEW,
          activityType: JobActivityType.CHANGE_ORDER_NEEDS_EXECUTION_REVIEW,
          title: "Change Order needs execution review",
          details: "Job plan changed during apply.",
          errorJson,
        });
        return {
          ok: false as const,
          error: "Job plan changed during apply. Change Order needs execution review.",
        };
      }

      await recordJobActivity(
        {
          organizationId: changeOrder.organizationId,
          jobId: changeOrder.jobId,
          type: JobActivityType.CHANGE_ORDER_APPLY_ATTEMPTED,
          title: "Change Order apply attempted",
          entityType: "ChangeOrder",
          entityId: changeOrder.id,
          actorUserId: actor.userId,
          metadataJson: {
            changeOrderId: changeOrder.id,
            baseJobPlanVersion: changeOrder.baseJobPlanVersion,
            operationCount: validation.proposal.operations.length,
          },
        },
        tx,
      );

      const deltaApply = await applyChangeOrderExecutionDeltaInTx(tx, {
        organizationId: changeOrder.organizationId,
        jobId: changeOrder.jobId,
        changeOrderId: changeOrder.id,
        actorUserId: actor.userId,
        proposal: executionProposal,
      });

      let paymentMaterialization: Awaited<
        ReturnType<typeof materializeChangeOrderPaymentImpactInTx>
      > | null = null;
      if (paymentMaterializationValidation.impact != null) {
        paymentMaterialization = await materializeChangeOrderPaymentImpactInTx({
          tx,
          organizationId: changeOrder.organizationId,
          jobId: changeOrder.jobId,
          changeOrderId: changeOrder.id,
          changeOrderNumber: changeOrder.number,
          priceDeltaCents: changeOrder.priceDeltaCents,
          paymentImpact: paymentMaterializationValidation.impact,
          requirements: paymentRequirements,
        });
      }

      const resultingJobPlanVersion = observedJobPlanVersion + 1;
      await tx.changeOrder.update({
        where: { id: changeOrder.id },
        data: {
          status: ChangeOrderStatus.APPLIED,
          applicationStatus: ChangeOrderApplicationStatus.APPLIED,
          lastApplyErrorJson: Prisma.JsonNull,
          lastApplyAttemptAt: new Date(),
          appliedAt: new Date(),
        },
      });
      const executionPlanRevision = await tx.executionPlanRevision.create({
        data: {
          organizationId: changeOrder.organizationId,
          quoteId: changeOrder.quoteId,
          jobId: changeOrder.jobId,
          changeOrderId: changeOrder.id,
          kind: ExecutionPlanRevisionKind.JOB_EXECUTION_DELTA,
          status: ExecutionPlanRevisionStatus.APPLIED,
          basePlanVersion: changeOrder.baseJobPlanVersion,
          resultingPlanVersion: resultingJobPlanVersion,
          proposalJson: changeOrderExecutionDeltaToJson(validation.proposal),
          proposalSchemaVersion: validation.proposal.schemaVersion,
          plannerVersion: "change-order-execution-delta-v1",
          modelProviderMeta: {
            source: "applyChangeOrderWithActor",
            paymentImpactOperationInTx: deltaApply.hasPaymentOperation,
            appliedOperationIds: deltaApply.appliedOperationIds,
            paymentMaterialization: paymentMaterialization
              ? {
                  strategy: paymentMaterialization.strategy,
                  customerTermsText: paymentMaterialization.customerTermsText,
                  blocksAddedWork: paymentMaterialization.blocksAddedWork,
                  entries: paymentMaterialization.entries,
                  createdPaymentRequirementIds:
                    paymentMaterialization.createdPaymentRequirementIds,
                  updatedPaymentRequirementIds:
                    paymentMaterialization.updatedPaymentRequirementIds,
                }
              : null,
          },
          planningInputHash: null,
          reasoningSummary: changeOrder.reasoning,
          approvedByUserId: actor.userId,
          appliedAt: new Date(),
        },
        select: { id: true },
      });
      await recordJobActivity(
        {
          organizationId: changeOrder.organizationId,
          jobId: changeOrder.jobId,
          type: JobActivityType.CHANGE_ORDER_APPLIED,
          title: "Change Order applied",
          details: changeOrder.reasoning,
          entityType: "ChangeOrder",
          entityId: changeOrder.id,
          actorUserId: actor.userId,
          metadataJson: {
            changeOrderId: changeOrder.id,
            resultingJobPlanVersion,
            executionPlanRevisionId: executionPlanRevision.id,
            appliedOperationIds: deltaApply.appliedOperationIds,
            paymentMaterialization: paymentMaterialization
              ? {
                  strategy: paymentMaterialization.strategy,
                  createdPaymentRequirementIds:
                    paymentMaterialization.createdPaymentRequirementIds,
                  updatedPaymentRequirementIds:
                    paymentMaterialization.updatedPaymentRequirementIds,
                }
              : null,
          },
        },
        tx,
      );
      return {
        ok: true as const,
        changeOrderId: changeOrder.id,
        executionPlanRevisionId: executionPlanRevision.id,
        resultingJobPlanVersion,
        quoteId: changeOrder.quoteId,
        jobId: changeOrder.jobId,
      };
    });

    return applied;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Change Order apply error.";
    await db.$transaction(async (tx) => {
      const row = await tx.changeOrder.findFirst({
        where: { id, organizationId: actor.organizationId },
        select: {
          id: true,
          organizationId: true,
          quoteId: true,
          jobId: true,
          baseJobPlanVersion: true,
          executionDeltaJson: true,
          executionDeltaSchemaVersion: true,
          reasoning: true,
        },
      });
      if (!row) return;
      const errorJson = applyErrorJson({
        classification: "RUNTIME_EXCEPTION",
        errors: [message],
        baseJobPlanVersion: row.baseJobPlanVersion,
      });
      await tx.changeOrder.update({
        where: { id: row.id },
        data: {
          applicationStatus: ChangeOrderApplicationStatus.APPLY_FAILED,
          lastApplyErrorJson: errorJson,
          lastApplyAttemptAt: new Date(),
        },
      });
      await tx.executionPlanRevision.create({
        data: {
          organizationId: row.organizationId,
          quoteId: row.quoteId,
          jobId: row.jobId,
          changeOrderId: row.id,
          kind: ExecutionPlanRevisionKind.JOB_EXECUTION_DELTA,
          status: ExecutionPlanRevisionStatus.APPLY_FAILED,
          basePlanVersion: row.baseJobPlanVersion,
          proposalJson: (row.executionDeltaJson ?? { missing: true }) as Prisma.InputJsonValue,
          proposalSchemaVersion: row.executionDeltaSchemaVersion,
          plannerVersion: "change-order-execution-delta-v1",
          modelProviderMeta: { source: "applyChangeOrderWithActor", errorJson },
          planningInputHash: null,
          reasoningSummary: row.reasoning,
          approvedByUserId: actor.userId,
        },
      });
      await recordJobActivity(
        {
          organizationId: row.organizationId,
          jobId: row.jobId,
          type: JobActivityType.CHANGE_ORDER_APPLY_FAILED,
          title: "Change Order apply failed",
          details: message,
          entityType: "ChangeOrder",
          entityId: row.id,
          actorUserId: actor.userId,
          metadataJson: { changeOrderId: row.id, error: message },
        },
        tx,
      );
    });
    return { ok: false, error: message };
  }
}

export async function rejectChangeOrderWithActor(
  actor: ChangeOrderActor,
  changeOrderId: string,
): Promise<ChangeOrderMutationResult & { quoteId?: string; jobId?: string }> {
  const permission = assertExecutionPlanPermission(actor.role, "approve_scope_revision");
  if (!permission.ok) return { ok: false, error: permission.error };

  const id = changeOrderId.trim();
  if (!id) return { ok: false, error: "Missing Change Order id." };

  return db.$transaction(async (tx) => {
    const row = await tx.changeOrder.findFirst({
      where: { id, organizationId: actor.organizationId },
      select: { id: true, quoteId: true, jobId: true, status: true },
    });
    if (!row) return { ok: false as const, error: "Change Order not found." };
    if (row.status === ChangeOrderStatus.APPLIED) {
      return { ok: false as const, error: "Applied Change Orders cannot be rejected." };
    }

    await tx.changeOrder.update({
      where: { id },
      data: { status: ChangeOrderStatus.REJECTED },
    });
    await recordJobActivity(
      {
        organizationId: actor.organizationId,
        jobId: row.jobId,
        type: JobActivityType.CHANGE_ORDER_REJECTED,
        title: "Change Order rejected",
        entityType: "ChangeOrder",
        entityId: id,
        actorUserId: actor.userId,
        metadataJson: { changeOrderId: id },
      },
      tx,
    );
    return { ok: true as const, changeOrderId: id, quoteId: row.quoteId, jobId: row.jobId };
  });
}

export async function voidChangeOrderWithActor(
  actor: ChangeOrderActor,
  changeOrderId: string,
): Promise<ChangeOrderMutationResult & { quoteId?: string; jobId?: string }> {
  const permission = assertExecutionPlanPermission(actor.role, "approve_scope_revision");
  if (!permission.ok) return { ok: false, error: permission.error };

  const id = changeOrderId.trim();
  if (!id) return { ok: false, error: "Missing Change Order id." };

  return db.$transaction(async (tx) => {
    const row = await tx.changeOrder.findFirst({
      where: { id, organizationId: actor.organizationId },
      select: { id: true, quoteId: true, jobId: true, status: true },
    });
    if (!row) return { ok: false as const, error: "Change Order not found." };
    if (row.status === ChangeOrderStatus.APPLIED) {
      return { ok: false as const, error: "Applied Change Orders cannot be voided." };
    }

    await tx.changeOrder.update({
      where: { id },
      data: { status: ChangeOrderStatus.VOID },
    });
    await recordJobActivity(
      {
        organizationId: actor.organizationId,
        jobId: row.jobId,
        type: JobActivityType.CHANGE_ORDER_VOIDED,
        title: "Change Order voided",
        entityType: "ChangeOrder",
        entityId: id,
        actorUserId: actor.userId,
        metadataJson: { changeOrderId: id },
      },
      tx,
    );
    return { ok: true as const, changeOrderId: id, quoteId: row.quoteId, jobId: row.jobId };
  });
}
