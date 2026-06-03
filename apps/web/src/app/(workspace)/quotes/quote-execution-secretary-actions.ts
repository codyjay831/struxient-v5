"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import {
  mergeSignalsForCrossLineApply,
  suggestCrossLineWiring,
  type CrossLineWiringSuggestion,
} from "@/lib/ai/signal-suggester";
import { QUOTE_STATUSES_EXECUTION_EDITABLE } from "@/lib/quote-status-workflow";

export type QuoteExecutionSecretaryReviewResult =
  | { ok: true; suggestions: CrossLineWiringSuggestion[] }
  | { ok: false; error: string };

export type QuoteExecutionSecretaryApplyResult =
  | { ok: true }
  | { ok: false; error: string };

const LOCKED_ERROR =
  "This quote is not editable. It may be archived, a job may already exist, or it is outside your organization.";

async function loadQuoteLinesForSecretary(quoteId: string, organizationId: string) {
  return db.quote.findFirst({
    where: {
      id: quoteId,
      organizationId,
      status: { in: [...QUOTE_STATUSES_EXECUTION_EDITABLE] },
      job: { is: null },
    },
    select: {
      id: true,
      lineItems: {
        orderBy: [{ sortOrder: "asc" }],
        select: {
          id: true,
          description: true,
          draftExecutionTasks: {
            orderBy: [{ sortOrder: "asc" }],
            select: {
              id: true,
              title: true,
              category: true,
              providesSignals: true,
              requiresSignals: true,
            },
          },
        },
      },
    },
  });
}

export async function reviewQuoteCrossLineWiringAction(
  quoteId: string,
): Promise<QuoteExecutionSecretaryReviewResult> {
  const qid = quoteId.trim();
  if (!qid) {
    return { ok: false, error: "Missing quote id." };
  }

  const ctx = await getRequestContextOrThrow();
  const quote = await loadQuoteLinesForSecretary(qid, ctx.organizationId);
  if (!quote) {
    return { ok: false, error: LOCKED_ERROR };
  }

  const lines = quote.lineItems.map((line) => ({
    id: line.id,
    description: line.description,
    tasks: line.draftExecutionTasks.map((task) => ({
      id: task.id,
      title: task.title,
      category: task.category,
      provides: task.providesSignals,
      requires: task.requiresSignals,
    })),
  }));

  return { ok: true, suggestions: suggestCrossLineWiring(lines) };
}

export async function applyQuoteCrossLineWiringSuggestionAction(
  quoteId: string,
  suggestionKey: string,
): Promise<QuoteExecutionSecretaryApplyResult> {
  const qid = quoteId.trim();
  const key = suggestionKey.trim();
  if (!qid || !key) {
    return { ok: false, error: "Missing quote or suggestion." };
  }

  const ctx = await getRequestContextOrThrow();
  const review = await reviewQuoteCrossLineWiringAction(qid);
  if (!review.ok) {
    return { ok: false, error: review.error };
  }

  const suggestion = review.suggestions.find((s) => s.suggestionKey === key);
  if (!suggestion) {
    return { ok: false, error: "This suggestion is no longer available. Run review again." };
  }

  const outcome = await db.$transaction(async (tx) => {
    const quote = await tx.quote.findFirst({
      where: {
        id: qid,
        organizationId: ctx.organizationId,
        status: { in: [...QUOTE_STATUSES_EXECUTION_EDITABLE] },
        job: { is: null },
      },
      select: { id: true },
    });
    if (!quote) {
      return { ok: false as const };
    }

    const [consumer, provider] = await Promise.all([
      tx.quoteLineExecutionTask.findFirst({
        where: { id: suggestion.consumerTaskId },
        include: {
          quoteLineItem: {
            select: { quoteId: true, quote: { select: { organizationId: true } } },
          },
        },
      }),
      tx.quoteLineExecutionTask.findFirst({
        where: { id: suggestion.providerTaskId },
        include: {
          quoteLineItem: {
            select: { quoteId: true, quote: { select: { organizationId: true } } },
          },
        },
      }),
    ]);

    if (
      !consumer ||
      !provider ||
      consumer.quoteLineItem.quoteId !== qid ||
      provider.quoteLineItem.quoteId !== qid ||
      consumer.quoteLineItem.quote.organizationId !== ctx.organizationId ||
      provider.quoteLineItem.quote.organizationId !== ctx.organizationId
    ) {
      return { ok: false as const };
    }

    const signal = suggestion.signal;

    await tx.quoteLineExecutionTask.update({
      where: { id: consumer.id },
      data: {
        requiresSignals: mergeSignalsForCrossLineApply(consumer.requiresSignals, [signal]),
      },
    });

    await tx.quoteLineExecutionTask.update({
      where: { id: provider.id },
      data: {
        providesSignals: mergeSignalsForCrossLineApply(provider.providesSignals, [signal]),
      },
    });

    await tx.$executeRaw`
      UPDATE "Quote"
      SET "updatedAt" = NOW()
      WHERE "id" = ${qid} AND "organizationId" = ${ctx.organizationId}
    `;

    return { ok: true as const };
  });

  if (!outcome.ok) {
    return { ok: false, error: LOCKED_ERROR };
  }

  revalidatePath(`/quotes/${qid}`);
  revalidatePath(`/quotes/${qid}/execution-review`);
  return { ok: true };
}
