"use server";

import { QuoteStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCommercialRequestContextOrThrow } from "@/lib/auth-context";
import { AIService } from "@/lib/ai/ai-service";
import {
  assessQuotePaymentSchedulePreflight,
  buildQuotePaymentScheduleContextFromQuoteRow,
  buildQuotePaymentScheduleContextText,
} from "@/lib/ai/quote-payment-schedule-context";
import {
  ApplyQuotePaymentScheduleInputSchema,
  QuotePaymentScheduleProposalSchema,
} from "@/lib/ai/quote-payment-schedule-proposal-schema";
import { validateQuotePaymentScheduleForApply } from "@/lib/ai/quote-payment-schedule-ai-plan";
import { getAiActionErrorMessage } from "@/lib/ai/ai-provider-errors";
import {
  performApplyQuotePaymentScheduleInTx,
  QuotePaymentScheduleApplyTxError,
} from "@/lib/quote-payment-schedule-apply-tx";
import type {
  QuotePaymentScheduleApplyOptions,
  QuotePaymentScheduleApplyResult,
  QuotePaymentScheduleGenerateOptions,
  QuotePaymentScheduleGenerateResult,
} from "./quote-payment-schedule-ai-types";

const QUOTE_PAYMENT_SCHEDULE_LOCKED_ERROR =
  "Payment schedule suggestions can only be generated on draft quotes without an activated job.";

function revalidateQuoteCommercialSurfaces(quoteId: string) {
  const id = quoteId.trim();
  revalidatePath(`/quotes/${id}`);
  revalidatePath(`/quotes/${id}/execution-review`);
  revalidatePath("/leads");
  revalidatePath("/workstation");
  revalidatePath("/workstation/tasks");
  revalidatePath("/workstation/jobs");
}

const quotePaymentScheduleSelect = {
  id: true,
  title: true,
  totalCents: true,
  subtotalCents: true,
  internalNotes: true,
  lead: {
    select: {
      notes: true,
      request: true,
    },
  },
  lineItems: {
    orderBy: { sortOrder: "asc" as const },
    select: {
      description: true,
      customerScopeTitle: true,
      customerScopeDescription: true,
      lineTotalCents: true,
      internalNotes: true,
      draftExecutionTasks: {
        orderBy: { sortOrder: "asc" as const },
        select: {
          title: true,
          category: true,
          stage: { select: { name: true } },
        },
      },
    },
  },
  paymentSchedule: {
    orderBy: { sortOrder: "asc" as const },
    select: {
      title: true,
      anchorType: true,
      anchorStageId: true,
      amountCents: true,
      percentage: true,
      anchorStage: { select: { name: true } },
    },
  },
} as const;

