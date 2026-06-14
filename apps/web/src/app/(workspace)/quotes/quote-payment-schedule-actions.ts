"use server";

import { PaymentScheduleAnchorType, QuoteStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCommercialRequestContextOrThrow } from "@/lib/auth-context";
import { parsePercentageString, parseUsdStringToCents } from "@/lib/quote-money";
import { QUOTE_PAYMENT_SCHEDULE_FIELD_LIMITS } from "./quote-field-limits";

export type PaymentScheduleFormState = {
  error?: string;
};

function trimRequired(value: FormDataEntryValue | null): string {
  if (value == null || typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function trimOrNull(value: FormDataEntryValue | null): string | null {
  if (value == null || typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function enforceMaxLength(
  label: string,
  value: string,
  max: number,
): PaymentScheduleFormState | null {
  if (value.length > max) {
    return { error: `${label} is too long (max ${max} characters).` };
  }
  return null;
}

/**
 * Adds a payment schedule item to a draft quote.
 */
export async function addPaymentScheduleItemAction(
  quoteId: string,
  _prevState: PaymentScheduleFormState,
  formData: FormData,
): Promise<PaymentScheduleFormState> {
  const ctx = await getCommercialRequestContextOrThrow();
  const qid = quoteId.trim();

  const title = trimRequired(formData.get("title"));
  if (!title) return { error: "Title is required." };
  const titleErr = enforceMaxLength("Title", title, QUOTE_PAYMENT_SCHEDULE_FIELD_LIMITS.title);
  if (titleErr) return titleErr;

  const amountRaw = trimOrNull(formData.get("amountDollars"));
  const percentageRaw = trimOrNull(formData.get("percentage"));
  const anchorType = formData.get("anchorType") as PaymentScheduleAnchorType;
  const anchorStageId = trimOrNull(formData.get("anchorStageId"));

  let amountCents: number | null = null;
  if (amountRaw) {
    const p = parseUsdStringToCents(amountRaw);
    if (!p.ok) return { error: p.error };
    amountCents = p.cents;
  }

  let percentage: Prisma.Decimal | null = null;
  if (percentageRaw) {
    const p = parsePercentageString(percentageRaw);
    if (!p.ok) return { error: p.error };
    percentage = p.decimal;
  }

  try {
    await db.$transaction(async (tx) => {
      const quote = await tx.quote.findFirst({
        where: { id: qid, organizationId: ctx.organizationId, status: QuoteStatus.DRAFT },
        select: { id: true },
      });
      if (!quote) throw new Error("QUOTE_NOT_FOUND");

      const agg = await tx.paymentScheduleItem.aggregate({
        where: { quoteId: qid },
        _max: { sortOrder: true },
      });
      const nextOrder = (agg._max.sortOrder ?? -1) + 1;

      await tx.paymentScheduleItem.create({
        data: {
          quoteId: qid,
          title,
          amountCents,
          percentage,
          anchorType,
          anchorStageId,
          sortOrder: nextOrder,
        },
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "QUOTE_NOT_FOUND") {
      return { error: "Quote not found or not a draft." };
    }
    throw e;
  }

  revalidatePath(`/quotes/${qid}`);
  return {};
}

/**
 * Updates a payment schedule item on a draft quote.
 */
export async function updatePaymentScheduleItemAction(
  quoteId: string,
  itemId: string,
  _prevState: PaymentScheduleFormState,
  formData: FormData,
): Promise<PaymentScheduleFormState> {
  const ctx = await getCommercialRequestContextOrThrow();
  const qid = quoteId.trim();
  const iid = itemId.trim();

  const title = trimRequired(formData.get("title"));
  if (!title) return { error: "Title is required." };
  const titleErr = enforceMaxLength("Title", title, QUOTE_PAYMENT_SCHEDULE_FIELD_LIMITS.title);
  if (titleErr) return titleErr;

  const amountRaw = trimOrNull(formData.get("amountDollars"));
  const percentageRaw = trimOrNull(formData.get("percentage"));
  const anchorType = formData.get("anchorType") as PaymentScheduleAnchorType;
  const anchorStageId = trimOrNull(formData.get("anchorStageId"));

  let amountCents: number | null = null;
  if (amountRaw) {
    const p = parseUsdStringToCents(amountRaw);
    if (!p.ok) return { error: p.error };
    amountCents = p.cents;
  }

  let percentage: Prisma.Decimal | null = null;
  if (percentageRaw) {
    const p = parsePercentageString(percentageRaw);
    if (!p.ok) return { error: p.error };
    percentage = p.decimal;
  }

  const result = await db.paymentScheduleItem.updateMany({
    where: {
      id: iid,
      quoteId: qid,
      quote: { organizationId: ctx.organizationId, status: QuoteStatus.DRAFT },
    },
    data: {
      title,
      amountCents,
      percentage,
      anchorType,
      anchorStageId,
    },
  });

  if (result.count === 0) {
    return { error: "Payment item not found or quote not a draft." };
  }

  revalidatePath(`/quotes/${qid}`);
  return {};
}

/**
 * Deletes a payment schedule item from a draft quote.
 */
export async function deletePaymentScheduleItemAction(
  quoteId: string,
  itemId: string,
  _prevState: PaymentScheduleFormState,
  _formData: FormData,
): Promise<PaymentScheduleFormState> {
  const ctx = await getCommercialRequestContextOrThrow();
  const qid = quoteId.trim();
  const iid = itemId.trim();

  try {
    await db.$transaction(async (tx) => {
      const item = await tx.paymentScheduleItem.findFirst({
        where: {
          id: iid,
          quoteId: qid,
          quote: { organizationId: ctx.organizationId, status: QuoteStatus.DRAFT },
        },
        select: { id: true },
      });
      if (!item) throw new Error("ITEM_NOT_FOUND");

      await tx.paymentScheduleItem.delete({ where: { id: iid } });

      // Renumber sort orders
      const remaining = await tx.paymentScheduleItem.findMany({
        where: { quoteId: qid },
        orderBy: { sortOrder: "asc" },
        select: { id: true },
      });
      for (let i = 0; i < remaining.length; i++) {
        await tx.paymentScheduleItem.update({
          where: { id: remaining[i].id },
          data: { sortOrder: i },
        });
      }
    });
  } catch (e) {
    if (e instanceof Error && e.message === "ITEM_NOT_FOUND") {
      return { error: "Payment item not found or quote not a draft." };
    }
    throw e;
  }

  revalidatePath(`/quotes/${qid}`);
  return {};
}

/**
 * Reorders payment schedule items.
 */
export async function reorderPaymentScheduleItemsAction(
  quoteId: string,
  itemIds: string[],
): Promise<PaymentScheduleFormState> {
  const ctx = await getCommercialRequestContextOrThrow();
  const qid = quoteId.trim();

  try {
    await db.$transaction(async (tx) => {
      const quote = await tx.quote.findFirst({
        where: { id: qid, organizationId: ctx.organizationId, status: QuoteStatus.DRAFT },
        select: { id: true },
      });
      if (!quote) throw new Error("QUOTE_NOT_FOUND");

      for (let i = 0; i < itemIds.length; i++) {
        await tx.paymentScheduleItem.updateMany({
          where: { id: itemIds[i], quoteId: qid },
          data: { sortOrder: i },
        });
      }
    });
  } catch (e) {
    if (e instanceof Error && e.message === "QUOTE_NOT_FOUND") {
      return { error: "Quote not found or not a draft." };
    }
    throw e;
  }

  revalidatePath(`/quotes/${qid}`);
  return {};
}
