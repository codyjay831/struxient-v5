import {
  JobPaymentRequirementStatus,
  PaymentScheduleAnchorType,
} from "@prisma/client";
import type { ExtendedTransactionClient } from "@/lib/db";
import { validateChangeOrderPaymentImpactGate } from "@/lib/change-order/payment-impact-gates";
import type { ChangeOrderPaymentImpact, ChangeOrderPaymentStrategy } from "@/lib/change-order/payment-impact-schema";
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
  paymentImpact: ChangeOrderPaymentImpact;
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

/**
 * Validates stored payment impact against current job payment state immediately before apply.
 */
export function validatePaymentImpactForMaterialization(
  input: ValidatePaymentImpactForMaterializationInput,
):
  | { ok: true; impact: ChangeOrderPaymentImpact | null }
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
  const errors: string[] = [];

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
  const [requirements, scheduleItems] = await Promise.all([
    tx.jobPaymentRequirement.findMany({
      where: { organizationId: params.organizationId, jobId: params.jobId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        title: true,
        amountCents: true,
        status: true,
        sourcePaymentScheduleItemId: true,
        createdAt: true,
      },
    }),
    tx.paymentScheduleItem.findMany({
      where: { quoteId: params.quoteId },
      select: {
        id: true,
        sortOrder: true,
        anchorType: true,
      },
    }),
  ]);

  const scheduleById = new Map(scheduleItems.map((item) => [item.id, item]));

  return requirements.map((requirement) => {
    const scheduleItem = requirement.sourcePaymentScheduleItemId
      ? scheduleById.get(requirement.sourcePaymentScheduleItemId)
      : null;
    return {
      id: requirement.id,
      title: requirement.title,
      amountCents: requirement.amountCents,
      status: requirement.status,
      sourcePaymentScheduleItemId: requirement.sourcePaymentScheduleItemId,
      scheduleSortOrder: scheduleItem?.sortOrder ?? null,
      anchorType: scheduleItem?.anchorType ?? null,
      createdAt: requirement.createdAt,
    };
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
      const created = await input.tx.jobPaymentRequirement.create({
        data: {
          organizationId: input.organizationId,
          jobId: input.jobId,
          title: formatChangeOrderPaymentTitle(input.changeOrderNumber),
          amountCents: input.priceDeltaCents,
          status: JobPaymentRequirementStatus.DUE,
          sourceChangeOrderId: input.changeOrderId,
          notes: impact.customerTermsText,
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
      break;
    }
    case "ADD_TO_NEXT_UNPAID_PAYMENT":
    case "ADD_TO_FINAL_PAYMENT": {
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