export async function generateQuotePaymentScheduleAIProposalAction(
  quoteId: string,
  options?: QuotePaymentScheduleGenerateOptions,
): Promise<QuotePaymentScheduleGenerateResult> {
  const qid = quoteId.trim();
  if (!qid) {
    return { error: "Missing quote id." };
  }

  const ctx = await getCommercialRequestContextOrThrow();
  const startedAt = Date.now();

  try {
    const [quote, stages] = await Promise.all([
      db.quote.findFirst({
        where: {
          id: qid,
          organizationId: ctx.organizationId,
          status: QuoteStatus.DRAFT,
          job: { is: null },
        },
        select: quotePaymentScheduleSelect,
      }),
      db.stage.findMany({
        where: { organizationId: ctx.organizationId },
        select: { id: true, name: true },
        orderBy: { sortOrder: "asc" },
      }),
    ]);

    if (!quote) {
      return { error: QUOTE_PAYMENT_SCHEDULE_LOCKED_ERROR };
    }

    if (!Number.isSafeInteger(quote.totalCents) || quote.totalCents <= 0) {
      return { error: "Add priced line items before generating a payment schedule." };
    }

    const contextInput = buildQuotePaymentScheduleContextFromQuoteRow({
      ...quote,
      stages,
    });
    contextInput.userInstructions = options?.userInstructions ?? null;

    const preflight = assessQuotePaymentSchedulePreflight(contextInput);
    if (!preflight.hasMinimumContext) {
      return {
        error:
          "Add scope line items, internal notes, lead context, or an execution plan before generating a payment schedule.",
        preflight,
      };
    }

    const contextText = buildQuotePaymentScheduleContextText(contextInput);
    const generated = await AIService.generatePaymentScheduleProposal({
      quoteId: qid,
      quoteTotalCents: quote.totalCents,
      contextText,
      allowedStages: stages,
      organizationName: ctx.organizationName,
      userInstructions: options?.userInstructions ?? null,
    });

    console.info("[quote-payment-schedule-ai] generate ok", {
      quoteId: qid,
      durationMs: Date.now() - startedAt,
      milestoneCount: generated.proposal.milestones.length,
      isSimulated: generated.generation.isSimulated,
    });

    return {
      proposal: generated.proposal,
      generation: generated.generation,
      preflight,
    };
  } catch (e) {
    console.error("[quote-payment-schedule-ai] generate failed", {
      quoteId: qid,
      durationMs: Date.now() - startedAt,
      error: e,
    });
    return { error: getAiActionErrorMessage(e) };
  }
}

export async function applyQuotePaymentScheduleAIProposalAction(
  quoteId: string,
  proposal: unknown,
  options: QuotePaymentScheduleApplyOptions,
): Promise<QuotePaymentScheduleApplyResult> {
  const qid = quoteId.trim();
  if (!qid) {
    return { error: "Missing quote id." };
  }

  const ctx = await getCommercialRequestContextOrThrow();

  try {
    const parsedProposal = QuotePaymentScheduleProposalSchema.parse(proposal);
    if (parsedProposal.quoteId !== qid) {
      return { error: "Proposal does not match this quote." };
    }

    const approved = ApplyQuotePaymentScheduleInputSchema.parse(options.approved);

    const [quote, stages] = await Promise.all([
      db.quote.findFirst({
        where: {
          id: qid,
          organizationId: ctx.organizationId,
          status: QuoteStatus.DRAFT,
          job: { is: null },
        },
        select: {
          totalCents: true,
          paymentSchedule: { select: { id: true } },
        },
      }),
      db.stage.findMany({
        where: { organizationId: ctx.organizationId },
        select: { id: true, name: true },
      }),
    ]);

    if (!quote) {
      return { error: QUOTE_PAYMENT_SCHEDULE_LOCKED_ERROR };
    }

    const hasExistingSchedule = quote.paymentSchedule.length > 0;
    const validation = validateQuotePaymentScheduleForApply(
      parsedProposal,
      approved,
      stages,
      quote.totalCents,
      hasExistingSchedule,
      options.generation,
    );

    if (!validation.ok) {
      return { error: validation.error };
    }

    let outcome: Awaited<ReturnType<typeof performApplyQuotePaymentScheduleInTx>>;
    try {
      outcome = await db.$transaction(async (tx) =>
        performApplyQuotePaymentScheduleInTx(tx, {
          quoteId: qid,
          organizationId: ctx.organizationId,
          replaceExisting: hasExistingSchedule,
          milestones: validation.milestones,
        }),
      );
    } catch (e) {
      if (e instanceof QuotePaymentScheduleApplyTxError) {
        return { error: e.message };
      }
      throw e;
    }

    if (!outcome.ok) {
      return { error: outcome.error };
    }

    revalidateQuoteCommercialSurfaces(qid);

    return {
      success: true,
      createdCount: outcome.createdCount,
      warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
    };
  } catch (e) {
    console.error("[quote-payment-schedule-ai] apply failed", { quoteId: qid, error: e });
    if (e instanceof Error && e.message.trim()) {
      return { error: e.message };
    }
    return {
      error: getAiActionErrorMessage(e, "Failed to apply payment schedule suggestions."),
    };
  }
}
