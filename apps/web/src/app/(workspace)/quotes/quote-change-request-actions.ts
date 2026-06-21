"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCommercialRequestContextOrThrow } from "@/lib/auth-context";
import { performReviseQuoteByClone } from "@/lib/quote/revise-by-clone";

export type QuoteChangeRequestActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function setQuoteChangeRequestVisitRequirementAction(
  changeRequestId: string,
  requiresVisit: boolean,
): Promise<QuoteChangeRequestActionResult> {
  const ctx = await getCommercialRequestContextOrThrow();
  const row = await db.quoteChangeRequest.findFirst({
    where: { id: changeRequestId, organizationId: ctx.organizationId },
    select: { id: true, quoteId: true, quote: { select: { leadId: true } } },
  });
  if (!row) return { ok: false, error: "Change request not found." };

  await db.quoteChangeRequest.update({
    where: { id: row.id },
    data: { requiresVisit },
  });

  revalidatePath(`/quotes/${row.quoteId}`);
  if (row.quote.leadId) revalidatePath(`/leads/${row.quote.leadId}`);
  revalidatePath("/leads");
  revalidatePath("/workstation");
  return { ok: true };
}

export async function resolveQuoteChangeRequestAction(
  changeRequestId: string,
  resultingQuoteId?: string | null,
): Promise<QuoteChangeRequestActionResult> {
  const ctx = await getCommercialRequestContextOrThrow();
  const row = await db.quoteChangeRequest.findFirst({
    where: { id: changeRequestId, organizationId: ctx.organizationId },
    select: {
      id: true,
      quoteId: true,
      resolvedAt: true,
      quote: { select: { leadId: true } },
    },
  });
  if (!row) return { ok: false, error: "Change request not found." };
  if (row.resolvedAt) return { ok: true };

  if (resultingQuoteId) {
    const resulting = await db.quote.findFirst({
      where: { id: resultingQuoteId, organizationId: ctx.organizationId },
      select: { id: true, revisionOfQuoteId: true },
    });
    if (!resulting) {
      return { ok: false, error: "Resulting quote not found in your organization." };
    }
    const source = await db.quote.findFirst({
      where: { id: row.quoteId, organizationId: ctx.organizationId },
      select: { id: true, revisionOfQuoteId: true },
    });
    const sourceRoot = source?.revisionOfQuoteId ?? source?.id;
    const resultingRoot = resulting.revisionOfQuoteId ?? resulting.id;
    if (sourceRoot && resultingRoot !== sourceRoot && resulting.id !== row.quoteId) {
      return {
        ok: false,
        error: "Resulting quote is not part of this quote revision lineage.",
      };
    }
  }

  await db.quoteChangeRequest.update({
    where: { id: row.id },
    data: {
      resolvedAt: new Date(),
      resolvedByUserId: ctx.userId,
      resultingQuoteId: resultingQuoteId ?? null,
    },
  });

  revalidatePath(`/quotes/${row.quoteId}`);
  if (row.quote.leadId) revalidatePath(`/leads/${row.quote.leadId}`);
  revalidatePath("/leads");
  revalidatePath("/workstation");
  return { ok: true };
}

export async function createFollowUpVisitForQuoteChangeRequestAction(
  changeRequestId: string,
): Promise<QuoteChangeRequestActionResult> {
  const ctx = await getCommercialRequestContextOrThrow();
  const row = await db.quoteChangeRequest.findFirst({
    where: { id: changeRequestId, organizationId: ctx.organizationId },
    select: {
      id: true,
      quoteId: true,
      quote: { select: { leadId: true } },
    },
  });
  if (!row?.quote.leadId) {
    return { ok: false, error: "Change request is not linked to a lead opportunity." };
  }

  const existingPending = await db.leadVisitRequest.findFirst({
    where: {
      organizationId: ctx.organizationId,
      leadId: row.quote.leadId,
      status: "PENDING",
      purpose: "REVISION_VERIFICATION",
    },
    select: { id: true },
  });
  if (!existingPending) {
    await db.leadVisitRequest.create({
      data: {
        organizationId: ctx.organizationId,
        leadId: row.quote.leadId,
        purpose: "REVISION_VERIFICATION",
        status: "PENDING",
        notes: "Follow-up visit requested from customer change request.",
      },
    });
  }

  await db.quoteChangeRequest.update({
    where: { id: row.id },
    data: { requiresVisit: true },
  });

  revalidatePath(`/quotes/${row.quoteId}`);
  revalidatePath(`/leads/${row.quote.leadId}`);
  revalidatePath("/leads");
  revalidatePath("/workstation");
  revalidatePath("/schedule");
  return { ok: true };
}

export async function createRevisionDraftForQuoteChangeRequestAction(
  changeRequestId: string,
): Promise<QuoteChangeRequestActionResult & { revisedQuoteId?: string }> {
  const ctx = await getCommercialRequestContextOrThrow();
  const row = await db.quoteChangeRequest.findFirst({
    where: { id: changeRequestId, organizationId: ctx.organizationId },
    select: {
      id: true,
      quoteId: true,
      quote: { select: { leadId: true } },
    },
  });
  if (!row) return { ok: false, error: "Change request not found." };

  const revised = await performReviseQuoteByClone(row.quoteId);
  if (!revised.ok) return { ok: false, error: revised.error };

  revalidatePath(`/quotes/${row.quoteId}`);
  if (revised.revisedQuoteId) revalidatePath(`/quotes/${revised.revisedQuoteId}`);
  if (row.quote.leadId) revalidatePath(`/leads/${row.quote.leadId}`);
  revalidatePath("/leads");
  revalidatePath("/workstation");
  return { ok: true, revisedQuoteId: revised.revisedQuoteId };
}
