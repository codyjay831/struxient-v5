import {
  JobPaymentRequirementStatus,
  PaymentScheduleAnchorType,
} from "@prisma/client";
import type { ExtendedTransactionClient } from "@/lib/db";
import { validateChangeOrderPaymentImpactGate } from "@/lib/change-order/payment-impact-gates";
import type {
  ChangeOrderPaymentAllocationRow,
  ChangeOrderPaymentImpactAny,
  ChangeOrderPaymentStrategy,
} from "@/lib/change-order/payment-impact-schema";
import {
  isPaymentImpactV2,
  validatePaymentImpactAllocationSum,
} from "@/lib/change-order/payment-impact-schema";
import {
  getUnsettledPaymentRequirements,
  isUnsettledPaymentRequirement,
  resolveFinalUnpaidPaymentRequirement,
  resolveNextUnpaidPaymentRequirement,
  sumUnsettledPaymentBalanceCents,
  type JobPaymentRequirementForResolver,
} from "@/lib/change-order/payment-impact-resolver";

export type PaymentMaterializationAuditEntry = {
  kind: "CREATE" | "UPDATE";
  paymentRequirementId: string;
  title: string;
  amountBeforeCents: number | null;
  amountAfterCents: number | null;
  statusBefore?: JobPaymentRequirementStatus;
  statusAfter?: JobPaymentRequirementStatus;
};

export type PaymentMaterializationResult = {
  strategy: ChangeOrderPaymentStrategy;
  customerTermsText: string;
  blocksAddedWork: boolean;
  entries: PaymentMaterializationAuditEntry[];
  createdPaymentRequirementIds: string[];
  updatedPaymentRequirementIds: string[];
};

export type ValidatePaymentImpactForMaterializationInput = {
  priceDeltaCents: number;
  paymentImpactJson: unknown;
  requirements: JobPaymentRequirementForResolver[];
};

export type MaterializePaymentImpactInTxInput = {
  tx: ExtendedTransactionClient;
  organizationId: string;
  jobId: string;
  changeOrderId: string;
  changeOrderNumber: number;
  priceDeltaCents: number;
  paymentImpact: ChangeOrderPaymentImpactAny;
  requirements: JobPaymentRequirementForResolver[];
};

function formatChangeOrderPaymentTitle(number: number): string {
  return `Change Order CO-${String(number).padStart(3, "0")}`;
}

