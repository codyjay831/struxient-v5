import { db } from "@/lib/db";
import {
  Prisma,
  QuoteStatus,
} from "@prisma/client";
import { getCommercialRequestContextOrThrow } from "@/lib/auth-context";
import { recalculateQuoteRollupsInTx } from "@/lib/quote-line-item-template-apply-tx";

export type PerformReviseQuoteResult =
  | { ok: true; revisedQuoteId: string; reusedExisting?: boolean }
  | { ok: false; error: string };

/**
 * Pre-activation commercial revision path for issued quotes.
 * SENT/APPROVED quotes are immutable; this creates a new DRAFT clone with
 * line items, clarifications, payment schedule, and draft execution seeds.
 * Accepted execution plans are not copied — the revision must be re-reviewed.
 */
export async function performReviseQuoteByClone(
  quoteId: string,
): Promise<PerformReviseQuoteResult> {
  const id = quoteId.trim();
  if (!id) {
    return { ok: false, error: "Missing quote record id." };
  }
  const ctx = await getCommercialRequestContextOrThrow();

  try {
    return await db.$transaction(async (tx) => {
      const quote = await tx.quote.findFirst({
        where: {
          id,
          organizationId: ctx.organizationId,
          status: { in: [QuoteStatus.SENT, QuoteStatus.APPROVED] },
          job: { is: null },
        },
        select: {
          id: true,
          organizationId: true,
          customerId: true,
          leadId: true,
          serviceLocationId: true,
          title: true,
          internalNotes: true,
          customerDocumentTitle: true,
          revisionOfQuoteId: true,
          revisionNumber: true,
          paymentSchedule: {
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
            select: {
              title: true,
              amountCents: true,
              percentage: true,
              sortOrder: true,
              anchorType: true,
              anchorStageId: true,
            },
          },
          lineItems: {
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
            select: {
              id: true,
              sortOrder: true,
              description: true,
              customerScopeTitle: true,
              customerScopeDescription: true,
              customerIncludedNotes: true,
              customerExcludedNotes: true,
              customerPresentationGroup: true,
              quantity: true,
              unitAmountCents: true,
              lineTotalCents: true,
              internalNotes: true,
              executionRelevant: true,
              sourceLineItemTemplateId: true,
              clarifications: {
                orderBy: [{ questionSetKey: "asc" }, { questionSetVersion: "asc" }],
                select: {
                  clarificationSetId: true,
                  questionSetKey: true,
                  questionSetVersion: true,
                  answersJson: true,
                },
              },
              draftExecutionTasks: {
                orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
                select: {
                  sourceLineItemTemplateTaskId: true,
                  sourceTaskTemplateId: true,
                  sourceType: true,
                  title: true,
                  category: true,
                  instructions: true,
                  sortOrder: true,
                  requirementsJson: true,
                  assigneeRole: true,
                  costBudgetCents: true,
                  estimatedMinutes: true,
                  hardSignal: true,
                  partsRequiredJson: true,
                  providesSignals: true,
                  requiresSignals: true,
                  stageId: true,
                },
              },
            },
          },
        },
      });

      if (!quote) {
        return {
          ok: false as const,
          error: "Only pre-activation SENT/APPROVED quotes can be revised by clone.",
        };
      }

      const rootQuoteId = quote.revisionOfQuoteId ?? quote.id;

      const existingOpenRevision = await tx.quote.findFirst({
        where: {
          organizationId: ctx.organizationId,
          status: QuoteStatus.DRAFT,
          revisionOfQuoteId: rootQuoteId,
          job: { is: null },
        },
        select: { id: true },
        orderBy: { updatedAt: "desc" },
      });
      if (existingOpenRevision) {
        return {
          ok: true as const,
          revisedQuoteId: existingOpenRevision.id,
          reusedExisting: true,
        };
      }

      const nextRevisionNumber = (quote.revisionNumber ?? 1) + 1;
      const clonedQuote = await tx.quote.create({
        data: {
          organizationId: quote.organizationId,
          customerId: quote.customerId,
          leadId: quote.leadId,
          serviceLocationId: quote.serviceLocationId,
          title: quote.title,
          status: QuoteStatus.DRAFT,
          internalNotes: quote.internalNotes,
          customerDocumentTitle: quote.customerDocumentTitle,
          revisionOfQuoteId: rootQuoteId,
          revisionNumber: nextRevisionNumber,
        },
        select: { id: true },
      });

      for (const scheduleItem of quote.paymentSchedule) {
        await tx.paymentScheduleItem.create({
          data: {
            quoteId: clonedQuote.id,
            title: scheduleItem.title,
            amountCents: scheduleItem.amountCents,
            percentage: scheduleItem.percentage,
            sortOrder: scheduleItem.sortOrder,
            anchorType: scheduleItem.anchorType,
            anchorStageId: scheduleItem.anchorStageId,
          },
        });
      }

      for (const line of quote.lineItems) {
        const clonedLine = await tx.quoteLineItem.create({
          data: {
            quoteId: clonedQuote.id,
            sortOrder: line.sortOrder,
            description: line.description,
            customerScopeTitle: line.customerScopeTitle,
            customerScopeDescription: line.customerScopeDescription,
            customerIncludedNotes: line.customerIncludedNotes,
            customerExcludedNotes: line.customerExcludedNotes,
            customerPresentationGroup: line.customerPresentationGroup,
            quantity: line.quantity,
            unitAmountCents: line.unitAmountCents,
            lineTotalCents: line.lineTotalCents,
            internalNotes: line.internalNotes,
            executionRelevant: line.executionRelevant,
            sourceLineItemTemplateId: line.sourceLineItemTemplateId,
          },
          select: { id: true },
        });

        for (const clarification of line.clarifications) {
          await tx.quoteLineClarification.create({
            data: {
              quoteLineItemId: clonedLine.id,
              clarificationSetId: clarification.clarificationSetId,
              questionSetKey: clarification.questionSetKey,
              questionSetVersion: clarification.questionSetVersion,
              answersJson: clarification.answersJson as Prisma.InputJsonValue,
            },
          });
        }

        for (const draftTask of line.draftExecutionTasks) {
          await tx.quoteLineExecutionTask.create({
            data: {
              quoteLineItemId: clonedLine.id,
              sourceLineItemTemplateTaskId: draftTask.sourceLineItemTemplateTaskId,
              sourceTaskTemplateId: draftTask.sourceTaskTemplateId,
              sourceType: draftTask.sourceType,
              title: draftTask.title,
              category: draftTask.category,
              instructions: draftTask.instructions,
              sortOrder: draftTask.sortOrder,
              requirementsJson: draftTask.requirementsJson as Prisma.InputJsonValue,
              assigneeRole: draftTask.assigneeRole,
              costBudgetCents: draftTask.costBudgetCents,
              estimatedMinutes: draftTask.estimatedMinutes,
              hardSignal: draftTask.hardSignal,
              partsRequiredJson: draftTask.partsRequiredJson as Prisma.InputJsonValue | undefined,
              providesSignals: draftTask.providesSignals,
              requiresSignals: draftTask.requiresSignals,
              stageId: draftTask.stageId,
            },
          });
        }
      }

      await recalculateQuoteRollupsInTx(tx, {
        quoteId: clonedQuote.id,
        organizationId: ctx.organizationId,
      });

      await tx.quoteChangeRequest.updateMany({
        where: {
          organizationId: ctx.organizationId,
          quoteId: quote.id,
          resolvedAt: null,
        },
        data: {
          resultingQuoteId: clonedQuote.id,
          resolvedAt: new Date(),
          resolvedByUserId: ctx.userId,
        },
      });

      return { ok: true as const, revisedQuoteId: clonedQuote.id };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") {
      return {
        ok: false,
        error: "Another change happened at the same moment. Refresh and try again.",
      };
    }
    throw e;
  }
}
