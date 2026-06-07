import { PaymentScheduleAnchorType, Prisma } from "@prisma/client";
import { mapAiStageToStageId } from "./map-ai-stage";
import {
  validatePaymentScheduleForActivation,
  type PaymentScheduleItemForMaterialization,
} from "@/lib/payment-schedule-materialization";
import type {
  ApplyQuotePaymentScheduleInput,
  ApprovedPaymentScheduleMilestone,
  QuotePaymentScheduleGenerationMeta,
  QuotePaymentScheduleProposal,
} from "./quote-payment-schedule-proposal-schema";

export type NormalizedPaymentScheduleMilestone = ApprovedPaymentScheduleMilestone & {
  sortOrder: number;
};

export type QuotePaymentScheduleValidationResult =
  | { ok: true; milestones: NormalizedPaymentScheduleMilestone[]; warnings: string[] }
  | { ok: false; error: string };

function parsePercentage(value: string | null | undefined): Prisma.Decimal | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/%$/, "");
  if (!trimmed) return null;
  try {
    const d = new Prisma.Decimal(trimmed);
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
}

function normalizeProposalMilestones(
  proposal: QuotePaymentScheduleProposal,
  allowedStages: readonly { id: string; name: string }[],
  quoteTotalCents: number,
): QuotePaymentScheduleValidationResult {
  const warnings: string[] = [];

  if (proposal.milestones.length === 0) {
    return { ok: false, error: "The AI proposal did not include any payment milestones." };
  }

  const finalBalanceCount = proposal.milestones.filter(
    (item) => item.anchorType === PaymentScheduleAnchorType.FINAL_BALANCE,
  ).length;
  if (finalBalanceCount > 1) {
    return {
      ok: false,
      error: "The proposal includes more than one final balance milestone.",
    };
  }
  if (finalBalanceCount === 0) {
    warnings.push(
      "No final balance milestone was proposed. Consider adding one so the schedule covers the full quote total.",
    );
  }

  const normalized: NormalizedPaymentScheduleMilestone[] = [];

  for (let index = 0; index < proposal.milestones.length; index++) {
    const item = proposal.milestones[index];
    const title = item.title.trim();
    if (!title) {
      return { ok: false, error: "Every milestone must have a title." };
    }

    let anchorStageId: string | null = null;
    if (
      item.anchorType === PaymentScheduleAnchorType.BEFORE_STAGE ||
      item.anchorType === PaymentScheduleAnchorType.AFTER_STAGE
    ) {
      const stageName = item.anchorStageName?.trim();
      if (!stageName) {
        return {
          ok: false,
          error: `Milestone "${title}" requires a stage anchor but no stage was specified.`,
        };
      }
      const mapped = mapAiStageToStageId({
        stageName,
        allowedStages: [...allowedStages],
      });
      if (!mapped.stageId) {
        warnings.push(
          `Milestone "${title}" references stage "${stageName}" which could not be matched to your stage library.`,
        );
      } else {
        anchorStageId = mapped.stageId;
      }
    }

    if (
      item.anchorType === PaymentScheduleAnchorType.UPON_APPROVAL ||
      item.anchorType === PaymentScheduleAnchorType.FINAL_BALANCE
    ) {
      anchorStageId = null;
    }

    let amountCents: number | null = null;
    let percentage: Prisma.Decimal | null = null;

    if (item.anchorType === PaymentScheduleAnchorType.FINAL_BALANCE) {
      amountCents = null;
      percentage = null;
    } else {
      if (item.amountCents != null) {
        if (!Number.isSafeInteger(item.amountCents) || item.amountCents < 0) {
          return { ok: false, error: `Milestone "${title}" has an invalid fixed amount.` };
        }
        amountCents = item.amountCents;
      }
      if (item.percentage) {
        percentage = parsePercentage(item.percentage);
        if (!percentage) {
          return { ok: false, error: `Milestone "${title}" has an invalid percentage.` };
        }
        if (percentage.lt(0) || percentage.gt(100)) {
          return {
            ok: false,
            error: `Milestone "${title}" percentage must be between 0 and 100.`,
          };
        }
      }
      if (amountCents == null && percentage == null) {
        return {
          ok: false,
          error: `Milestone "${title}" needs a dollar amount or percentage.`,
        };
      }
    }

    normalized.push({
      tempId: item.tempId,
      title,
      amountCents,
      percentage: percentage?.toFixed(2) ?? null,
      anchorType: item.anchorType,
      anchorStageId,
      sortOrder: index,
    });
  }

  const materializationInput: PaymentScheduleItemForMaterialization[] = normalized.map(
    (item) => ({
      id: item.tempId,
      title: item.title,
      anchorType: item.anchorType,
      amountCents: item.amountCents ?? null,
      percentage: item.percentage ?? null,
    }),
  );

  const activationErrors = validatePaymentScheduleForActivation(
    materializationInput,
    quoteTotalCents,
  );
  if (activationErrors.length > 0) {
    return {
      ok: false,
      error: activationErrors[0]?.message ?? "Payment schedule failed activation validation.",
    };
  }

  return { ok: true, milestones: normalized, warnings };
}

/**
 * Validates reviewed payment schedule proposal before persisting milestones.
 */
export function validateQuotePaymentScheduleForApply(
  proposal: QuotePaymentScheduleProposal,
  approved: ApplyQuotePaymentScheduleInput,
  allowedStages: readonly { id: string; name: string }[],
  quoteTotalCents: number,
  hasExistingSchedule: boolean,
  generation?: QuotePaymentScheduleGenerationMeta,
): QuotePaymentScheduleValidationResult {
  if (generation?.isSimulated && !generation.canApply) {
    return {
      ok: false,
      error:
        generation.applyBlockedReason ??
        "This is demo AI output and cannot be applied in this environment.",
    };
  }

  if (!generation?.canApply && generation?.applyBlockedReason) {
    return { ok: false, error: generation.applyBlockedReason };
  }

  if (hasExistingSchedule && !approved.replaceConfirmed) {
    return {
      ok: false,
      error: 'Confirm "Replace existing schedule" before applying AI milestones.',
    };
  }

  const proposalByTempId = new Map(proposal.milestones.map((item) => [item.tempId, item]));
  for (const tempId of approved.selectedMilestoneTempIds) {
    if (!proposalByTempId.has(tempId)) {
      return {
        ok: false,
        error: "One or more selected milestones were not part of the reviewed proposal.",
      };
    }
  }

  const selectedProposal: QuotePaymentScheduleProposal = {
    ...proposal,
    milestones: approved.selectedMilestoneTempIds
      .map((tempId) => proposalByTempId.get(tempId))
      .filter(Boolean) as QuotePaymentScheduleProposal["milestones"],
  };

  return normalizeProposalMilestones(selectedProposal, allowedStages, quoteTotalCents);
}

export function normalizeQuotePaymentScheduleProposal(
  proposal: QuotePaymentScheduleProposal,
  allowedStages: readonly { id: string; name: string }[],
  quoteTotalCents: number,
): QuotePaymentScheduleValidationResult {
  return normalizeProposalMilestones(proposal, allowedStages, quoteTotalCents);
}