function sortRequirementsFinalFirst(
  requirements: JobPaymentRequirementForResolver[],
): JobPaymentRequirementForResolver[] {
  return [...requirements].sort((a, b) => {
    const aFinal = a.anchorType === PaymentScheduleAnchorType.FINAL_BALANCE ? 1 : 0;
    const bFinal = b.anchorType === PaymentScheduleAnchorType.FINAL_BALANCE ? 1 : 0;
    if (aFinal !== bFinal) return bFinal - aFinal;
    const aSort = a.scheduleSortOrder ?? Number.MAX_SAFE_INTEGER;
    const bSort = b.scheduleSortOrder ?? Number.MAX_SAFE_INTEGER;
    if (aSort !== bSort) return bSort - aSort;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

function findRequirement(
  requirements: JobPaymentRequirementForResolver[],
  id: string,
): JobPaymentRequirementForResolver | null {
  return requirements.find((req) => req.id === id) ?? null;
}

function assertUnsettledTarget(
  target: JobPaymentRequirementForResolver | null,
  label: string,
): string[] {
  if (!target) {
    return [`${label} target payment requirement was not found on this job.`];
  }
  if (!isUnsettledPaymentRequirement(target.status)) {
    return [
      `${label} target "${target.title}" is already ${target.status.toLowerCase()} and cannot be modified.`,
    ];
  }
  return [];
}

function validateAllocationDrift(
  requirements: JobPaymentRequirementForResolver[],
  allocations: ChangeOrderPaymentAllocationRow[],
): string[] {
  const errors: string[] = [];
  for (const allocation of allocations) {
    const target = findRequirement(requirements, allocation.paymentRequirementId);
    if (!target) {
      errors.push(
        `Payment "${allocation.title}" was not found on this job and cannot be updated.`,
      );
      continue;
    }
    if (!isUnsettledPaymentRequirement(target.status)) {
      errors.push(
        `"${allocation.title}" is already ${target.status.toLowerCase()} and cannot be modified.`,
      );
      continue;
    }
    const current = target.amountCents ?? 0;
    if (current !== allocation.currentAmountCents) {
      errors.push(
        `"${allocation.title}" no longer matches the customer-approved payment allocation (expected ${allocation.currentAmountCents} cents, found ${current} cents). Review payment terms before applying.`,
      );
    }
  }
  return errors;
}

/**
 * Validates stored payment impact against current job payment state immediately before apply.
 */
export function validatePaymentImpactForMaterialization(
  input: ValidatePaymentImpactForMaterializationInput,
):
  | { ok: true; impact: ChangeOrderPaymentImpactAny | null }
  | { ok: false; errors: string[] } {
  const gate = validateChangeOrderPaymentImpactGate({
    priceDeltaCents: input.priceDeltaCents,
    paymentImpactJson: input.paymentImpactJson,
  });
  if (!gate.ok) {
    return { ok: false, errors: [gate.error, ...(gate.errors ?? [])] };
  }
  if (gate.impact == null) {
    return { ok: true, impact: null };
  }

  const impact = gate.impact;
  const errors: string[] = [...validatePaymentImpactAllocationSum({ priceDeltaCents: input.priceDeltaCents, impact })];

  switch (impact.strategy) {
    case "DUE_BEFORE_ADDED_WORK":
      if (input.priceDeltaCents <= 0) {
        errors.push("Due before added work requires a positive Change Order amount.");
      }
      break;
    case "ADD_TO_NEXT_UNPAID_PAYMENT": {
      if (input.priceDeltaCents <= 0) {
        errors.push("Add to next unpaid payment requires a positive Change Order amount.");
        break;
      }
      if (isPaymentImpactV2(impact) && impact.allocations?.length) {
        errors.push(...validateAllocationDrift(input.requirements, impact.allocations));
        break;
      }
      const targetId = impact.targetPaymentRequirementId;
      if (!targetId) {
        errors.push("Add to next unpaid payment requires a target payment requirement.");
        break;
      }
      const target = findRequirement(input.requirements, targetId);
      errors.push(...assertUnsettledTarget(target, "Next payment"));
      const resolvedNext = resolveNextUnpaidPaymentRequirement(input.requirements);
      if (target && resolvedNext && target.id !== resolvedNext.id) {
        errors.push(
          "Selected next payment target no longer matches the earliest unsettled payment on this job.",
        );
      }
      break;
    }
    case "ADD_TO_FINAL_PAYMENT": {
      if (input.priceDeltaCents <= 0) {
        errors.push("Add to final payment requires a positive Change Order amount.");
        break;
      }
      if (isPaymentImpactV2(impact) && impact.allocations?.length) {
        errors.push(...validateAllocationDrift(input.requirements, impact.allocations));
        break;
      }
      const targetId = impact.targetPaymentRequirementId;
      if (!targetId) {
        errors.push("Add to final payment requires a target payment requirement.");
        break;
      }
      const target = findRequirement(input.requirements, targetId);
      errors.push(...assertUnsettledTarget(target, "Final payment"));
      const resolvedFinal = resolveFinalUnpaidPaymentRequirement(input.requirements);
      if (target && resolvedFinal && target.id !== resolvedFinal.id) {
        errors.push(
          "Selected final payment target no longer matches the final unsettled payment on this job.",
        );
      }
      break;
    }
    case "SPLIT_ACROSS_REMAINING_PAYMENTS":
    case "DEPOSIT_NOW_REST_TO_FINAL":
    case "DEPOSIT_NOW_REST_SPLIT_ACROSS_REMAINING": {
      if (input.priceDeltaCents <= 0) {
        errors.push("Payment plan strategies require a positive Change Order amount.");
        break;
      }
      if (!isPaymentImpactV2(impact)) {
        errors.push("Payment plan strategy requires schema version 2 payment impact.");
        break;
      }
      if (impact.allocations?.length) {
        errors.push(...validateAllocationDrift(input.requirements, impact.allocations));
      }
      break;
    }
    case "CREDIT_REMAINING_BALANCE": {
      if (input.priceDeltaCents >= 0) {
        errors.push("Credit remaining balance requires a negative Change Order amount.");
        break;
      }
      const balance = sumUnsettledPaymentBalanceCents(input.requirements);
      if (balance <= 0) {
        errors.push("No unsettled payment balance is available to credit.");
      } else if (Math.abs(input.priceDeltaCents) > balance) {
        errors.push(
          `Credit of ${Math.abs(input.priceDeltaCents)} cents exceeds remaining unsettled balance of ${balance} cents.`,
        );
      }
      break;
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, impact };
}

export async function loadJobPaymentRequirementsForMaterializer(
  tx: ExtendedTransactionClient,
  params: { organizationId: string; jobId: string; quoteId: string },
): Promise<JobPaymentRequirementForResolver[]> {
  const [requirements, scheduleItems, jobStages] = await Promise.all([
    tx.jobPaymentRequirement.findMany({
      where: { organizationId: params.organizationId, jobId: params.jobId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        title: true,
        amountCents: true,
        status: true,
        sourcePaymentScheduleItemId: true,
        requiredBeforeStageId: true,
        createdAt: true,
      },
    }),
    tx.paymentScheduleItem.findMany({
      where: { quoteId: params.quoteId },
      select: {
        id: true,
        sortOrder: true,
        anchorType: true,
        percentage: true,
      },
    }),
    tx.jobStage.findMany({
      where: { jobId: params.jobId },
      select: { id: true, title: true },
    }),
  ]);

  const scheduleById = new Map(scheduleItems.map((item) => [item.id, item]));
  const stageTitleById = new Map(jobStages.map((stage) => [stage.id, stage.title]));

  return requirements.map((requirement) => {
    const scheduleItem = requirement.sourcePaymentScheduleItemId
      ? scheduleById.get(requirement.sourcePaymentScheduleItemId)
      : null;
    const percentage = scheduleItem?.percentage;
    return {
      id: requirement.id,
      title: requirement.title,
      amountCents: requirement.amountCents,
      status: requirement.status,
      sourcePaymentScheduleItemId: requirement.sourcePaymentScheduleItemId,
      scheduleSortOrder: scheduleItem?.sortOrder ?? null,
      anchorType: scheduleItem?.anchorType ?? null,
      schedulePercentage:
        percentage != null ? Number.parseFloat(percentage.toString()) : null,
      requiredBeforeStageId: requirement.requiredBeforeStageId,
      requiredBeforeStageTitle: requirement.requiredBeforeStageId
        ? (stageTitleById.get(requirement.requiredBeforeStageId) ?? null)
        : null,
      createdAt: requirement.createdAt,
    };
  });
}

async function applyAllocationUpdates(
  input: MaterializePaymentImpactInTxInput,
  allocations: ChangeOrderPaymentAllocationRow[],
  entries: PaymentMaterializationAuditEntry[],
  updatedPaymentRequirementIds: string[],
): Promise<void> {
  for (const allocation of allocations) {
    if (allocation.adjustmentCents === 0) continue;

    const target = await input.tx.jobPaymentRequirement.findFirst({
      where: {
        id: allocation.paymentRequirementId,
        organizationId: input.organizationId,
        jobId: input.jobId,
      },
      select: {
        id: true,
        title: true,
        amountCents: true,
        status: true,
      },
    });

    if (!target || !isUnsettledPaymentRequirement(target.status)) {
      throw new Error(
        `CHANGE_ORDER_PAYMENT_MATERIALIZE_TARGET_UNAVAILABLE:${allocation.title}`,
      );
    }

    const amountBeforeCents = target.amountCents ?? 0;
    if (amountBeforeCents !== allocation.currentAmountCents) {
      throw new Error(
        `"${allocation.title}" no longer matches the customer-approved payment allocation. Review payment terms before applying.`,
      );
    }

    const updated = await input.tx.jobPaymentRequirement.update({
      where: { id: target.id },
      data: { amountCents: allocation.newAmountCents },
      select: { id: true, title: true, amountCents: true, status: true },
    });
    updatedPaymentRequirementIds.push(updated.id);
    entries.push({
      kind: "UPDATE",
      paymentRequirementId: updated.id,
      title: updated.title,
      amountBeforeCents,
      amountAfterCents: updated.amountCents,
      statusBefore: target.status,
      statusAfter: updated.status,
    });
  }
}

async function createDepositRequirement(
  input: MaterializePaymentImpactInTxInput,
  amountCents: number,
  title: string,
  entries: PaymentMaterializationAuditEntry[],
  createdPaymentRequirementIds: string[],
): Promise<void> {
  const created = await input.tx.jobPaymentRequirement.create({
    data: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      title,
      amountCents,
      status: JobPaymentRequirementStatus.DUE,
      sourceChangeOrderId: input.changeOrderId,
      notes: input.paymentImpact.customerTermsText,
    },
    select: { id: true, title: true, amountCents: true, status: true },
  });
  createdPaymentRequirementIds.push(created.id);
  entries.push({
    kind: "CREATE",
    paymentRequirementId: created.id,
    title: created.title,
    amountBeforeCents: null,
    amountAfterCents: created.amountCents,
    statusAfter: created.status,
  });
}

/**
 * Materializes approved `paymentImpactJson` into runtime `JobPaymentRequirement` rows.
 * Throws on failure so the surrounding transaction rolls back scope/task mutations.
 */
export async function materializeChangeOrderPaymentImpactInTx(
  input: MaterializePaymentImpactInTxInput,
): Promise<PaymentMaterializationResult> {
  const impact = input.paymentImpact;
  const entries: PaymentMaterializationAuditEntry[] = [];
  const createdPaymentRequirementIds: string[] = [];
  const updatedPaymentRequirementIds: string[] = [];

  if (input.priceDeltaCents === 0) {
    return {
      strategy: impact.strategy,
      customerTermsText: impact.customerTermsText,
      blocksAddedWork: impact.blocksAddedWork ?? false,
      entries,
      createdPaymentRequirementIds,
      updatedPaymentRequirementIds,
    };
  }

  switch (impact.strategy) {
    case "DUE_BEFORE_ADDED_WORK": {
      await createDepositRequirement(
        input,
        input.priceDeltaCents,
        formatChangeOrderPaymentTitle(input.changeOrderNumber),
        entries,
        createdPaymentRequirementIds,
      );
      break;
    }
    case "ADD_TO_NEXT_UNPAID_PAYMENT":
    case "ADD_TO_FINAL_PAYMENT": {
      if (isPaymentImpactV2(impact) && impact.allocations?.length) {
        await applyAllocationUpdates(
          input,
          impact.allocations,
          entries,
          updatedPaymentRequirementIds,
        );
        break;
      }
      const targetId = impact.targetPaymentRequirementId;
      if (!targetId) {
        throw new Error("CHANGE_ORDER_PAYMENT_MATERIALIZE_MISSING_TARGET");
      }
      const target = await input.tx.jobPaymentRequirement.findFirst({
        where: {
          id: targetId,
          organizationId: input.organizationId,
          jobId: input.jobId,
        },
        select: {
          id: true,
          title: true,
          amountCents: true,
          status: true,
        },
      });
      if (!target || !isUnsettledPaymentRequirement(target.status)) {
        throw new Error("CHANGE_ORDER_PAYMENT_MATERIALIZE_TARGET_UNAVAILABLE");
      }
      const amountBeforeCents = target.amountCents ?? 0;
      const amountAfterCents = amountBeforeCents + input.priceDeltaCents;
      const updated = await input.tx.jobPaymentRequirement.update({
        where: { id: target.id },
        data: { amountCents: amountAfterCents },
        select: { id: true, title: true, amountCents: true, status: true },
      });
      updatedPaymentRequirementIds.push(updated.id);
      entries.push({
        kind: "UPDATE",
        paymentRequirementId: updated.id,
        title: updated.title,
        amountBeforeCents,
        amountAfterCents: updated.amountCents,
        statusBefore: target.status,
        statusAfter: updated.status,
      });
      break;
    }
    case "SPLIT_ACROSS_REMAINING_PAYMENTS": {
      if (!isPaymentImpactV2(impact) || !impact.allocations?.length) {
        throw new Error("CHANGE_ORDER_PAYMENT_MATERIALIZE_MISSING_ALLOCATIONS");
      }
      await applyAllocationUpdates(
        input,
        impact.allocations,
        entries,
        updatedPaymentRequirementIds,
      );
      break;
    }
    case "DEPOSIT_NOW_REST_TO_FINAL":
    case "DEPOSIT_NOW_REST_SPLIT_ACROSS_REMAINING": {
      if (!isPaymentImpactV2(impact) || !impact.initialPayment) {
        throw new Error("CHANGE_ORDER_PAYMENT_MATERIALIZE_MISSING_DEPOSIT");
      }
      await createDepositRequirement(
        input,
        impact.initialPayment.amountCents,
        impact.initialPayment.title,
        entries,
        createdPaymentRequirementIds,
      );
      if (impact.allocations?.length) {
        await applyAllocationUpdates(
          input,
          impact.allocations,
          entries,
          updatedPaymentRequirementIds,
        );
      }
      break;
    }
    case "CREDIT_REMAINING_BALANCE": {
      let remainingCredit = Math.abs(input.priceDeltaCents);
      const unsettled = getUnsettledPaymentRequirements(input.requirements);
      for (const requirement of sortRequirementsFinalFirst(unsettled)) {
        if (remainingCredit <= 0) break;
        const currentAmount = requirement.amountCents ?? 0;
        if (currentAmount <= 0) continue;

        const reduction = Math.min(currentAmount, remainingCredit);
        const amountAfterCents = currentAmount - reduction;
        const updated = await input.tx.jobPaymentRequirement.update({
          where: { id: requirement.id },
          data: { amountCents: amountAfterCents },
          select: { id: true, title: true, amountCents: true, status: true },
        });
        remainingCredit -= reduction;
        updatedPaymentRequirementIds.push(updated.id);
        entries.push({
          kind: "UPDATE",
          paymentRequirementId: updated.id,
          title: updated.title,
          amountBeforeCents: currentAmount,
          amountAfterCents: updated.amountCents,
          statusBefore: requirement.status,
          statusAfter: updated.status,
        });
      }
      if (remainingCredit > 0) {
        throw new Error("CHANGE_ORDER_PAYMENT_MATERIALIZE_CREDIT_EXCEEDS_BALANCE");
      }
      break;
    }
  }

  return {
    strategy: impact.strategy,
    customerTermsText: impact.customerTermsText,
    blocksAddedWork: impact.blocksAddedWork ?? false,
    entries,
    createdPaymentRequirementIds,
    updatedPaymentRequirementIds,
  };
}
